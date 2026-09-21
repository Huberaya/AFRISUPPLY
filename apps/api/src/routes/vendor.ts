// Espace fournisseur (chantier 10) : inscription, catalogue, commandes reçues (confirmer / refuser / livrer),
// achats groupés (créer / clôturer → commandes), commissions. Un utilisateur peut être membre d'un ou plusieurs vendors.
import { Hono, type Context, type Next } from 'hono';
import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, vendors, vendorMembers, vendorOffers, products, orders, orderLines, restaurants, restaurantMembers, users, groupBuys, groupBuyParticipations, commissions, commissionInvoices, suppliers, supplierOffers, priceHistory } from '@afrisupply/db';
import { similarity } from '../lib/quick.js';
import { nextOrderReference } from '../lib/reference.js';
import { requireAuth, type Env } from '../lib/auth.js';
import { sendMail } from '../lib/mailer.js';
import { sendMessage, waLink } from '../lib/sms.js';
import { maybeRemind } from '../jobs/reminders.js';
import { VENDOR_CGV_VERSION } from '../lib/cgv.js';
import { logOrderEvent, orderTimeline } from '../lib/order-events.js';
import { vendorPriceTiers, vendorCustomerPrices } from '@afrisupply/db';
import { audit } from '../lib/ops.js';
import { readVendorInvite } from './prospects.js';
import { orderPdf, commissionPdf } from '../lib/pdf.js';
// Chantier 8 de l'audit 2 : moyen de paiement du fournisseur (commissions par prélèvement ou relevé).
import { stripeConfigured, vendorPaymentState, vendorBillingRecipient, createVendorSetupSession, applyVendorSetup, vendorCommissionInvoices } from '../lib/billing.js';
import { restaurantZones } from './marketplace.js';
import { inventoryItems, leads } from '@afrisupply/db';
import { prospects } from '@afrisupply/db';
import { APP_URL } from '../jobs/daily.js';

type VEnv = { Variables: Env['Variables'] & { vendorId: string } };
export const vendorRoutes = new Hono<VEnv>();
const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const isAdmin = (email: string) => (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

/** Résout le vendor courant (header X-Vendor-Id ou 1er du membre). */
async function requireVendor(c: Context<VEnv>, next: Next) {
  const db = await getDb(); const user = c.get('user'); const wanted = c.req.header('x-vendor-id');
  const rows = await db.select({ vendorId: vendorMembers.vendorId }).from(vendorMembers).where(eq(vendorMembers.userId, user.id));
  const vid = wanted && rows.some((r) => r.vendorId === wanted) ? wanted : rows[0]?.vendorId;
  if (!vid) return c.json({ error: 'Aucun espace fournisseur pour ce compte' }, 403);
  // Chantier 22 : les actions commerciales exigent la version courante des CGV fournisseur (lecture toujours possible)
  if (c.req.method !== 'GET') { const [v] = await db.select({ cgv: vendors.cgvVersion }).from(vendors).where(eq(vendors.id, vid)); if (v && v.cgv !== VENDOR_CGV_VERSION) return c.json({ error: `Merci d'accepter la nouvelle version (${VENDOR_CGV_VERSION}) des conditions fournisseur pour continuer.`, code: 'cgv_outdated' }, 428); }
  c.set('vendorId', vid); await next();
}

// ---- inscription (compte utilisateur existant requis : le fournisseur crée d'abord un compte AFRISUPPLY) ----
vendorRoutes.post('/vendor/register', requireAuth, async (c) => {
  const body = z.object({
    name: z.string().min(2), description: z.string().max(500).optional(), city: z.string().optional(), deliveryZones: z.array(z.string().min(1)).max(30).default([]),
    categories: z.array(z.enum(['feculents', 'frais', 'viandes_poissons', 'epicerie', 'boissons', 'emballages'])).default([]),
    leadTimeHours: z.number().int().positive().default(48), minOrderEur: z.number().nonnegative().default(0), deliveryFeeEur: z.number().nonnegative().default(0),
    contactEmail: z.string().email().optional(), contactPhone: z.string().optional(), whatsapp: z.string().optional(), invite: z.string().optional(), acceptCgv: z.boolean().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  if (!body.data.acceptCgv) return c.json({ error: 'Vous devez accepter les conditions générales fournisseur.', code: 'cgv_required' }, 400);
  const db = await getDb(); const user = c.get('user'); const { invite, acceptCgv: _a, ...d } = body.data; void _a;
  const inv = invite ? await readVendorInvite(invite) : null; // invité par l'équipe AFRISUPPLY = déjà vérifié → actif immédiatement
  const [v] = await db.insert(vendors).values({ ...d, cgvVersion: VENDOR_CGV_VERSION, cgvAcceptedAt: new Date(), cgvAcceptedBy: user.email, slug: `${slugify(d.name)}-${user.id.slice(0, 6)}`, contactEmail: d.contactEmail ?? user.email, deliveryZones: d.deliveryZones.map((z) => z.trim().toLowerCase()), minOrderEur: d.minOrderEur.toFixed(2), deliveryFeeEur: d.deliveryFeeEur.toFixed(2), status: inv || process.env.VENDOR_AUTO_APPROVE === 'true' ? 'actif' : 'en_attente' }).returning();
  if (inv) await db.update(prospects).set({ status: 'converti', email: user.email, updatedAt: new Date() }).where(eq(prospects.id, inv.pid));
  await db.insert(vendorMembers).values({ vendorId: v.id, userId: user.id, role: 'owner' });
  await audit('vendor.register', { actorEmail: user.email, target: v.id, meta: { name: v.name, invited: !!inv } });
  return c.json({ vendor: v, message: v.status === 'actif' ? 'Espace fournisseur activé.' : 'Demande enregistrée : votre espace sera activé après vérification (sous 24 h ouvrées).' }, 201);
});

vendorRoutes.get('/vendor/me', requireAuth, async (c) => {
  const db = await getDb(); const user = c.get('user');
  const rows = await db.select({ vendor: vendors, role: vendorMembers.role }).from(vendorMembers).innerJoin(vendors, eq(vendors.id, vendorMembers.vendorId)).where(eq(vendorMembers.userId, user.id));
  return c.json({ vendors: rows.map((r) => ({ ...r.vendor, role: r.role, cgvUpToDate: r.vendor.cgvVersion === VENDOR_CGV_VERSION })), isAdmin: isAdmin(user.email), cgvVersion: VENDOR_CGV_VERSION });
});

/** Chantier 22 : (ré)acceptation des CGV fournisseur (nouvelle version). */
vendorRoutes.post('/vendor/accept-cgv', requireAuth, async (c) => {
  const db = await getDb(); const user = c.get('user');
  const rows = await db.select({ id: vendors.id }).from(vendorMembers).innerJoin(vendors, eq(vendors.id, vendorMembers.vendorId)).where(eq(vendorMembers.userId, user.id));
  for (const r of rows) await db.update(vendors).set({ cgvVersion: VENDOR_CGV_VERSION, cgvAcceptedAt: new Date(), cgvAcceptedBy: user.email }).where(eq(vendors.id, r.id));
  await audit('vendor.accept_cgv', { actorEmail: user.email, meta: { version: VENDOR_CGV_VERSION, vendors: rows.length } });
  return c.json({ ok: true, version: VENDOR_CGV_VERSION });
});

// ---- tout ce qui suit exige un vendor ----
vendorRoutes.use('/vendor/*', requireAuth, requireVendor);

vendorRoutes.get('/vendor/dashboard', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId');
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vid));
  const [stats] = await db.select({
    pending: sql<number>`count(*) filter (where ${orders.status} = 'envoyee')`, confirmed: sql<number>`count(*) filter (where ${orders.status} = 'confirmee')`,
    month: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.status} in ('confirmee','livree','livree_partiel') and ${orders.createdAt} >= date_trunc('month', now())),0)`,
    restaurants: sql<number>`count(distinct ${orders.restaurantId}) filter (where ${orders.status} <> 'annulee')`,
  }).from(orders).where(eq(orders.vendorId, vid));
  const [{ offers }] = await db.select({ offers: sql<number>`count(*)` }).from(vendorOffers).where(eq(vendorOffers.vendorId, vid));
  const [{ linked }] = await db.select({ linked: sql<number>`count(*)` }).from(suppliers).where(eq(suppliers.vendorId, vid));
  const period = new Date().toISOString().slice(0, 7);
  const [{ commission }] = await db.select({ commission: sql<number>`coalesce(sum(${commissions.amountEur}),0)` }).from(commissions).where(and(eq(commissions.vendorId, vid), eq(commissions.period, period)));
  return c.json({ vendor: v, stats: { pendingOrders: n(stats.pending), confirmedOrders: n(stats.confirmed), monthRevenue: n(stats.month), restaurantsServed: n(stats.restaurants), offers: n(offers), restaurantsFollowing: n(linked), commissionThisMonth: n(commission), commissionPct: n(v.commissionPct) } });
});

vendorRoutes.put('/vendor/profile', async (c) => {
  const body = z.object({ name: z.string().min(2).optional(), description: z.string().max(500).nullable().optional(), city: z.string().nullable().optional(), deliveryZones: z.array(z.string()).max(30).optional(), leadTimeHours: z.number().int().positive().optional(), deliveryDays: z.array(z.number().int().min(1).max(7)).optional(), minOrderEur: z.number().nonnegative().optional(), deliveryFeeEur: z.number().nonnegative().optional(), contactEmail: z.string().email().nullable().optional(), contactPhone: z.string().nullable().optional(), whatsapp: z.string().nullable().optional(),
    // Chantier 8 : adresse de facturation (comptabilité) — sinon l'e-mail de contact est utilisé.
    billingEmail: z.union([z.string().email(), z.literal(''), z.null()]).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const d = body.data;
  const { billingEmail, ...rest } = d;
  const [v] = await db.update(vendors).set({ ...rest, ...(billingEmail !== undefined ? { billingEmail: billingEmail || null } : {}), deliveryZones: d.deliveryZones?.map((z) => z.trim().toLowerCase()), minOrderEur: d.minOrderEur?.toFixed(2), deliveryFeeEur: d.deliveryFeeEur?.toFixed(2) }).where(eq(vendors.id, c.get('vendorId'))).returning();
  return c.json({ vendor: v });
});

// ---- catalogue ----
vendorRoutes.get('/vendor/offers', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId');
  const rows = await db.select({ offer: vendorOffers, product: products }).from(vendorOffers).innerJoin(products, eq(products.id, vendorOffers.productId)).where(eq(vendorOffers.vendorId, vid)).orderBy(products.category, products.name);
  return c.json({ offers: rows.map(({ offer, product }) => ({ ...offer, productName: product.name, category: product.category, unit: product.baseUnit, unitPrice: Math.round((n(offer.packPriceEur) / n(offer.packQty)) * 10000) / 10000 })) });
});

/** Upsert d'une offre + propagation du prix à tous les restaurants qui ont lié ce fournisseur. */
vendorRoutes.post('/vendor/offers', async (c) => {
  const body = z.object({ productId: z.string().uuid(), packLabel: z.string().min(1), packQty: z.number().positive(), packPrice: z.number().positive(), inStock: z.boolean().default(true) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const vid = c.get('vendorId'); const d = body.data;
  const [p] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, d.productId), sql`${products.restaurantId} is null`)); if (!p) return c.json({ error: 'Produit hors référentiel commun' }, 400);
  const [offer] = await db.insert(vendorOffers).values({ vendorId: vid, productId: d.productId, packLabel: d.packLabel, packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock })
    .onConflictDoUpdate({ target: [vendorOffers.vendorId, vendorOffers.productId, vendorOffers.packLabel], set: { packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock, updatedAt: new Date() } }).returning();
  const linked = await db.select({ id: suppliers.id, restaurantId: suppliers.restaurantId }).from(suppliers).where(eq(suppliers.vendorId, vid));
  for (const s of linked) {
    await db.insert(supplierOffers).values({ restaurantId: s.restaurantId, supplierId: s.id, productId: d.productId, packLabel: d.packLabel, packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock })
      .onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock, lastSeenAt: new Date() } });
  }
  return c.json({ offer, propagatedTo: linked.length }, 201);
});

/** Import CSV du catalogue : product,pack_label,pack_qty,pack_price[,in_stock] — product = nom du référentiel (ou alias). */
vendorRoutes.post('/vendor/offers/import', async (c) => {
  const body = z.object({ rows: z.array(z.object({ product: z.string(), packLabel: z.string(), packQty: z.number().positive(), packPrice: z.number().positive(), inStock: z.boolean().optional() })).min(1).max(2000) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const vid = c.get('vendorId');
  const ref = await db.select({ id: products.id, name: products.name, aliases: products.aliases }).from(products).where(sql`${products.restaurantId} is null`);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const byName = new Map<string, string>(); for (const p of ref) { byName.set(norm(p.name), p.id); for (const a of p.aliases) byName.set(norm(a), p.id); }
  let ok = 0; const unknown: string[] = [];
  for (const r of body.data.rows) {
    const pid = byName.get(norm(r.product)); if (!pid) { unknown.push(r.product); continue; }
    await db.insert(vendorOffers).values({ vendorId: vid, productId: pid, packLabel: r.packLabel, packQty: r.packQty.toFixed(3), packPriceEur: r.packPrice.toFixed(2), inStock: r.inStock ?? true })
      .onConflictDoUpdate({ target: [vendorOffers.vendorId, vendorOffers.productId, vendorOffers.packLabel], set: { packQty: r.packQty.toFixed(3), packPriceEur: r.packPrice.toFixed(2), inStock: r.inStock ?? true, updatedAt: new Date() } }); ok++;
  }
  return c.json({ imported: ok, unknown });
});

vendorRoutes.delete('/vendor/offers/:id', async (c) => {
  const db = await getDb(); await db.delete(vendorOffers).where(and(eq(vendorOffers.id, c.req.param('id')), eq(vendorOffers.vendorId, c.get('vendorId')))); return c.json({ ok: true });
});

// ---- commandes reçues ----
vendorRoutes.get('/vendor/orders', async (c) => {
  maybeRemind();
  const db = await getDb(); const vid = c.get('vendorId'); const status = c.req.query('status');
  const rows = await db.select({ order: orders, restaurantName: restaurants.name, city: restaurants.city, address: restaurants.address, settings: restaurants.settings })
    .from(orders).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
    .where(status ? and(eq(orders.vendorId, vid), eq(orders.status, status as typeof orders.status.enumValues[number])) : eq(orders.vendorId, vid)).orderBy(desc(orders.createdAt)).limit(100);
  const ids = rows.map((r) => r.order.id);
  const lines = ids.length ? await db.select({ line: orderLines, productName: products.name, unit: products.baseUnit }).from(orderLines).innerJoin(products, eq(products.id, orderLines.productId)).where(inArray(orderLines.orderId, ids)) : [];
  return c.json({ orders: rows.map((r) => ({ ...r.order, proofPhoto: undefined, proofSignature: undefined, restaurantName: r.restaurantName, city: r.city, address: r.address, restaurantPhone: r.settings?.notifyPhone ?? null, whatsappLink: waLink(r.settings?.notifyPhone, `Bonjour ${r.restaurantName}, au sujet de votre commande ${r.order.reference} via AFRISUPPLY : `), lines: lines.filter((l) => l.line.orderId === r.order.id).map((l) => ({ ...l.line, productName: l.productName, unit: l.unit })) })) });
});

async function notifyRestaurant(orderId: string, subject: string, text: string, kind: 'order.confirmed' | 'order.refused' | 'order.shipped' = 'order.confirmed') {
  const db = await getDb();
  const [o] = await db.select({ restaurantId: orders.restaurantId, vendorId: orders.vendorId }).from(orders).where(eq(orders.id, orderId));
  const [rest] = await db.select({ settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, o.restaurantId));
  if (rest?.settings?.notifyPhone) void sendMessage({ to: rest.settings.notifyPhone, body: `AFRISUPPLY — ${subject}\n${text}\nSuivi : ${APP_URL()}/app/achats`, kind, orderId, vendorId: o.vendorId, restaurantId: o.restaurantId });
  const rcpts = await db.select({ email: users.email }).from(restaurantMembers).innerJoin(users, eq(users.id, restaurantMembers.userId)).where(and(eq(restaurantMembers.restaurantId, o.restaurantId), inArray(restaurantMembers.role, ['owner', 'manager'])));
  for (const r of rcpts) void sendMail({ to: r.email, subject, text, html: `<p>${text.replace(/\n/g, '<br>')}</p><p><a href="${APP_URL()}/app/achats">Voir mes commandes</a></p>`, tags: { type: 'order_status' } });
}

/** Confirmer : statut confirmee + date de livraison + commission calculée. */
vendorRoutes.post('/vendor/orders/:id/confirm', async (c) => {
  const body = z.object({ expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().max(300).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const vid = c.get('vendorId');
  const [o] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.vendorId, vid))); if (!o) return c.json({ error: 'Commande introuvable' }, 404);
  if (o.status !== 'envoyee') return c.json({ error: `Commande déjà ${o.status}` }, 400);
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vid));
  const [upd] = await db.update(orders).set({ status: 'confirmee', expectedAt: body.data.expectedAt ?? o.expectedAt, vendorDecisionAt: new Date(), vendorNote: body.data.note, proposal: null }).where(eq(orders.id, o.id)).returning();
  const amount = n(o.totalEur) * n(v.commissionPct) / 100;
  await db.insert(commissions).values({ vendorId: vid, orderId: o.id, orderTotalEur: o.totalEur, pct: v.commissionPct, amountEur: amount.toFixed(2), period: new Date().toISOString().slice(0, 7) }).onConflictDoNothing();
  void logOrderEvent(o.id, 'confirmed', `Confirmée par ${v.name}${upd.expectedAt ? ` — livraison prévue le ${upd.expectedAt}` : ''}`, 'vendor');
  void notifyRestaurant(o.id, `✅ ${v.name} a confirmé votre commande ${o.reference}`, `${v.name} a confirmé la commande ${o.reference} (${eur(n(o.totalEur))}).\nLivraison prévue le ${upd.expectedAt ?? 'à confirmer'}.${body.data.note ? `\nMessage du fournisseur : ${body.data.note}` : ''}`);
  return c.json({ order: upd, commission: Math.round(amount * 100) / 100 });
});

/** Chantier 21 : proposition de modification (ruptures partielles / substitutions). La commande reste 'envoyee' jusqu'à la réponse du restaurant. */
vendorRoutes.post('/vendor/orders/:id/propose', async (c) => {
  const body = z.object({ note: z.string().max(300).optional(), expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    lines: z.array(z.object({ lineId: z.string().uuid(), newPacks: z.number().int().nonnegative(), replacementOfferId: z.string().uuid().nullable().optional(), replacementPacks: z.number().int().positive().optional() })).min(1) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const db = await getDb(); const vid = c.get('vendorId');
  const [o] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.vendorId, vid))); if (!o) return c.json({ error: 'Commande introuvable' }, 404);
  if (o.status !== 'envoyee') return c.json({ error: `Commande déjà ${o.status}` }, 400);
  const lines = await db.select({ l: orderLines, productName: products.name }).from(orderLines).innerJoin(products, eq(products.id, orderLines.productId)).where(eq(orderLines.orderId, o.id));
  const offerIds = body.data.lines.map((x) => x.replacementOfferId).filter((x): x is string => !!x);
  const offers = offerIds.length ? await db.select({ o: vendorOffers, productName: products.name }).from(vendorOffers).innerJoin(products, eq(products.id, vendorOffers.productId)).where(and(eq(vendorOffers.vendorId, vid), inArray(vendorOffers.id, offerIds))) : [];
  const out: NonNullable<typeof o.proposal>['lines'] = [];
  for (const l of lines) {
    const ch = body.data.lines.find((x) => x.lineId === l.l.id); const packs = n(l.l.packs); const unitPack = n(l.l.lineTotalEur) / Math.max(1, packs);
    if (!ch) { out.push({ lineId: l.l.id, productName: l.productName, packLabel: l.l.packLabel, packs, newPacks: packs, lineTotalEur: n(l.l.lineTotalEur), newLineTotalEur: n(l.l.lineTotalEur), replacement: null }); continue; }
    if (ch.newPacks > packs) return c.json({ error: `Quantité proposée supérieure à la commande pour ${l.productName}` }, 400);
    let replacement: NonNullable<typeof o.proposal>['lines'][number]['replacement'] = null;
    if (ch.replacementOfferId) { const r = offers.find((x) => x.o.id === ch.replacementOfferId); if (!r) return c.json({ error: 'Offre de remplacement introuvable dans votre catalogue' }, 400); const rp = ch.replacementPacks ?? packs - ch.newPacks; replacement = { vendorOfferId: r.o.id, productId: r.o.productId, productName: r.productName, packLabel: r.o.packLabel, packQty: n(r.o.packQty), packPriceEur: n(r.o.packPriceEur), packs: rp, lineTotalEur: Math.round(rp * n(r.o.packPriceEur) * 100) / 100 }; }
    out.push({ lineId: l.l.id, productName: l.productName, packLabel: l.l.packLabel, packs, newPacks: ch.newPacks, lineTotalEur: n(l.l.lineTotalEur), newLineTotalEur: Math.round(ch.newPacks * unitPack * 100) / 100, replacement });
  }
  const changed = out.filter((x) => x.newPacks !== x.packs || x.replacement); if (!changed.length) return c.json({ error: 'Aucune modification : confirmez simplement la commande' }, 400);
  const newTotalEur = Math.round(out.reduce((a, x) => a + x.newLineTotalEur + (x.replacement?.lineTotalEur ?? 0), 0) * 100) / 100;
  if (newTotalEur <= 0) return c.json({ error: 'Tout est en rupture : utilisez « Refuser »' }, 400);
  const proposal = { note: body.data.note, expectedAt: body.data.expectedAt, lines: out, newTotalEur };
  const [upd] = await db.update(orders).set({ proposal, proposalAt: new Date() }).where(eq(orders.id, o.id)).returning();
  const [v] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vid));
  const summary = changed.map((x) => x.replacement ? `${x.productName} : ${x.newPacks}/${x.packs} + ${x.replacement.packs} × ${x.replacement.productName} (${x.replacement.packLabel ?? ''})` : `${x.productName} : ${x.newPacks}/${x.packs}${x.newPacks === 0 ? ' (rupture)' : ''}`).join(' ; ');
  void logOrderEvent(o.id, 'note', `${v.name} propose une modification — ${summary}`, 'vendor', { newTotalEur });
  void notifyRestaurant(o.id, `✏️ ${v.name} propose une modification de la commande ${o.reference}`, `${v.name} ne peut pas livrer la commande ${o.reference} telle quelle.\nProposition : ${summary}.\nNouveau total : ${eur(newTotalEur)} (au lieu de ${eur(n(o.totalEur))}).${body.data.note ? `\nMessage : ${body.data.note}` : ''}\n\nAcceptez ou refusez en un clic dans Achats.`);
  return c.json({ order: { ...upd, proofPhoto: undefined, proofSignature: undefined }, proposal });
});

vendorRoutes.post('/vendor/orders/:id/refuse', async (c) => {
  const body = z.object({ reason: z.string().min(2).max(300) }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: 'Motif requis' }, 400);
  const db = await getDb(); const vid = c.get('vendorId');
  const [o] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.vendorId, vid))); if (!o) return c.json({ error: 'Commande introuvable' }, 404);
  if (o.status !== 'envoyee') return c.json({ error: `Commande déjà ${o.status}` }, 400);
  const [v] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vid));
  const [upd] = await db.update(orders).set({ status: 'annulee', vendorDecisionAt: new Date(), vendorNote: body.data.reason }).where(eq(orders.id, o.id)).returning();
  void logOrderEvent(o.id, 'refused', `Refusée par ${v.name} : ${body.data.reason}`, 'vendor');
  void notifyRestaurant(o.id, `❌ ${v.name} ne peut pas honorer la commande ${o.reference}`, `${v.name} a refusé la commande ${o.reference}.\nMotif : ${body.data.reason}\n\nLe comparateur AFRISUPPLY vous propose des alternatives dans le panier.`, 'order.refused');
  return c.json({ order: upd });
});

// ---------------- Chantier 20 : préparation, livraison, preuve ----------------
const FULFILL_LABEL: Record<string, string> = { en_preparation: 'En préparation', en_livraison: 'En livraison', livree: 'Livrée' };

/** Liste de picking : quantités à préparer par produit pour les commandes confirmées (jour donné ou toutes). */
vendorRoutes.get('/vendor/picking', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId'); const day = c.req.query('date');
  const conds = [eq(orders.vendorId, vid), eq(orders.status, 'confirmee')]; if (day) conds.push(eq(orders.expectedAt, day));
  const rows = await db.select({ orderId: orders.id, reference: orders.reference, restaurant: restaurants.name, city: restaurants.city, address: restaurants.address, expectedAt: orders.expectedAt, fulfillment: orders.fulfillment, deliverySlot: orders.deliverySlot, productId: orderLines.productId, productName: products.name, packLabel: orderLines.packLabel, packs: orderLines.packs })
    .from(orders).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).innerJoin(orderLines, eq(orderLines.orderId, orders.id)).innerJoin(products, eq(products.id, orderLines.productId)).where(and(...conds)).orderBy(orders.expectedAt, orders.createdAt);
  const byProduct = new Map<string, { productId: string; productName: string; packLabel: string | null; packs: number; orders: { reference: string; restaurant: string; packs: number }[] }>();
  for (const r of rows) { const k = `${r.productId}|${r.packLabel ?? ''}`; const e = byProduct.get(k) ?? { productId: r.productId, productName: r.productName, packLabel: r.packLabel, packs: 0, orders: [] }; e.packs += n(r.packs); e.orders.push({ reference: r.reference, restaurant: r.restaurant, packs: n(r.packs) }); byProduct.set(k, e); }
  const ordersMap = new Map<string, { id: string; reference: string; restaurant: string; city: string | null; address: string | null; expectedAt: string | null; fulfillment: string | null; deliverySlot: string | null; lines: number; packs: number }>();
  for (const r of rows) { const e = ordersMap.get(r.orderId) ?? { id: r.orderId, reference: r.reference, restaurant: r.restaurant, city: r.city, address: r.address, expectedAt: r.expectedAt, fulfillment: r.fulfillment, deliverySlot: r.deliverySlot, lines: 0, packs: 0 }; e.lines++; e.packs += n(r.packs); ordersMap.set(r.orderId, e); }
  const dates = [...new Set(rows.map((r) => r.expectedAt).filter(Boolean))].sort() as string[];
  return c.json({ date: day ?? null, dates, products: [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName)), orders: [...ordersMap.values()] });
});

/** Passage d'étape : en_preparation → en_livraison → livree (avec preuve). Notifie le restaurant à chaque étape. */
vendorRoutes.post('/vendor/orders/:id/fulfillment', async (c) => {
  const body = z.object({ step: z.enum(['en_preparation', 'en_livraison', 'livree']), deliverySlot: z.string().max(40).optional(), driverName: z.string().max(80).optional(), receiverName: z.string().max(80).optional(), photo: z.string().max(600_000).optional(), signature: z.string().max(200_000).optional(), note: z.string().max(300).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const db = await getDb(); const vid = c.get('vendorId'); const d = body.data;
  const [o] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.vendorId, vid))); if (!o) return c.json({ error: 'Commande introuvable' }, 404);
  if (o.status !== 'confirmee') return c.json({ error: `Commande ${o.status} : seules les commandes confirmées se préparent/livrent` }, 400);
  const order = ['en_preparation', 'en_livraison', 'livree']; const cur = o.fulfillment ? order.indexOf(o.fulfillment) : -1; const nxt = order.indexOf(d.step);
  if (nxt <= cur) return c.json({ error: `Déjà ${FULFILL_LABEL[o.fulfillment!]}` }, 400);
  if (d.photo && !/^data:image\/(jpeg|png|webp);base64,/.test(d.photo)) return c.json({ error: 'Photo invalide' }, 400);
  if (d.signature && !/^data:image\/png;base64,/.test(d.signature)) return c.json({ error: 'Signature invalide' }, 400);
  if (d.step === 'livree' && !d.photo && !d.signature && !d.receiverName) return c.json({ error: 'Preuve de livraison requise : nom du réceptionnaire, signature ou photo' }, 400);
  const now = new Date();
  const patch: Partial<typeof orders.$inferInsert> = { fulfillment: d.step, deliverySlot: d.deliverySlot ?? o.deliverySlot, driverName: d.driverName ?? o.driverName };
  if (d.step === 'en_preparation') patch.preparedAt = now;
  if (d.step === 'en_livraison') { patch.shippedAt = now; patch.preparedAt = o.preparedAt ?? now; }
  if (d.step === 'livree') { patch.vendorDeliveredAt = now; patch.shippedAt = o.shippedAt ?? now; patch.preparedAt = o.preparedAt ?? now; patch.proofReceiverName = d.receiverName; patch.proofPhoto = d.photo; patch.proofSignature = d.signature; patch.proofNote = d.note; }
  const [upd] = await db.update(orders).set(patch).where(eq(orders.id, o.id)).returning();
  const [v] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vid));
  if (d.step === 'en_preparation') { void logOrderEvent(o.id, 'preparing', `${v.name} prépare votre commande${d.deliverySlot ? ` — livraison ${d.deliverySlot}` : ''}`, 'vendor'); }
  if (d.step === 'en_livraison') { void logOrderEvent(o.id, 'shipped', `En livraison${d.driverName ? ` (${d.driverName})` : ''}${upd.deliverySlot ? ` — ${upd.deliverySlot}` : ''}`, 'vendor'); void notifyRestaurant(o.id, `🚚 ${v.name} : commande ${o.reference} en route`, `Votre commande ${o.reference} est en livraison${upd.deliverySlot ? ` (${upd.deliverySlot})` : ''}${d.driverName ? `, livreur : ${d.driverName}` : ''}. Pensez à la réceptionner dans AFRISUPPLY pour mettre le stock à jour et signaler tout écart.`, 'order.shipped'); }
  if (d.step === 'livree') { void logOrderEvent(o.id, 'delivered', `Livrée${d.receiverName ? ` — reçue par ${d.receiverName}` : ''}${d.signature ? ' (signature)' : ''}${d.photo ? ' (photo)' : ''}`, 'vendor'); void notifyRestaurant(o.id, `📦 ${v.name} : commande ${o.reference} livrée`, `${v.name} indique avoir livré la commande ${o.reference}${d.receiverName ? ` (reçue par ${d.receiverName})` : ''}. Confirmez la réception dans AFRISUPPLY : le stock sera mis à jour et vous pourrez signaler un écart.`, 'order.shipped'); }
  return c.json({ order: { ...upd, proofPhoto: undefined, proofSignature: undefined }, message: FULFILL_LABEL[d.step] });
});

/** Compatibilité : ancien bouton « Marquer expédiée » = étape en_livraison. */
vendorRoutes.post('/vendor/orders/:id/shipped', async (c) => c.redirect(`/api/vendor/orders/${c.req.param('id')}/fulfillment`, 307));

vendorRoutes.get('/vendor/orders/:id/timeline', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId');
  const [o] = await db.select({ id: orders.id, fulfillment: orders.fulfillment, proofPhoto: orders.proofPhoto, proofSignature: orders.proofSignature, proofReceiverName: orders.proofReceiverName, proofNote: orders.proofNote, vendorDeliveredAt: orders.vendorDeliveredAt }).from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.vendorId, vid)));
  if (!o) return c.json({ error: 'Commande introuvable' }, 404);
  return c.json({ order: o, events: await orderTimeline(o.id) });
});

// ---------------- Chantier 28 : paliers de volume & prix négociés ----------------
vendorRoutes.get('/vendor/pricing', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId');
  const tiers = await db.select({ t: vendorPriceTiers }).from(vendorPriceTiers).innerJoin(vendorOffers, eq(vendorOffers.id, vendorPriceTiers.vendorOfferId)).where(eq(vendorOffers.vendorId, vid)).orderBy(vendorPriceTiers.minPacks);
  const customers = await db.select({ p: vendorCustomerPrices, restaurantName: restaurants.name, city: restaurants.city }).from(vendorCustomerPrices).innerJoin(restaurants, eq(restaurants.id, vendorCustomerPrices.restaurantId)).where(eq(vendorCustomerPrices.vendorId, vid)).orderBy(desc(vendorCustomerPrices.updatedAt));
  const clients = await db.select({ id: restaurants.id, name: restaurants.name, city: restaurants.city, orders: sql<number>`count(${orders.id})`, gmv: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.status} <> 'annulee'), 0)` }).from(orders).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).where(eq(orders.vendorId, vid)).groupBy(restaurants.id, restaurants.name, restaurants.city).orderBy(sql`count(${orders.id}) desc`);
  return c.json({ tiers: tiers.map((x) => x.t), customers: customers.map((x) => ({ ...x.p, restaurantName: x.restaurantName, city: x.city })), clients: clients.map((x) => ({ ...x, orders: n(x.orders), gmv: n(x.gmv) })) });
});
/** Remplace tous les paliers d'une offre. */
vendorRoutes.put('/vendor/offers/:id/tiers', async (c) => {
  const body = z.object({ tiers: z.array(z.object({ minPacks: z.number().int().min(2), packPriceEur: z.number().positive() })).max(6) }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const vid = c.get('vendorId');
  const [o] = await db.select().from(vendorOffers).where(and(eq(vendorOffers.id, c.req.param('id')), eq(vendorOffers.vendorId, vid))); if (!o) return c.json({ error: 'Offre introuvable' }, 404);
  const sorted = [...body.data.tiers].sort((a, b) => a.minPacks - b.minPacks);
  for (let i = 0; i < sorted.length; i++) { if (sorted[i].packPriceEur >= n(o.packPriceEur)) return c.json({ error: `Le palier ${sorted[i].minPacks}+ doit être moins cher que le prix catalogue (${eur(n(o.packPriceEur))})` }, 400); if (i > 0 && sorted[i].packPriceEur >= sorted[i - 1].packPriceEur) return c.json({ error: 'Les prix doivent baisser à chaque palier' }, 400); if (i > 0 && sorted[i].minPacks === sorted[i - 1].minPacks) return c.json({ error: 'Deux paliers identiques' }, 400); }
  await db.delete(vendorPriceTiers).where(eq(vendorPriceTiers.vendorOfferId, o.id));
  if (sorted.length) await db.insert(vendorPriceTiers).values(sorted.map((t) => ({ vendorOfferId: o.id, minPacks: t.minPacks, packPriceEur: t.packPriceEur.toFixed(2) })));
  return c.json({ tiers: sorted });
});
/** Crée / met à jour un accord client (prix ferme ou remise % sur une offre, ou remise globale). */
vendorRoutes.post('/vendor/customer-prices', async (c) => {
  const body = z.object({ restaurantId: z.string().uuid(), vendorOfferId: z.string().uuid().nullable().optional(), packPriceEur: z.number().positive().optional(), discountPct: z.number().min(0.5).max(60).optional(), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), note: z.string().max(200).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const db = await getDb(); const vid = c.get('vendorId'); const d = body.data;
  if (!d.packPriceEur && !d.discountPct) return c.json({ error: 'Indiquez un prix ferme ou une remise %' }, 400);
  if (!d.vendorOfferId && d.packPriceEur) return c.json({ error: 'Un prix ferme s’applique à une offre précise ; pour tout le catalogue, utilisez une remise %' }, 400);
  if (d.vendorOfferId) { const [o] = await db.select().from(vendorOffers).where(and(eq(vendorOffers.id, d.vendorOfferId), eq(vendorOffers.vendorId, vid))); if (!o) return c.json({ error: 'Offre introuvable' }, 404); if (d.packPriceEur && d.packPriceEur >= n(o.packPriceEur)) return c.json({ error: `Le prix négocié doit être inférieur au catalogue (${eur(n(o.packPriceEur))})` }, 400); }
  const [known] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.vendorId, vid), eq(orders.restaurantId, d.restaurantId))).limit(1);
  const [linked] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.vendorId, vid), eq(suppliers.restaurantId, d.restaurantId))).limit(1);
  if (!known && !linked) return c.json({ error: 'Ce restaurant n’est pas encore votre client sur AFRISUPPLY' }, 400);
  const existing = await db.select().from(vendorCustomerPrices).where(and(eq(vendorCustomerPrices.vendorId, vid), eq(vendorCustomerPrices.restaurantId, d.restaurantId), d.vendorOfferId ? eq(vendorCustomerPrices.vendorOfferId, d.vendorOfferId) : sql`${vendorCustomerPrices.vendorOfferId} is null`));
  const vals = { packPriceEur: d.packPriceEur?.toFixed(2) ?? null, discountPct: d.packPriceEur ? null : d.discountPct?.toFixed(2) ?? null, validUntil: d.validUntil ?? null, note: d.note, updatedAt: new Date() };
  const [row] = existing[0] ? await db.update(vendorCustomerPrices).set(vals).where(eq(vendorCustomerPrices.id, existing[0].id)).returning() : await db.insert(vendorCustomerPrices).values({ vendorId: vid, restaurantId: d.restaurantId, vendorOfferId: d.vendorOfferId ?? null, ...vals }).returning();
  await audit('vendor.customer_price', { actorEmail: c.get('user').email, target: row.id, meta: { restaurantId: d.restaurantId, offer: d.vendorOfferId, price: d.packPriceEur, pct: d.discountPct } });
  return c.json({ price: row }, existing[0] ? 200 : 201);
});
vendorRoutes.delete('/vendor/customer-prices/:id', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId');
  const [row] = await db.delete(vendorCustomerPrices).where(and(eq(vendorCustomerPrices.id, c.req.param('id')), eq(vendorCustomerPrices.vendorId, vid))).returning(); if (!row) return c.json({ error: 'Introuvable' }, 404);
  return c.json({ ok: true });
});

// ---- achats groupés ----
vendorRoutes.get('/vendor/group-buys', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId');
  const rows = await db.select({ gb: groupBuys, productName: products.name, packLabel: vendorOffers.packLabel }).from(groupBuys).innerJoin(vendorOffers, eq(vendorOffers.id, groupBuys.vendorOfferId)).innerJoin(products, eq(products.id, vendorOffers.productId)).where(eq(groupBuys.vendorId, vid)).orderBy(desc(groupBuys.createdAt));
  const ids = rows.map((r) => r.gb.id);
  const parts = ids.length ? await db.select({ p: groupBuyParticipations, restaurantName: restaurants.name, city: restaurants.city }).from(groupBuyParticipations).innerJoin(restaurants, eq(restaurants.id, groupBuyParticipations.restaurantId)).where(inArray(groupBuyParticipations.groupBuyId, ids)) : [];
  return c.json({ groupBuys: rows.map((r) => { const p = parts.filter((x) => x.p.groupBuyId === r.gb.id); return { ...r.gb, productName: r.productName, packLabel: r.packLabel, committedPacks: p.reduce((a, x) => a + x.p.packs, 0), participants: p.map((x) => ({ restaurantName: x.restaurantName, city: x.city, packs: x.p.packs })) }; }) });
});

vendorRoutes.post('/vendor/group-buys', async (c) => {
  const body = z.object({ vendorOfferId: z.string().uuid(), zone: z.string().min(2), targetPacks: z.number().int().min(2), discountPct: z.number().min(1).max(50), closesInDays: z.number().int().min(1).max(30).default(7), deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), title: z.string().max(120).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const db = await getDb(); const vid = c.get('vendorId'); const d = body.data; const user = c.get('user');
  const [o] = await db.select({ offer: vendorOffers, productName: products.name }).from(vendorOffers).innerJoin(products, eq(products.id, vendorOffers.productId)).where(and(eq(vendorOffers.id, d.vendorOfferId), eq(vendorOffers.vendorId, vid))); if (!o) return c.json({ error: 'Offre introuvable' }, 404);
  const title = d.title ?? `${o.productName} ${o.offer.packLabel} — ${d.targetPacks} colis = −${d.discountPct} %`;
  const [gb] = await db.insert(groupBuys).values({ vendorId: vid, vendorOfferId: d.vendorOfferId, title, zone: d.zone.trim().toLowerCase() === 'france' ? 'France' : d.zone.trim().toLowerCase(), targetPacks: d.targetPacks, discountPct: d.discountPct.toFixed(2), closesAt: new Date(Date.now() + d.closesInDays * 86_400_000), deliveryDate: d.deliveryDate, createdBy: user.id }).returning();
  return c.json({ groupBuy: gb }, 201);
});

/** Clôture : si palier atteint → une commande « plateforme » confirmée par restaurant au prix remisé ; sinon annulé. */
vendorRoutes.post('/vendor/group-buys/:id/close', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId'); const id = c.req.param('id');
  const [gb] = await db.select().from(groupBuys).where(and(eq(groupBuys.id, id), eq(groupBuys.vendorId, vid))); if (!gb) return c.json({ error: 'Introuvable' }, 404);
  if (!['ouvert', 'atteint'].includes(gb.status)) return c.json({ error: `Déjà ${gb.status}` }, 400);
  const parts = await db.select().from(groupBuyParticipations).where(eq(groupBuyParticipations.groupBuyId, id));
  const committed = parts.reduce((a, p) => a + p.packs, 0);
  if (committed < gb.targetPacks) { await db.update(groupBuys).set({ status: 'annule' }).where(eq(groupBuys.id, id)); return c.json({ ok: true, status: 'annule', committed, target: gb.targetPacks }); }
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vid));
  const [offer] = await db.select().from(vendorOffers).where(eq(vendorOffers.id, gb.vendorOfferId));
  const packPrice = n(offer.packPriceEur) * (1 - n(gb.discountPct) / 100);
  const { linkVendor } = await import('./marketplace.js');
  let created = 0;
  for (const p of parts) {
    if (p.packs <= 0 || p.orderId) continue;
    const link = await linkVendor(p.restaurantId, vid); if (!link) continue;
    const total = p.packs * packPrice;
    const [order] = await db.insert(orders).values({ restaurantId: p.restaurantId, supplierId: link.supplier.id, vendorId: vid, reference: await nextOrderReference(), status: 'confirmee', channel: 'plateforme', sentAt: new Date(), vendorDecisionAt: new Date(), expectedAt: gb.deliveryDate ?? new Date(Date.now() + v.leadTimeHours * 3_600_000).toISOString().slice(0, 10), totalEur: total.toFixed(2), deliveryFeeEur: '0', source: 'achat_groupe', notes: `Achat groupé « ${gb.title} » : −${n(gb.discountPct)} %` }).returning();
    await db.insert(orderLines).values({ orderId: order.id, productId: offer.productId, packLabel: offer.packLabel, packs: p.packs, quantity: (p.packs * n(offer.packQty)).toFixed(3), unitPriceEur: (packPrice / n(offer.packQty)).toFixed(4), lineTotalEur: total.toFixed(2) });
    await db.insert(commissions).values({ vendorId: vid, orderId: order.id, orderTotalEur: total.toFixed(2), pct: v.commissionPct, amountEur: (total * n(v.commissionPct) / 100).toFixed(2), period: new Date().toISOString().slice(0, 7) }).onConflictDoNothing();
    await db.update(groupBuyParticipations).set({ orderId: order.id }).where(eq(groupBuyParticipations.id, p.id));
    void notifyRestaurant(order.id, `🤝 Achat groupé réussi : ${gb.title}`, `Le palier est atteint (${committed} colis). Votre commande ${order.reference} de ${p.packs} colis à ${eur(packPrice)} le colis (−${n(gb.discountPct)} %) est confirmée chez ${v.name}.`);
    created++;
  }
  await db.update(groupBuys).set({ status: 'cloture' }).where(eq(groupBuys.id, id));
  return c.json({ ok: true, status: 'cloture', committed, ordersCreated: created });
});

// ---- facturation fournisseur (chantier 8) : moyen de paiement + factures de commission ----
/**
 * État réel du règlement des commissions : carte enregistrée (prélèvement) ou relevé par e-mail.
 * Jamais de bouton trompeur : si Stripe n'est pas configuré, on le dit et on propose le virement.
 */
vendorRoutes.get('/vendor/billing', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId');
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vid));
  const [state, invoices, rows] = await Promise.all([vendorPaymentState(vid), vendorCommissionInvoices(vid), db.select({ period: commissions.period, orders: sql<number>`count(*)`, base: sql<number>`sum(${commissions.orderTotalEur})`, amount: sql<number>`sum(${commissions.amountEur})`, invoiced: sql<boolean>`bool_and(${commissions.invoiced})` }).from(commissions).where(eq(commissions.vendorId, vid)).groupBy(commissions.period).orderBy(desc(commissions.period))]);
  return c.json({
    commissionPct: n(v?.commissionPct), billingEmail: v?.billingEmail ?? null, contactEmail: v?.contactEmail ?? null,
    recipient: await vendorBillingRecipient({ id: vid, billingEmail: v?.billingEmail, contactEmail: v?.contactEmail }),
    payment: state,
    periods: rows.map((r) => ({ ...r, orders: n(r.orders), base: n(r.base), amount: n(r.amount) })),
    invoices: invoices.map((i) => ({ id: i.id, period: i.period, orders: i.orders, baseEur: n(i.baseEur), amountEur: n(i.amountEur), status: i.status, stripeInvoiceId: i.stripeInvoiceId, createdAt: i.createdAt })),
  });
});

/** Enregistrer une carte (Stripe Checkout en mode « setup ») : aucun débit à cette étape. */
vendorRoutes.post('/vendor/billing/setup', async (c) => {
  if (!stripeConfigured()) return c.json({ error: 'Enregistrement de carte indisponible sur cette installation — vos commissions sont facturées par e-mail, à régler par virement. Écrivez à bonjour@afrisupply.fr pour toute question.' }, 503);
  try {
    const session = await createVendorSetupSession(c.get('vendorId'), c.get('user').email);
    await audit('vendor.billing.setup', { actorEmail: c.get('user').email, target: c.get('vendorId') });
    return c.json({ url: session.url });
  } catch (e) { return c.json({ error: (e as Error).message }, 502); }
});

/** Retour de Checkout : on applique le moyen de paiement sans attendre le webhook. */
vendorRoutes.post('/vendor/billing/sync', async (c) => {
  const body = z.object({ sessionId: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  if (!stripeConfigured()) return c.json({ synced: false });
  if (!body.sessionId) return c.json({ synced: false, error: 'sessionId manquant' }, 400);
  try {
    const s = await (await import('../lib/billing.js')).stripe<{ id: string; mode?: string; customer?: string; setup_intent?: string; metadata?: Record<string, string> }>('GET', `/checkout/sessions/${body.sessionId}`);
    if (s.metadata?.vendorId !== c.get('vendorId')) return c.json({ synced: false, error: 'session inconnue pour ce fournisseur' }, 403);
    const res = await applyVendorSetup(s);
    return c.json({ synced: res.applied, ...res, payment: await vendorPaymentState(c.get('vendorId')) });
  } catch (e) { return c.json({ synced: false, error: (e as Error).message }, 502); }
});

/** Facture de commission PDF (le fournisseur ne voit que les siennes). */
vendorRoutes.get('/vendor/billing/invoices/:id/pdf', async (c) => {
  const db = await getDb();
  const [inv] = await db.select().from(commissionInvoices).where(and(eq(commissionInvoices.id, c.req.param('id')), eq(commissionInvoices.vendorId, c.get('vendorId'))));
  if (!inv) return c.json({ error: 'Facture introuvable' }, 404);
  const [v] = await db.select().from(vendors).where(eq(vendors.id, inv.vendorId));
  const state = await vendorPaymentState(inv.vendorId);
  const monthLabel = new Date(`${inv.period}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const pdf = commissionPdf({
    number: `FC-${inv.period}-${String(inv.id).slice(0, 4).toUpperCase()}`,
    periodLabel: monthLabel, issuedAt: inv.createdAt, dueAt: new Date(inv.createdAt.getTime() + 15 * 86_400_000),
    vendor: { name: v?.name ?? 'Fournisseur', city: v?.city, email: v?.billingEmail ?? v?.contactEmail ?? null },
    orders: inv.orders, baseEur: n(inv.baseEur), pct: Number(v?.commissionPct ?? 3), amountHt: n(inv.amountEur), vatRate: 20,
    payment: { mode: state.mode === 'prelevement' ? 'prelevement' : 'virement', card: state.card ? `${state.card.brand ?? 'carte'} •••• ${state.card.last4 ?? '????'}` : null },
  });
  return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${inv.period}-commission.pdf"` } });
});

// ---- commissions ----
vendorRoutes.get('/vendor/commissions', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId');
  const rows = await db.select({ period: commissions.period, orders: sql<number>`count(*)`, base: sql<number>`sum(${commissions.orderTotalEur})`, amount: sql<number>`sum(${commissions.amountEur})`, invoiced: sql<boolean>`bool_and(${commissions.invoiced})` }).from(commissions).where(eq(commissions.vendorId, vid)).groupBy(commissions.period).orderBy(desc(commissions.period));
  return c.json({ periods: rows.map((r) => ({ ...r, orders: n(r.orders), base: n(r.base), amount: n(r.amount) })) });
});

// ---- admin plateforme : validation des fournisseurs ----
export const vendorAdminRoutes = new Hono<Env>();
vendorAdminRoutes.use('/admin/vendors/*', requireAuth); vendorAdminRoutes.use('/admin/vendors', requireAuth);
vendorAdminRoutes.get('/admin/vendors', async (c) => {
  if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403);
  const db = await getDb();
  const rows = await db.select({ v: vendors, offerCount: sql<number>`(select count(*) from vendor_offers o where o.vendor_id = ${vendors.id})`, orderCount: sql<number>`(select count(*) from orders o where o.vendor_id = ${vendors.id})` }).from(vendors).orderBy(desc(vendors.createdAt));
  return c.json({ vendors: rows.map((r) => ({ ...r.v, offerCount: Number(r.offerCount), orderCount: Number(r.orderCount) })) });
});
vendorAdminRoutes.put('/admin/vendors/:id', async (c) => {
  if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403);
  const body = z.object({ status: z.enum(['en_attente', 'actif', 'suspendu']).optional(), commissionPct: z.number().min(0).max(20).optional() }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb();
  const [v] = await db.update(vendors).set({ status: body.data.status, commissionPct: body.data.commissionPct?.toFixed(2) }).where(eq(vendors.id, c.req.param('id'))).returning();
  if (v && body.data.status === 'actif' && v.contactEmail) void sendMail({ to: v.contactEmail, subject: 'Votre espace fournisseur AFRISUPPLY est activé', text: `Bonjour,\n\nVotre espace ${v.name} est actif : ${APP_URL()}/fournisseur\nAjoutez votre catalogue, les restaurants de votre zone vous verront dès aujourd'hui.\nCommission plateforme : ${n(v.commissionPct)} % sur les commandes confirmées, facturée mensuellement.`, html: `<p>Votre espace <b>${v.name}</b> est actif : <a href="${APP_URL()}/fournisseur">${APP_URL()}/fournisseur</a></p><p>Commission plateforme : ${n(v.commissionPct)} % sur les commandes confirmées.</p>`, tags: { type: 'vendor_activated' } });
  await audit('vendor.update', { actorEmail: c.get('user').email, target: v?.id, meta: body.data });
  return c.json({ vendor: v });
});

// ---------------- Chantier 12 : import de catalogue assisté (texte / Excel / photo) + prix express ----------------
import { parseCatalogText, matchCatalogLines, extractCatalogFromImage, type MatchedLine } from '../lib/catalog-import.js';
async function refProducts() { const db = await getDb(); return (await db.select({ id: products.id, name: products.name, aliases: products.aliases, baseUnit: products.baseUnit }).from(products).where(sql`${products.restaurantId} is null`)).map((p) => ({ ...p, baseUnit: p.baseUnit as string })); }

/** Analyse sans écrire : { text } (lignes collées / CSV / Excel converti) ou { image } (photo ou page de tarif). */
vendorRoutes.post('/vendor/catalog/parse', async (c) => {
  const body = z.object({ text: z.string().max(200_000).optional(), image: z.string().startsWith('data:image/').max(8_000_000).optional() }).refine((b) => b.text || b.image, 'text ou image requis').safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Collez un texte ou envoyez une photo' }, 400);
  let lines: MatchedLine[] = []; let source = 'texte';
  if (body.data.image) { const r = await extractCatalogFromImage(body.data.image); if (!r.ok) return c.json({ error: r.error }, 503); lines = matchCatalogLines(r.lines, await refProducts()); source = 'photo'; }
  else lines = matchCatalogLines(parseCatalogText(body.data.text!), await refProducts());
  const db = await getDb(); const vid = c.get('vendorId');
  const existing = await db.select({ productId: vendorOffers.productId, packLabel: vendorOffers.packLabel, packPriceEur: vendorOffers.packPriceEur }).from(vendorOffers).where(eq(vendorOffers.vendorId, vid));
  const out = lines.map((l) => { const ex = l.match ? existing.find((e) => e.productId === l.match!.id && e.packLabel.toLowerCase() === l.packLabel.toLowerCase()) : null; return { ...l, currentPrice: ex ? n(ex.packPriceEur) : null, changePct: ex && n(ex.packPriceEur) > 0 ? Math.round(((l.price - n(ex.packPriceEur)) / n(ex.packPriceEur)) * 1000) / 10 : null }; });
  return c.json({ source, lines: out, matched: out.filter((l) => l.match).length, total: out.length, hint: out.length ? undefined : 'Aucune ligne reconnue. Format libre : « Riz brisé sac 25 kg 29,90 » (une ligne par produit).' });
});

/** Publication des lignes validées : upsert offres + propagation aux restaurants liés + historique de prix. */
vendorRoutes.post('/vendor/catalog/apply', async (c) => {
  const body = z.object({ lines: z.array(z.object({ productId: z.string().uuid(), packLabel: z.string().min(1).max(60), packQty: z.number().positive(), packPrice: z.number().positive(), inStock: z.boolean().default(true) })).min(1).max(2000), replaceMissing: z.boolean().default(false) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const vid = c.get('vendorId');
  const ref = new Set((await refProducts()).map((p) => p.id)); const bad = body.data.lines.filter((l) => !ref.has(l.productId)); if (bad.length) return c.json({ error: 'Produit hors référentiel' }, 400);
  const linked = await db.select({ id: suppliers.id, restaurantId: suppliers.restaurantId }).from(suppliers).where(eq(suppliers.vendorId, vid));
  let created = 0, updated = 0, priceChanges = 0;
  const before = new Map((await db.select().from(vendorOffers).where(eq(vendorOffers.vendorId, vid))).map((o) => [`${o.productId}|${o.packLabel.toLowerCase()}`, o]));
  const seen = new Set<string>();
  for (const l of body.data.lines) {
    const key = `${l.productId}|${l.packLabel.toLowerCase()}`; seen.add(key); const prev = before.get(key);
    const packLabel = prev?.packLabel ?? l.packLabel;
    await db.insert(vendorOffers).values({ vendorId: vid, productId: l.productId, packLabel, packQty: l.packQty.toFixed(3), packPriceEur: l.packPrice.toFixed(2), inStock: l.inStock })
      .onConflictDoUpdate({ target: [vendorOffers.vendorId, vendorOffers.productId, vendorOffers.packLabel], set: { packQty: l.packQty.toFixed(3), packPriceEur: l.packPrice.toFixed(2), inStock: l.inStock, updatedAt: new Date() } });
    if (prev) { updated++; if (n(prev.packPriceEur) !== l.packPrice) priceChanges++; } else created++;
    for (const s of linked) {
      const [so] = await db.insert(supplierOffers).values({ restaurantId: s.restaurantId, supplierId: s.id, productId: l.productId, packLabel, packQty: l.packQty.toFixed(3), packPriceEur: l.packPrice.toFixed(2), inStock: l.inStock })
        .onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: l.packQty.toFixed(3), packPriceEur: l.packPrice.toFixed(2), inStock: l.inStock, lastSeenAt: new Date() } }).returning();
      if (!prev || n(prev.packPriceEur) !== l.packPrice) await db.insert(priceHistory).values({ restaurantId: s.restaurantId, offerId: so.id, unitPriceEur: (l.packPrice / l.packQty).toFixed(4), source: 'catalogue' });
    }
  }
  let outOfStock = 0;
  if (body.data.replaceMissing) for (const [key, o] of before) if (!seen.has(key) && o.inStock) { await db.update(vendorOffers).set({ inStock: false, updatedAt: new Date() }).where(eq(vendorOffers.id, o.id)); outOfStock++; }
  await audit('vendor.catalog_import', { actorEmail: c.get('user').email, target: vid, meta: { created, updated, priceChanges, outOfStock } });
  return c.json({ created, updated, priceChanges, outOfStock, propagatedTo: linked.length, message: `Catalogue publié : ${created} nouveau(x), ${updated} mis à jour (${priceChanges} changement(s) de prix)${outOfStock ? `, ${outOfStock} passé(s) en rupture` : ''}${linked.length ? ` · répercuté chez ${linked.length} restaurant(s)` : ''}.` });
});

/** Prix express : « riz brisé 25 kg 41 » ou « huile de palme 5 L 23,50 » ou « attiéké rupture » — une ligne, un changement. */
vendorRoutes.post('/vendor/offers/quick', async (c) => {
  const body = z.object({ text: z.string().min(2).max(300) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Texte requis' }, 400);
  const db = await getDb(); const vid = c.get('vendorId');
  const mine = await db.select({ offer: vendorOffers, product: products }).from(vendorOffers).innerJoin(products, eq(products.id, vendorOffers.productId)).where(eq(vendorOffers.vendorId, vid));
  if (!mine.length) return c.json({ error: 'Aucune offre dans votre catalogue' }, 400);
  const txt = body.data.text.trim(); const rupture = /\b(rupture|plus de|epuise|épuisé|indisponible)\b/i.test(txt); const dispo = /\b(dispo|disponible|de retour|retour en stock)\b/i.test(txt);
  const parsed = rupture || dispo ? null : parseCatalogText(txt)[0];
  const label = parsed ? parsed.label : txt.replace(/\b(rupture|plus de|epuise|épuisé|indisponible|dispo|disponible|de retour|retour en stock)\b/gi, ' ').trim();
  const ents = mine.map(({ offer, product }) => ({ id: offer.id, name: `${product.name} ${offer.packLabel}`, aliases: [product.name, ...product.aliases] }));
  const cands = bestMatchesLocal(label, ents, parsed?.packQty);
  const top = cands[0]; if (!top) return c.json({ error: `Produit « ${label} » introuvable dans votre catalogue` }, 404);
  const row = mine.find((m) => m.offer.id === top.id)!;
  const set: Partial<typeof vendorOffers.$inferInsert> = { updatedAt: new Date() };
  if (parsed) set.packPriceEur = parsed.price.toFixed(2); if (rupture) set.inStock = false; if (dispo) set.inStock = true;
  await db.update(vendorOffers).set(set).where(eq(vendorOffers.id, row.offer.id));
  const linked = await db.select({ id: suppliers.id, restaurantId: suppliers.restaurantId }).from(suppliers).where(eq(suppliers.vendorId, vid));
  for (const s of linked) {
    const [so] = await db.update(supplierOffers).set({ ...(parsed ? { packPriceEur: parsed.price.toFixed(2) } : {}), ...(rupture ? { inStock: false } : {}), ...(dispo ? { inStock: true } : {}), lastSeenAt: new Date() }).where(and(eq(supplierOffers.supplierId, s.id), eq(supplierOffers.productId, row.product.id), eq(supplierOffers.packLabel, row.offer.packLabel))).returning();
    if (so && parsed) await db.insert(priceHistory).values({ restaurantId: s.restaurantId, offerId: so.id, unitPriceEur: (parsed.price / n(row.offer.packQty)).toFixed(4), source: 'catalogue' });
  }
  const what = parsed ? `${eur(n(row.offer.packPriceEur))} → ${eur(parsed.price)}` : rupture ? 'passé en rupture' : 'de nouveau disponible';
  return c.json({ offerId: row.offer.id, productName: row.product.name, packLabel: row.offer.packLabel, message: `${row.product.name} (${row.offer.packLabel}) : ${what}${linked.length ? ` · ${linked.length} restaurant(s) prévenus` : ''}.` });
});
function bestMatchesLocal(label: string, ents: { id: string; name: string; aliases: string[] }[], qty?: number) {
  return ents.map((e) => { let s = Math.max(similarity(label, e.name), ...e.aliases.map((a) => similarity(label, a))); if (qty && new RegExp(`\\b${qty}\\b`).test(e.name)) s += 0.1; return { id: e.id, score: s }; }).filter((m) => m.score >= 0.5).sort((a, b) => b.score - a.score);
}

// ---------------- Chantier 15 (B) : analytics fournisseur ----------------
/** Ventes par produit, meilleurs clients, tendance 6 mois, demande non couverte dans ma zone, alertes vitrine. */
vendorRoutes.get('/vendor/analytics', async (c) => {
  const db = await getDb(); const vid = c.get('vendorId');
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vid));
  const okStatus = sql`${orders.status} in ('confirmee','livree','livree_partiel')`;
  const since = sql`${orders.createdAt} >= now() - interval '90 days'`;
  const byProduct = await db.select({ productId: products.id, name: products.name, category: products.category, unit: products.baseUnit, packs: sql<number>`sum(${orderLines.packs})`, qty: sql<number>`sum(${orderLines.quantity})`, revenue: sql<number>`sum(${orderLines.lineTotalEur})`, orders: sql<number>`count(distinct ${orders.id})`, restaurants: sql<number>`count(distinct ${orders.restaurantId})` })
    .from(orderLines).innerJoin(orders, eq(orders.id, orderLines.orderId)).innerJoin(products, eq(products.id, orderLines.productId)).where(and(eq(orders.vendorId, vid), okStatus, since)).groupBy(products.id, products.name, products.category, products.baseUnit).orderBy(sql`sum(${orderLines.lineTotalEur}) desc`).limit(25);
  const topCustomers = await db.select({ restaurantId: restaurants.id, name: restaurants.name, city: restaurants.city, orders: sql<number>`count(*)`, revenue: sql<number>`sum(${orders.totalEur})`, last: sql<string>`max(${orders.createdAt})` })
    .from(orders).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).where(and(eq(orders.vendorId, vid), okStatus)).groupBy(restaurants.id, restaurants.name, restaurants.city).orderBy(sql`sum(${orders.totalEur}) desc`).limit(10);
  const monthly = await db.select({ month: sql<string>`to_char(date_trunc('month', ${orders.createdAt}), 'YYYY-MM')`, revenue: sql<number>`sum(${orders.totalEur})`, orders: sql<number>`count(*)`, restaurants: sql<number>`count(distinct ${orders.restaurantId})` })
    .from(orders).where(and(eq(orders.vendorId, vid), okStatus, sql`${orders.createdAt} >= date_trunc('month', now()) - interval '5 months'`)).groupBy(sql`1`).orderBy(sql`1`);
  const [funnel] = await db.select({ total: sql<number>`count(*)`, refused: sql<number>`count(*) filter (where ${orders.status} = 'annulee')`, avgDecisionH: sql<number>`coalesce(avg(extract(epoch from (${orders.vendorDecisionAt} - ${orders.sentAt}))/3600) filter (where ${orders.vendorDecisionAt} is not null), 0)` }).from(orders).where(and(eq(orders.vendorId, vid), since));
  // Demande non couverte : produits suivis en stock par les restaurants de ma zone, que je ne propose pas
  const allR = await db.select({ id: restaurants.id, city: restaurants.city, postalCode: restaurants.postalCode }).from(restaurants);
  const myZones = v.deliveryZones.map((z) => z.trim().toLowerCase());
  const inZone = allR.filter((r) => myZones.length === 0 || [...restaurantZones(r)].some((z) => myZones.includes(z.toLowerCase()))).map((r) => r.id);
  let uncovered: { productId: string; name: string; category: string; unit: string; restaurants: number }[] = [];
  if (inZone.length) {
    const mine = new Set((await db.select({ productId: vendorOffers.productId }).from(vendorOffers).where(eq(vendorOffers.vendorId, vid))).map((x) => x.productId));
    const demand = await db.select({ productId: products.id, name: products.name, category: products.category, unit: products.baseUnit, restaurants: sql<number>`count(distinct ${inventoryItems.restaurantId})` })
      .from(inventoryItems).innerJoin(products, eq(products.id, inventoryItems.productId)).where(and(inArray(inventoryItems.restaurantId, inZone), sql`${products.restaurantId} is null`)).groupBy(products.id, products.name, products.category, products.baseUnit).orderBy(sql`count(distinct ${inventoryItems.restaurantId}) desc`).limit(60);
    uncovered = demand.filter((d) => !mine.has(d.productId) && (v.categories.length === 0 || v.categories.includes(d.category))).slice(0, 20).map((d) => ({ ...d, restaurants: n(d.restaurants) }));
  }
  // Alertes vitrine « prévenez-moi » (produits sans offre) — signal de demande publique
  const alerts = await db.select({ message: leads.message, c: sql<number>`count(*)` }).from(leads).where(and(eq(leads.source, 'vitrine'), sql`${leads.createdAt} >= now() - interval '90 days'`)).groupBy(leads.message).orderBy(sql`count(*) desc`).limit(10);
  const num = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, val]) => [k, typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : val])) as T;
  return c.json({ period: '90 jours', byProduct: byProduct.map(num), topCustomers: topCustomers.map(num), monthly: monthly.map(num), funnel: num(funnel), uncovered, restaurantsInZone: inZone.length,
    alerts: alerts.map((a) => ({ product: (a.message ?? '').replace(/^Alerte produit : /, ''), count: n(a.c) })) });
});

// ---------------- Chantier 16 : documents PDF (bon de commande / bon de livraison) ----------------
export async function buildOrderDoc(orderId: string, kind: 'bon_commande' | 'bon_livraison') {
  const db = await getDb();
  const [o] = await db.select({ order: orders, r: restaurants, v: vendors }).from(orders).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).leftJoin(vendors, eq(vendors.id, orders.vendorId)).where(eq(orders.id, orderId)); if (!o) return null;
  const lines = await db.select({ l: orderLines, name: products.name, unit: products.baseUnit }).from(orderLines).innerJoin(products, eq(products.id, orderLines.productId)).where(eq(orderLines.orderId, orderId));
  const [owner] = await db.select({ email: users.email }).from(restaurantMembers).innerJoin(users, eq(users.id, restaurantMembers.userId)).where(and(eq(restaurantMembers.restaurantId, o.r.id), eq(restaurantMembers.role, 'owner')));
  const STATUS: Record<string, string> = { envoyee: 'En attente de confirmation', confirmee: 'Confirmée', livree: 'Livrée', livree_partiel: 'Livrée avec écarts', annulee: 'Annulée' };
  let vendor = { name: o.v?.name ?? 'Fournisseur', city: o.v?.city, email: o.v?.contactEmail, phone: o.v?.contactPhone ?? o.v?.whatsapp };
  if (!o.v) { const [s] = await db.select().from(suppliers).where(eq(suppliers.id, o.order.supplierId)); if (s) vendor = { name: s.name, city: s.city, email: s.email, phone: s.phone ?? s.whatsapp }; }
  return { doc: orderPdf({ kind, reference: o.order.reference, date: o.order.createdAt, status: STATUS[o.order.status] ?? o.order.status, expectedAt: o.order.expectedAt ? new Date(o.order.expectedAt) : null, notes: o.order.notes, vendor, restaurant: { name: o.r.name, address: o.r.address, city: o.r.city, email: owner?.email },
    lines: lines.map((x) => ({ productName: x.name, packLabel: x.l.packLabel, packs: x.l.packs, quantity: n(x.l.quantity), unit: x.unit, unitPriceEur: n(x.l.unitPriceEur), lineTotalEur: n(x.l.lineTotalEur) })), totalEur: n(o.order.totalEur), deliveryFeeEur: n(o.order.deliveryFeeEur) }), order: o.order };
}
vendorRoutes.get('/vendor/orders/:id/pdf', async (c) => {
  const kind = c.req.query('type') === 'livraison' ? 'bon_livraison' : 'bon_commande';
  const r = await buildOrderDoc(c.req.param('id'), kind); if (!r || r.order.vendorId !== c.get('vendorId')) return c.json({ error: 'Commande introuvable' }, 404);
  return new Response(new Uint8Array(r.doc), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${r.order.reference}-${kind}.pdf"` } });
});
