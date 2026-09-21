// Marketplace B2B (chantier 10) — côté restaurant : annuaire des fournisseurs plateforme, commande « plateforme »,
// achats groupés. Le fournisseur plateforme est automatiquement « importé » comme fournisseur privé du restaurant
// (table suppliers, vendorId renseigné) : tout le reste de l'app (comparateur, panier, réception, écarts) fonctionne tel quel.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb, vendors, vendorOffers, suppliers, supplierOffers, priceHistory, products, orders, orderLines, groupBuys, groupBuyParticipations, restaurants, inventoryItems, recurringOrders, users, restaurantMembers } from '@afrisupply/db';
import { nextOrderReference } from '../lib/reference.js';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import { sendMail } from '../lib/mailer.js';
import { sendMessage } from '../lib/sms.js';
import { logOrderEvent } from '../lib/order-events.js';
import { APP_URL } from '../jobs/daily.js';

export const marketplaceRoutes = new Hono<Env>();
marketplaceRoutes.use('*', requireAuth, requireRestaurant);
const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

/** Zone d'un restaurant = ville (normalisée) + département. */
export function restaurantZones(r: { city: string | null; postalCode?: string | null }) {
  const z = new Set<string>(['France']);
  if (r.city) z.add(r.city.trim().toLowerCase());
  if (r.postalCode) z.add(r.postalCode.slice(0, 2));
  return z;
}
const servesZone = (v: { deliveryZones: string[] }, zones: Set<string>) => v.deliveryZones.length === 0 || v.deliveryZones.some((d) => zones.has(d.trim().toLowerCase()) || zones.has(d));

/** Annuaire : fournisseurs actifs qui livrent la zone du restaurant, avec nb d'offres et couverture de mon stock. */
marketplaceRoutes.get('/marketplace/vendors', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, rid)); const zones = restaurantZones(r);
  const all = await db.select().from(vendors).where(eq(vendors.status, 'actif'));
  const mine = new Set((await db.select({ productId: inventoryItems.productId }).from(inventoryItems).where(eq(inventoryItems.restaurantId, rid))).map((x) => x.productId));
  const linked = new Map((await db.select({ vendorId: suppliers.vendorId, supplierId: suppliers.id }).from(suppliers).where(and(eq(suppliers.restaurantId, rid), sql`${suppliers.vendorId} is not null`))).map((x) => [x.vendorId!, x.supplierId]));
  const offers = await db.select({ vendorId: vendorOffers.vendorId, productId: vendorOffers.productId }).from(vendorOffers).where(eq(vendorOffers.inStock, true));
  const out = all.filter((v) => servesZone(v, zones)).map((v) => {
    const vo = offers.filter((o) => o.vendorId === v.id); const covered = new Set(vo.filter((o) => mine.has(o.productId)).map((o) => o.productId)).size;
    return { ...v, offerCount: vo.length, coversMyProducts: covered, myProductCount: mine.size, linkedSupplierId: linked.get(v.id) ?? null };
  }).sort((a, b) => b.coversMyProducts - a.coversMyProducts);
  return c.json({ vendors: out, zones: [...zones] });
});

/** Fiche + catalogue d'un fournisseur plateforme, avec comparaison à mon meilleur prix actuel. */
marketplaceRoutes.get('/marketplace/vendors/:id', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const vid = c.req.param('id');
  const [v] = await db.select().from(vendors).where(and(eq(vendors.id, vid), eq(vendors.status, 'actif'))); if (!v) return c.json({ error: 'Fournisseur introuvable' }, 404);
  const rows = await db.select({ offer: vendorOffers, product: products }).from(vendorOffers).innerJoin(products, eq(products.id, vendorOffers.productId)).where(eq(vendorOffers.vendorId, vid)).orderBy(products.category, products.name);
  const myBest = new Map<string, number>();
  for (const o of await db.select({ productId: supplierOffers.productId, unit: sql<number>`min(${supplierOffers.packPriceEur} / ${supplierOffers.packQty})` }).from(supplierOffers).where(eq(supplierOffers.restaurantId, rid)).groupBy(supplierOffers.productId)) myBest.set(o.productId, n(o.unit));
  const mine = new Set((await db.select({ productId: inventoryItems.productId }).from(inventoryItems).where(eq(inventoryItems.restaurantId, rid))).map((x) => x.productId));
  const [link] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.restaurantId, rid), eq(suppliers.vendorId, vid)));
  const offers = rows.map(({ offer, product }) => { const unit = n(offer.packPriceEur) / n(offer.packQty); const best = myBest.get(product.id); return { ...offer, productName: product.name, category: product.category, unit: product.baseUnit, unitPrice: Math.round(unit * 10000) / 10000, myBestUnitPrice: best ?? null, savingPct: best ? Math.round(((best - unit) / best) * 1000) / 10 : null, tracked: mine.has(product.id) }; });
  const gbs = await db.select().from(groupBuys).where(and(eq(groupBuys.vendorId, vid), eq(groupBuys.status, 'ouvert'), gte(groupBuys.closesAt, new Date())));
  return c.json({ vendor: v, offers, linkedSupplierId: link?.id ?? null, groupBuys: gbs });
});

/** Lier un fournisseur plateforme à mon restaurant : crée/rafraîchit le fournisseur privé + copie du catalogue (offres + historique). */
export async function linkVendor(rid: string, vid: string) {
  const db = await getDb();
  const [v] = await db.select().from(vendors).where(and(eq(vendors.id, vid), eq(vendors.status, 'actif'))); if (!v) return null;
  let [sup] = await db.select().from(suppliers).where(and(eq(suppliers.restaurantId, rid), eq(suppliers.vendorId, vid)));
  if (!sup) {
    [sup] = await db.insert(suppliers).values({ restaurantId: rid, vendorId: vid, name: v.name, contactName: null, email: v.contactEmail, phone: v.contactPhone, whatsapp: v.whatsapp, city: v.city, categories: v.categories, leadTimeHours: v.leadTimeHours, deliveryDays: v.deliveryDays, minOrderEur: v.minOrderEur, deliveryFeeEur: v.deliveryFeeEur, preferredChannel: 'plateforme', notes: `Fournisseur AFRISUPPLY Marketplace — ${v.description ?? ''}`.trim() }).returning();
  }
  const vo = await db.select().from(vendorOffers).where(and(eq(vendorOffers.vendorId, vid), eq(vendorOffers.inStock, true)));
  let synced = 0;
  for (const o of vo) {
    const [offer] = await db.insert(supplierOffers).values({ restaurantId: rid, supplierId: sup.id, productId: o.productId, packLabel: o.packLabel, packQty: o.packQty, packPriceEur: o.packPriceEur, inStock: true })
      .onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: o.packQty, packPriceEur: o.packPriceEur, inStock: true, lastSeenAt: new Date() } }).returning();
    await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: (n(o.packPriceEur) / n(o.packQty)).toFixed(4), source: 'catalogue' }); synced++;
  }
  return { supplier: sup, synced };
}
marketplaceRoutes.post('/marketplace/vendors/:id/link', async (c) => {
  const res = await linkVendor(c.get('restaurantId'), c.req.param('id')); if (!res) return c.json({ error: 'Fournisseur introuvable' }, 404);
  return c.json({ ok: true, supplierId: res.supplier.id, offersSynced: res.synced, message: `${res.supplier.name} ajouté à vos fournisseurs : ${res.synced} prix importés. Le comparateur et le panier en tiennent compte dès maintenant.` });
});

/** Commande plateforme : passe par le fournisseur privé lié, statut « envoyee » immédiat, le fournisseur confirme dans son espace. */
/** Cœur de la commande plateforme (utilisé par le panier, « Recommander » et les commandes récurrentes). */
export async function placeVendorOrder(rid: string, vid: string, userId: string | null, input: { lines: { vendorOfferId: string; packs: number }[]; notes?: string; source?: string; skipMin?: boolean }): Promise<{ ok: true; order: typeof orders.$inferSelect; total: number; vendorName: string } | { ok: false; error: string; status: number }> {
  const db = await getDb();
  const link = await linkVendor(rid, vid); if (!link) return { ok: false, error: 'Fournisseur introuvable', status: 404 };
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vid)); if (v.status !== 'actif') return { ok: false, error: `${v.name} n'est plus actif sur la plateforme`, status: 400 };
  const vo = await db.select().from(vendorOffers).where(and(eq(vendorOffers.vendorId, vid), inArray(vendorOffers.id, input.lines.map((l) => l.vendorOfferId))));
  if (vo.length !== input.lines.length) return { ok: false, error: 'Offre invalide', status: 400 };
  const out = vo.filter((o) => !o.inStock); if (out.length) return { ok: false, error: `Plus disponible chez ${v.name} : ${out.map((o) => o.packLabel).join(', ')}`, status: 400 };
  const linesData = input.lines.map((l) => { const o = vo.find((x) => x.id === l.vendorOfferId)!; return { productId: o.productId, packLabel: o.packLabel, packs: l.packs, quantity: (l.packs * n(o.packQty)).toFixed(3), unitPriceEur: (n(o.packPriceEur) / n(o.packQty)).toFixed(4), lineTotalEur: (l.packs * n(o.packPriceEur)).toFixed(2) }; });
  const total = linesData.reduce((a, l) => a + Number(l.lineTotalEur), 0);
  if (!input.skipMin && total < n(v.minOrderEur)) return { ok: false, error: `Minimum de commande ${eur(n(v.minOrderEur))} chez ${v.name} (panier : ${eur(total)})`, status: 400 };
  const reference = await nextOrderReference();
  const [order] = await db.insert(orders).values({ restaurantId: rid, supplierId: link.supplier.id, vendorId: vid, reference, status: 'envoyee', channel: 'plateforme', sentAt: new Date(), expectedAt: new Date(Date.now() + v.leadTimeHours * 3_600_000).toISOString().slice(0, 10), totalEur: total.toFixed(2), deliveryFeeEur: v.deliveryFeeEur, source: input.source ?? 'marketplace', notes: input.notes, createdBy: userId }).returning();
  const priv = await db.select().from(supplierOffers).where(eq(supplierOffers.supplierId, link.supplier.id));
  await db.insert(orderLines).values(linesData.map((l) => ({ ...l, orderId: order.id, offerId: priv.find((p) => p.productId === l.productId && p.packLabel === l.packLabel)?.id ?? null })));
  const [r] = await db.select({ name: restaurants.name, city: restaurants.city }).from(restaurants).where(eq(restaurants.id, rid));
  if (v.contactEmail) void sendMail({ to: v.contactEmail, subject: `Nouvelle commande ${reference} — ${r.name}${r.city ? ` (${r.city})` : ''} — ${eur(total)}`, text: `Bonjour,\n\n${r.name} vous passe commande via AFRISUPPLY :\n${linesData.map((l) => `• ${l.packs} × ${l.packLabel} — ${eur(Number(l.lineTotalEur))}`).join('\n')}\nTotal : ${eur(total)}\n\nConfirmez ou refusez en un clic : ${APP_URL()}/fournisseur/commandes\n`, html: `<p>Bonjour,</p><p><b>${r.name}</b> vous passe commande via AFRISUPPLY :</p><ul>${linesData.map((l) => `<li>${l.packs} × ${l.packLabel} — ${eur(Number(l.lineTotalEur))}</li>`).join('')}</ul><p><b>Total : ${eur(total)}</b></p><p><a href="${APP_URL()}/fournisseur/commandes">Confirmer ou refuser</a></p>`, tags: { type: 'vendor_order' } });
  void logOrderEvent(order.id, 'sent', `Commande envoyée à ${v.name}${input.source === 'recurrente' ? ' (commande récurrente)' : input.source === 'recommande' ? ' (recommande)' : ''}`, 'restaurant', { total });
  const phone = v.whatsapp || v.contactPhone;
  if (phone) void sendMessage({ to: phone, prefer: v.whatsapp ? 'whatsapp' : 'sms', kind: 'order.new', orderId: order.id, vendorId: vid, restaurantId: rid, body: `AFRISUPPLY — Nouvelle commande ${reference}\n${r.name}${r.city ? ` (${r.city})` : ''} — ${eur(total)}\n${linesData.slice(0, 6).map((l) => `• ${l.packs} × ${l.packLabel}`).join('\n')}${linesData.length > 6 ? `\n… +${linesData.length - 6} lignes` : ''}\nConfirmer / refuser : ${APP_URL()}/fournisseur/commandes` });
  return { ok: true, order, total, vendorName: v.name };
}

marketplaceRoutes.post('/marketplace/vendors/:id/orders', async (c) => {
  const rid = c.get('restaurantId'); const user = c.get('user'); const vid = c.req.param('id');
  const body = z.object({ lines: z.array(z.object({ vendorOfferId: z.string().uuid(), packs: z.number().int().positive() })).min(1), notes: z.string().max(300).optional(), source: z.string().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const res = await placeVendorOrder(rid, vid, user.id, body.data); if (!res.ok) return c.json({ error: res.error }, res.status as 400);
  return c.json({ order: res.order, message: `Commande ${res.order.reference} envoyée à ${res.vendorName} (${eur(res.total)}). Vous serez prévenu dès confirmation.` }, 201);
});

// ---------------- Chantier 24 : recommander en 1 clic + commandes récurrentes ----------------
/** Recommander : reconstruit la commande à partir des offres actuelles du grossiste (prix du jour, indisponibles signalés). */
marketplaceRoutes.get('/orders/:id/reorder-preview', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [o] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid))); if (!o?.vendorId) return c.json({ error: 'Commande plateforme introuvable' }, 404);
  const lines = await db.select({ l: orderLines, productName: products.name }).from(orderLines).innerJoin(products, eq(products.id, orderLines.productId)).where(eq(orderLines.orderId, o.id));
  const offers = await db.select().from(vendorOffers).where(eq(vendorOffers.vendorId, o.vendorId));
  const [v] = await db.select({ name: vendors.name, status: vendors.status, minOrderEur: vendors.minOrderEur }).from(vendors).where(eq(vendors.id, o.vendorId));
  const items = lines.map(({ l, productName }) => { const off = offers.find((x) => x.productId === l.productId && x.packLabel === l.packLabel) ?? offers.find((x) => x.productId === l.productId); return { productName, packLabel: off?.packLabel ?? l.packLabel, packs: n(l.packs), vendorOfferId: off?.id ?? null, available: !!off?.inStock, oldPackPrice: Math.round(n(l.lineTotalEur) / Math.max(1, n(l.packs)) * 100) / 100, newPackPrice: off ? n(off.packPriceEur) : null }; });
  const total = items.reduce((a, i) => a + (i.available && i.newPackPrice !== null ? i.packs * i.newPackPrice : 0), 0);
  return c.json({ vendor: { id: o.vendorId, ...v }, items, total: Math.round(total * 100) / 100, oldTotal: n(o.totalEur) });
});
marketplaceRoutes.post('/orders/:id/reorder', async (c) => {
  const rid = c.get('restaurantId'); const user = c.get('user'); const db = await getDb();
  const body = z.object({ lines: z.array(z.object({ vendorOfferId: z.string().uuid(), packs: z.number().int().positive() })).min(1).optional(), notes: z.string().max(300).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const [o] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid))); if (!o?.vendorId) return c.json({ error: 'Commande plateforme introuvable' }, 404);
  let lines = body.data.lines;
  if (!lines) { const prev = await db.select().from(orderLines).where(eq(orderLines.orderId, o.id)); const offers = await db.select().from(vendorOffers).where(and(eq(vendorOffers.vendorId, o.vendorId), eq(vendorOffers.inStock, true))); lines = prev.map((l) => { const off = offers.find((x) => x.productId === l.productId && x.packLabel === l.packLabel) ?? offers.find((x) => x.productId === l.productId); return off ? { vendorOfferId: off.id, packs: n(l.packs) } : null; }).filter((x): x is { vendorOfferId: string; packs: number } => !!x); }
  if (!lines.length) return c.json({ error: 'Aucun produit de cette commande n’est disponible actuellement' }, 400);
  const res = await placeVendorOrder(rid, o.vendorId, user.id, { lines, notes: body.data.notes ?? o.notes ?? undefined, source: 'recommande' }); if (!res.ok) return c.json({ error: res.error }, res.status as 400);
  return c.json({ order: res.order, message: `Commande ${res.order.reference} renvoyée à ${res.vendorName} (${eur(res.total)}).` }, 201);
});

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export function nextRunOn(weekdays: number[], from = new Date()): string | null {
  if (!weekdays.length) return null;
  for (let i = 1; i <= 7; i++) { const d = new Date(from); d.setDate(d.getDate() + i); if (weekdays.includes(d.getDay())) return d.toISOString().slice(0, 10); }
  return null;
}
marketplaceRoutes.get('/recurring', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const rows = await db.select({ r: recurringOrders, vendorName: vendors.name }).from(recurringOrders).innerJoin(vendors, eq(vendors.id, recurringOrders.vendorId)).where(eq(recurringOrders.restaurantId, rid)).orderBy(recurringOrders.createdAt);
  const offerIds = [...new Set(rows.flatMap((x) => x.r.lines.map((l) => l.vendorOfferId)))];
  const offers = offerIds.length ? await db.select({ o: vendorOffers, productName: products.name }).from(vendorOffers).innerJoin(products, eq(products.id, vendorOffers.productId)).where(inArray(vendorOffers.id, offerIds)) : [];
  return c.json({ recurring: rows.map(({ r, vendorName }) => ({ ...r, vendorName, daysLabel: r.weekdays.map((d) => DAYS[d]).join(', '), lines: r.lines.map((l) => { const o = offers.find((x) => x.o.id === l.vendorOfferId); return { ...l, productName: o?.productName ?? '?', packLabel: o?.o.packLabel ?? null, packPriceEur: o ? n(o.o.packPriceEur) : null, available: !!o?.o.inStock }; }), estimatedTotal: Math.round(r.lines.reduce((a, l) => { const o = offers.find((x) => x.o.id === l.vendorOfferId); return a + (o ? l.packs * n(o.o.packPriceEur) : 0); }, 0) * 100) / 100 })) });
});
marketplaceRoutes.post('/recurring', async (c) => {
  const rid = c.get('restaurantId'); const user = c.get('user'); const db = await getDb();
  const body = z.object({ vendorId: z.string().uuid().optional(), fromOrderId: z.string().uuid().optional(), name: z.string().min(2).max(60), weekdays: z.array(z.number().int().min(0).max(6)).min(1), mode: z.enum(['auto', 'confirm']).default('auto'), notes: z.string().max(300).optional(), lines: z.array(z.object({ vendorOfferId: z.string().uuid(), packs: z.number().int().positive() })).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  let { vendorId, lines } = body.data;
  if (body.data.fromOrderId) { const [o] = await db.select().from(orders).where(and(eq(orders.id, body.data.fromOrderId), eq(orders.restaurantId, rid))); if (!o?.vendorId) return c.json({ error: 'Commande introuvable' }, 404); vendorId = o.vendorId; if (!lines) { const prev = await db.select().from(orderLines).where(eq(orderLines.orderId, o.id)); const offers = await db.select().from(vendorOffers).where(eq(vendorOffers.vendorId, o.vendorId)); lines = prev.map((l) => { const off = offers.find((x) => x.productId === l.productId && x.packLabel === l.packLabel) ?? offers.find((x) => x.productId === l.productId); return off ? { vendorOfferId: off.id, packs: n(l.packs) } : null; }).filter((x): x is { vendorOfferId: string; packs: number } => !!x); } }
  if (!vendorId || !lines?.length) return c.json({ error: 'Fournisseur et lignes requis' }, 400);
  const [row] = await db.insert(recurringOrders).values({ restaurantId: rid, vendorId, name: body.data.name, weekdays: [...new Set(body.data.weekdays)].sort(), lines, mode: body.data.mode, notes: body.data.notes, nextRunOn: nextRunOn(body.data.weekdays), createdBy: user.id }).returning();
  return c.json({ recurring: row, message: `« ${row.name} » programmée : ${row.weekdays.map((d) => DAYS[d]).join(', ')} (prochaine le ${row.nextRunOn}).` }, 201);
});
marketplaceRoutes.put('/recurring/:id', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({ name: z.string().min(2).max(60).optional(), weekdays: z.array(z.number().int().min(0).max(6)).min(1).optional(), mode: z.enum(['auto', 'confirm']).optional(), enabled: z.boolean().optional(), notes: z.string().max(300).nullable().optional(), lines: z.array(z.object({ vendorOfferId: z.string().uuid(), packs: z.number().int().positive() })).min(1).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const patch: Partial<typeof recurringOrders.$inferInsert> = { ...body.data, notes: body.data.notes ?? undefined }; if (body.data.weekdays) { patch.weekdays = [...new Set(body.data.weekdays)].sort(); patch.nextRunOn = nextRunOn(patch.weekdays); }
  const [row] = await db.update(recurringOrders).set(patch).where(and(eq(recurringOrders.id, c.req.param('id')), eq(recurringOrders.restaurantId, rid))).returning(); if (!row) return c.json({ error: 'Introuvable' }, 404);
  return c.json({ recurring: row });
});
marketplaceRoutes.delete('/recurring/:id', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [row] = await db.delete(recurringOrders).where(and(eq(recurringOrders.id, c.req.param('id')), eq(recurringOrders.restaurantId, rid))).returning(); if (!row) return c.json({ error: 'Introuvable' }, 404);
  return c.json({ ok: true });
});
/** Lancer maintenant (test ou dépannage). */
marketplaceRoutes.post('/recurring/:id/run', async (c) => {
  const rid = c.get('restaurantId'); const user = c.get('user'); const db = await getDb();
  const [r] = await db.select().from(recurringOrders).where(and(eq(recurringOrders.id, c.req.param('id')), eq(recurringOrders.restaurantId, rid))); if (!r) return c.json({ error: 'Introuvable' }, 404);
  const res = await placeVendorOrder(rid, r.vendorId, user.id, { lines: r.lines, notes: r.notes ?? undefined, source: 'recurrente' }); if (!res.ok) return c.json({ error: res.error }, res.status as 400);
  await db.update(recurringOrders).set({ lastRunAt: new Date(), lastOrderId: res.order.id, nextRunOn: nextRunOn(r.weekdays) }).where(eq(recurringOrders.id, r.id));
  return c.json({ order: res.order, message: `Commande ${res.order.reference} envoyée à ${res.vendorName} (${eur(res.total)}).` }, 201);
});

/** Job quotidien : exécute les commandes récurrentes dont nextRunOn = aujourd'hui. */
export async function runRecurringOrders(now = new Date()) {
  const db = await getDb(); const today = now.toISOString().slice(0, 10);
  const due = await db.select().from(recurringOrders).where(and(eq(recurringOrders.enabled, true), eq(recurringOrders.nextRunOn, today)));
  const out: { id: string; name: string; ok: boolean; reference?: string; error?: string }[] = [];
  for (const r of due) {
    if (r.lastRunAt && r.lastRunAt.toISOString().slice(0, 10) === today) continue;
    const res = await placeVendorOrder(r.restaurantId, r.vendorId, r.createdBy, { lines: r.lines, notes: r.notes ?? undefined, source: 'recurrente' });
    const next = nextRunOn(r.weekdays, now);
    if (res.ok) { await db.update(recurringOrders).set({ lastRunAt: now, lastOrderId: res.order.id, nextRunOn: next }).where(eq(recurringOrders.id, r.id)); out.push({ id: r.id, name: r.name, ok: true, reference: res.order.reference }); }
    else { await db.update(recurringOrders).set({ nextRunOn: next }).where(eq(recurringOrders.id, r.id)); out.push({ id: r.id, name: r.name, ok: false, error: res.error });
      const rcpts = await db.select({ email: users.email }).from(restaurantMembers).innerJoin(users, eq(users.id, restaurantMembers.userId)).where(and(eq(restaurantMembers.restaurantId, r.restaurantId), inArray(restaurantMembers.role, ['owner', 'manager'])));
      for (const x of rcpts) void sendMail({ to: x.email, subject: `⚠️ Commande récurrente « ${r.name} » non envoyée`, text: `La commande récurrente « ${r.name} » n'a pas pu être envoyée aujourd'hui : ${res.error}. Vérifiez-la dans Achats → Récurrentes.`, html: `<p>La commande récurrente « <b>${r.name}</b> » n'a pas pu être envoyée aujourd'hui : ${res.error}.</p><p><a href="${APP_URL()}/app/achats">Vérifier</a></p>`, tags: { type: 'recurring' } }); }
  }
  return { date: today, due: due.length, results: out };
}
// ---------------- Achats groupés ----------------
marketplaceRoutes.get('/marketplace/group-buys', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, rid)); const zones = restaurantZones(r);
  const rows = await db.select({ gb: groupBuys, vendorName: vendors.name, offer: vendorOffers, productName: products.name, unit: products.baseUnit })
    .from(groupBuys).innerJoin(vendors, eq(vendors.id, groupBuys.vendorId)).innerJoin(vendorOffers, eq(vendorOffers.id, groupBuys.vendorOfferId)).innerJoin(products, eq(products.id, vendorOffers.productId))
    .where(inArray(groupBuys.status, ['ouvert', 'atteint'])).orderBy(groupBuys.closesAt);
  const ids = rows.map((x) => x.gb.id);
  const parts = ids.length ? await db.select().from(groupBuyParticipations).where(inArray(groupBuyParticipations.groupBuyId, ids)) : [];
  const out = rows.filter((x) => zones.has(x.gb.zone.toLowerCase()) || x.gb.zone === 'France').map((x) => {
    const p = parts.filter((y) => y.groupBuyId === x.gb.id); const committed = p.reduce((a, y) => a + y.packs, 0); const mine = p.find((y) => y.restaurantId === rid);
    const price = n(x.offer.packPriceEur); const disc = price * (1 - n(x.gb.discountPct) / 100);
    return { ...x.gb, vendorName: x.vendorName, productName: x.productName, unit: x.unit, packLabel: x.offer.packLabel, packQty: n(x.offer.packQty), packPrice: price, discountedPackPrice: Math.round(disc * 100) / 100, committedPacks: committed, participants: p.length, progressPct: Math.min(100, Math.round((committed / x.gb.targetPacks) * 100)), myPacks: mine?.packs ?? 0, hoursLeft: Math.max(0, Math.round((new Date(x.gb.closesAt).getTime() - Date.now()) / 3_600_000)) };
  });
  return c.json({ groupBuys: out });
});

marketplaceRoutes.post('/marketplace/group-buys/:id/join', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const id = c.req.param('id');
  const body = z.object({ packs: z.number().int().min(0).max(500) }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: 'Nombre de colis invalide' }, 400);
  const [gb] = await db.select().from(groupBuys).where(eq(groupBuys.id, id)); if (!gb || gb.status !== 'ouvert' || new Date(gb.closesAt) < new Date()) return c.json({ error: 'Achat groupé fermé' }, 400);
  if (body.data.packs === 0) { await db.delete(groupBuyParticipations).where(and(eq(groupBuyParticipations.groupBuyId, id), eq(groupBuyParticipations.restaurantId, rid))); }
  else await db.insert(groupBuyParticipations).values({ groupBuyId: id, restaurantId: rid, packs: body.data.packs }).onConflictDoUpdate({ target: [groupBuyParticipations.groupBuyId, groupBuyParticipations.restaurantId], set: { packs: body.data.packs } });
  const [{ total }] = await db.select({ total: sql<number>`coalesce(sum(${groupBuyParticipations.packs}),0)` }).from(groupBuyParticipations).where(eq(groupBuyParticipations.groupBuyId, id));
  if (n(total) >= gb.targetPacks && gb.status === 'ouvert') await db.update(groupBuys).set({ status: 'atteint' }).where(eq(groupBuys.id, id));
  return c.json({ ok: true, myPacks: body.data.packs, committedPacks: n(total), reached: n(total) >= gb.targetPacks });
});

/** Mes commandes plateforme en attente de confirmation (pour le tableau de bord). */
marketplaceRoutes.get('/marketplace/my-orders', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const rows = await db.select({ order: orders, vendorName: vendors.name }).from(orders).innerJoin(vendors, eq(vendors.id, orders.vendorId)).where(eq(orders.restaurantId, rid)).orderBy(desc(orders.createdAt)).limit(30);
  return c.json({ orders: rows.map((r) => ({ ...r.order, vendorName: r.vendorName })) });
});
