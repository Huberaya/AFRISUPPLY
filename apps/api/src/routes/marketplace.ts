// Marketplace B2B (chantier 10) — côté restaurant : annuaire des fournisseurs plateforme, commande « plateforme »,
// achats groupés. Le fournisseur plateforme est automatiquement « importé » comme fournisseur privé du restaurant
// (table suppliers, vendorId renseigné) : tout le reste de l'app (comparateur, panier, réception, écarts) fonctionne tel quel.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb, vendors, vendorOffers, suppliers, supplierOffers, priceHistory, products, orders, orderLines, groupBuys, groupBuyParticipations, restaurants, inventoryItems } from '@afrisupply/db';
import { nextOrderReference } from '../lib/reference.js';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import { sendMail } from '../lib/mailer.js';
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
marketplaceRoutes.post('/marketplace/vendors/:id/orders', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user'); const vid = c.req.param('id');
  const body = z.object({ lines: z.array(z.object({ vendorOfferId: z.string().uuid(), packs: z.number().int().positive() })).min(1), notes: z.string().max(300).optional(), source: z.string().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const link = await linkVendor(rid, vid); if (!link) return c.json({ error: 'Fournisseur introuvable' }, 404);
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vid));
  const vo = await db.select().from(vendorOffers).where(and(eq(vendorOffers.vendorId, vid), inArray(vendorOffers.id, body.data.lines.map((l) => l.vendorOfferId))));
  if (vo.length !== body.data.lines.length) return c.json({ error: 'Offre invalide' }, 400);
  const linesData = body.data.lines.map((l) => { const o = vo.find((x) => x.id === l.vendorOfferId)!; return { productId: o.productId, packLabel: o.packLabel, packs: l.packs, quantity: (l.packs * n(o.packQty)).toFixed(3), unitPriceEur: (n(o.packPriceEur) / n(o.packQty)).toFixed(4), lineTotalEur: (l.packs * n(o.packPriceEur)).toFixed(2) }; });
  const total = linesData.reduce((a, l) => a + Number(l.lineTotalEur), 0);
  if (total < n(v.minOrderEur)) return c.json({ error: `Minimum de commande ${eur(n(v.minOrderEur))} chez ${v.name} (panier : ${eur(total)})` }, 400);
  const reference = await nextOrderReference();
  const [order] = await db.insert(orders).values({ restaurantId: rid, supplierId: link.supplier.id, vendorId: vid, reference, status: 'envoyee', channel: 'plateforme', sentAt: new Date(), expectedAt: new Date(Date.now() + v.leadTimeHours * 3_600_000).toISOString().slice(0, 10), totalEur: total.toFixed(2), deliveryFeeEur: v.deliveryFeeEur, source: body.data.source ?? 'marketplace', notes: body.data.notes, createdBy: user.id }).returning();
  // rattache les lignes aux offres privées synchronisées (pour l'historique de prix à la réception)
  const priv = await db.select().from(supplierOffers).where(eq(supplierOffers.supplierId, link.supplier.id));
  await db.insert(orderLines).values(linesData.map((l) => ({ ...l, orderId: order.id, offerId: priv.find((p) => p.productId === l.productId && p.packLabel === l.packLabel)?.id ?? null })));
  const [r] = await db.select({ name: restaurants.name, city: restaurants.city }).from(restaurants).where(eq(restaurants.id, rid));
  if (v.contactEmail) void sendMail({ to: v.contactEmail, subject: `Nouvelle commande ${reference} — ${r.name}${r.city ? ` (${r.city})` : ''} — ${eur(total)}`, text: `Bonjour,\n\n${r.name} vous passe commande via AFRISUPPLY :\n${linesData.map((l) => `• ${l.packs} × ${l.packLabel} — ${eur(Number(l.lineTotalEur))}`).join('\n')}\nTotal : ${eur(total)}\n\nConfirmez ou refusez en un clic : ${APP_URL()}/fournisseur/commandes\n`, html: `<p>Bonjour,</p><p><b>${r.name}</b> vous passe commande via AFRISUPPLY :</p><ul>${linesData.map((l) => `<li>${l.packs} × ${l.packLabel} — ${eur(Number(l.lineTotalEur))}</li>`).join('')}</ul><p><b>Total : ${eur(total)}</b></p><p><a href="${APP_URL()}/fournisseur/commandes">Confirmer ou refuser</a></p>`, tags: { type: 'vendor_new_order' } });
  return c.json({ order, message: `Commande ${reference} envoyée à ${v.name} (${eur(total)}). Vous serez prévenu dès confirmation.` }, 201);
});

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
