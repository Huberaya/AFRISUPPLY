import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, desc, gte, sql, inArray } from 'drizzle-orm';
import {
  getDb, products, suppliers, supplierOffers, priceHistory, inventoryItems, stockMovements,
  orders, orderLines, deliveries, deliveryDiscrepancies, recipes, recipeIngredients, sales, alerts, restaurants,
  quantityCeiling, defaultThresholds,
} from '@afrisupply/db';
import { insertWithFreshReference } from '../lib/reference.js';
import { logOrderEvent } from '../lib/order-events.js';
import { notifyCriticalAlerts } from '../lib/notify.js';
import { requireAuth, requireRestaurant, requireMinRole, type Env } from '../lib/auth.js';
import { checkReceive, checkSend, isUniqueViolation } from '../lib/orders.js';
import {
  computeDailyUse, stockStatus, daysOfStock, alertsFromStock, alertsFromPrices, alertsFromOpportunities,
  compareOffers, recipeCost, marginAnalysis, supplierReliability, type StockSnapshot, type PricePoint,
} from '../lib/engines.js';

export const restaurantRoutes = new Hono<Env>();
restaurantRoutes.use('*', requireAuth, requireRestaurant);

// Chantier 2 (audit) — engager de l'argent (commander) est réservé au responsable ;
// la réception, la saisie de stock et les ventes restent ouvertes à tout le monde.
restaurantRoutes.on(['POST'], '/suppliers', requireMinRole('manager'));
restaurantRoutes.on(['POST'], '/orders', requireMinRole('manager'));
restaurantRoutes.on(['POST'], '/orders/:id/send', requireMinRole('manager'));

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

// --- Chantier 1 (audit) : garde-fous de plausibilité des quantités ---
/** Plafond absolu d'une quantité sur une ligne (au-delà : erreur de saisie, pas une commande). */
const RECEIPT_ABS_MAX = 1_000_000;
/** Chantier 3 (audit) : plafond de plausibilité d'un prix facturé (€ par unité de base). */
const INVOICE_UNIT_MAX = 10_000;
/** Au-delà de ce facteur (et de 50 centimes), le prix facturé est considéré comme une faute de frappe. */
const INVOICE_UNIT_FACTOR = 3;
const MAX_PACKS_PER_LINE = 1000;

/** Sentinelle : la commande a été réceptionnée entre la lecture et l'écriture (double validation). */
class ReceptionAlreadyDone extends Error {
  constructor(public at: Date) { super('reception_already_done'); }
}

/** Vrai si l'erreur vient de l'index unique `deliveries_order_unique` (deux réceptions simultanées). */
/** « 50 kg », « 12,5 L » — pour des messages d'erreur lisibles. */
const fmtQty = (v: number, unit: string) => `${Number(v.toFixed(3)).toLocaleString('fr-FR')} ${unit}`;
/** Chantier 3 (audit) : montants en euros à la française, pour les messages destinés au restaurateur. */
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

/**
 * Vérifie qu'aucune quantité demandée n'est invraisemblable, en s'appuyant sur la
 * consommation réelle du restaurant (et non sur une constante).
 */
export async function assertPlausibleQuantity(
  rid: string,
  asked: { productName: string; productId: string; unit: string; category?: string | null; packQty: number; quantity: number; packs: number }[],
  opts: { override?: boolean } = {},
): Promise<{ error: string; code: string; lines: unknown[] } | null> {
  const db = await getDb();
  const inv = await db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, rid), inArray(inventoryItems.productId, asked.map((a) => a.productId))));
  const out: { productName: string; asked: number; max: number; unit: string; message: string }[] = [];
  for (const a of asked) {
    const criticalLevel = n(inv.find((i) => i.productId === a.productId)?.criticalLevel ?? 0);
    const ceiling = await quantityCeiling(rid, { productId: a.productId, packQty: a.packQty, criticalLevel, category: a.category });
    if (a.quantity > ceiling.maxQuantity && !opts.override) {
      out.push({
        productName: a.productName, asked: a.quantity, max: Math.round(ceiling.maxQuantity), unit: a.unit,
        message: `« ${a.productName} » : ${a.packs} colis (${fmtQty(a.quantity, a.unit)}) dépasse votre maximum habituel de ${ceiling.maxPacks} colis (${Math.round(ceiling.maxQuantity)} ${a.unit}).`,
      });
    }
  }
  if (!out.length) return null;
  return {
    code: 'quantity_out_of_range',
    lines: out,
    error: `Quantité invraisemblable : ${out[0].message} Vérifiez la saisie (${out[0].asked.toLocaleString('fr-FR')} ${out[0].unit} saisis), ` +
      `ou confirmez explicitement si ce volume est réellement voulu.`,
  };
}

// -------------------------------------------------------------
// Helpers de chargement (partagés entre plusieurs routes)
// -------------------------------------------------------------
export async function loadStockSnapshots(rid: string): Promise<StockSnapshot[]> {
  const db = await getDb();
  const [items, salesRows, ingRows] = await Promise.all([
    db.select({ item: inventoryItems, product: products }).from(inventoryItems).innerJoin(products, eq(products.id, inventoryItems.productId)).where(eq(inventoryItems.restaurantId, rid)),
    db.select({ recipeId: sales.recipeId, day: sales.day, portions: sales.portions }).from(sales).where(eq(sales.restaurantId, rid)),
    db.select({ recipeId: recipeIngredients.recipeId, productId: recipeIngredients.productId, quantity: recipeIngredients.quantity }).from(recipeIngredients)
      .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId)).where(eq(recipes.restaurantId, rid)),
  ]);
  const use = computeDailyUse(salesRows, ingRows.map((i) => ({ ...i, quantity: n(i.quantity) })));
  return items.map(({ item, product }) => ({
    productId: product.id, productName: product.name, unit: product.baseUnit,
    quantity: n(item.quantity), criticalLevel: n(item.criticalLevel), targetLevel: item.targetLevel ? n(item.targetLevel) : null,
    avgDailyUse: use.get(product.id) ?? n(item.avgDailyUse),
  }));
}

export async function loadOffers(rid: string, productId?: string) {
  const db = await getDb();
  const where = productId ? and(eq(supplierOffers.restaurantId, rid), eq(supplierOffers.productId, productId)) : eq(supplierOffers.restaurantId, rid);
  const rows = await db.select({ offer: supplierOffers, supplier: suppliers }).from(supplierOffers).innerJoin(suppliers, eq(suppliers.id, supplierOffers.supplierId)).where(where);
  return rows.map(({ offer, supplier }) => ({
    offerId: offer.id, supplierId: supplier.id, supplierName: supplier.name, productId: offer.productId,
    packLabel: offer.packLabel, packQty: n(offer.packQty), packPrice: n(offer.packPriceEur),
    unitPrice: n(offer.packPriceEur) / n(offer.packQty), inStock: offer.inStock, leadTimeHours: supplier.leadTimeHours,
    deliveryFee: n(supplier.deliveryFeeEur), minOrder: n(supplier.minOrderEur),
  }));
}

export async function loadSupplierStats(rid: string) {
  const db = await getDb();
  const rows = await db.select({
    supplierId: orders.supplierId,
    delivered: sql<number>`count(*) filter (where ${orders.status} in ('livree','livree_partiel'))`,
    late: sql<number>`count(*) filter (where ${deliveries.isLate})`,
    discrepancies: sql<number>`count(*) filter (where ${deliveries.hasDiscrepancy})`,
    total: sql<number>`count(*)`,
    spent: sql<number>`coalesce(sum(${orders.totalEur}),0)`,
  }).from(orders).leftJoin(deliveries, eq(deliveries.orderId, orders.id)).where(eq(orders.restaurantId, rid)).groupBy(orders.supplierId);
  const map = new Map<string, { delivered: number; late: number; discrepancies: number; total: number; spent: number; reliability: number }>();
  for (const r of rows) {
    const st = { delivered: n(r.delivered), late: n(r.late), discrepancies: n(r.discrepancies), total: n(r.total), spent: n(r.spent) };
    map.set(r.supplierId, { ...st, reliability: supplierReliability(st) });
  }
  return map;
}

/** Recalcule et persiste (dédupliqué) les alertes stock / prix / opportunités. Utilisé par la route et par le job quotidien. */
export async function refreshAlerts(rid: string) {
  const db = await getDb();
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  const threshold = restaurant.settings?.priceIncreaseAlertPct ?? 8;
  const [stocks, offers, invRows, ph] = await Promise.all([
    loadStockSnapshots(rid), loadOffers(rid),
    db.select({ item: inventoryItems, product: products }).from(inventoryItems).innerJoin(products, eq(products.id, inventoryItems.productId)).where(eq(inventoryItems.restaurantId, rid)),
    db.select({ p: priceHistory, offer: supplierOffers, supplier: suppliers, product: products }).from(priceHistory)
      .innerJoin(supplierOffers, eq(supplierOffers.id, priceHistory.offerId)).innerJoin(suppliers, eq(suppliers.id, supplierOffers.supplierId)).innerJoin(products, eq(products.id, supplierOffers.productId))
      .where(and(eq(priceHistory.restaurantId, rid), gte(priceHistory.recordedAt, new Date(Date.now() - 90 * 86_400_000)))),
  ]);
  const points: PricePoint[] = ph.map((r) => ({ offerId: r.offer.id, supplierId: r.supplier.id, supplierName: r.supplier.name, productId: r.product.id, productName: r.product.name, unit: r.product.baseUnit, unitPrice: n(r.p.unitPriceEur), recordedAt: r.p.recordedAt.toISOString() }));
  const alternatives = new Map<string, PricePoint[]>();
  for (const o of offers) {
    if (!o.inStock) continue;
    const pp: PricePoint = { offerId: o.offerId, supplierId: o.supplierId, supplierName: o.supplierName, productId: o.productId, productName: '', unit: '', unitPrice: o.unitPrice, recordedAt: '' };
    const prod = ph.find((r) => r.product.id === o.productId)?.product; if (prod) { pp.productName = prod.name; pp.unit = prod.baseUnit; }
    if (!alternatives.has(o.productId)) alternatives.set(o.productId, []); alternatives.get(o.productId)!.push(pp);
  }
  const computed = [
    ...alertsFromStock(stocks),
    ...alertsFromPrices(points, threshold, alternatives),
    ...alertsFromOpportunities(invRows.map((r) => ({ productId: r.product.id, productName: r.product.name, unit: r.product.baseUnit, preferredSupplierId: r.item.preferredSupplierId })), offers),
  ];
  let inserted = 0;
  for (const a of computed) {
    const res = await db.insert(alerts).values({ restaurantId: rid, ...a }).onConflictDoNothing().returning({ id: alerts.id });
    inserted += res.length;
  }
  return { computed: computed.length, inserted };
}


// -------------------------------------------------------------
// Dashboard
// -------------------------------------------------------------
restaurantRoutes.get('/dashboard', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  const stocks = await loadStockSnapshots(rid);
  const statuses = stocks.map((s) => ({ ...s, status: stockStatus(s), daysLeft: daysOfStock(s) }));

  const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
  const startPrev = new Date(startMonth); startPrev.setMonth(startPrev.getMonth() - 1);
  const spend = await db.select({
    thisMonth: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${startMonth.toISOString()}),0)`,
    prevMonth: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${startPrev.toISOString()} and ${orders.createdAt} < ${startMonth.toISOString()}),0)`,
    last30: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 30 * 86_400_000).toISOString()}),0)`,
    prev30: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 60 * 86_400_000).toISOString()} and ${orders.createdAt} < ${new Date(Date.now() - 30 * 86_400_000).toISOString()}),0)`,
  }).from(orders).where(and(eq(orders.restaurantId, rid), sql`${orders.status} <> 'annulee'`));
  const sp = spend[0];
  const evolutionPct = n(sp.prev30) > 0 ? ((n(sp.last30) - n(sp.prev30)) / n(sp.prev30)) * 100 : null;

  const recentAlerts = await db.select().from(alerts).where(and(eq(alerts.restaurantId, rid), eq(alerts.isRead, false))).orderBy(desc(alerts.createdAt)).limit(6);
  const recentOrders = await db.select({ order: orders, supplierName: suppliers.name }).from(orders).innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(eq(orders.restaurantId, rid)).orderBy(desc(orders.createdAt)).limit(5);

  return c.json({
    restaurant,
    stock: {
      ok: statuses.filter((s) => s.status === 'ok').length,
      bas: statuses.filter((s) => s.status === 'bas').length,
      critique: statuses.filter((s) => s.status === 'critique').length,
      items: statuses.filter((s) => s.status !== 'ok').sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99)).slice(0, 8),
    },
    spend: { thisMonth: n(sp.thisMonth), prevMonth: n(sp.prevMonth), last30: n(sp.last30), prev30: n(sp.prev30), evolutionPct: evolutionPct === null ? null : Math.round(evolutionPct * 10) / 10 },
    alerts: recentAlerts,
    recentOrders: recentOrders.map((r) => ({ ...r.order, supplierName: r.supplierName })),
  });
});

// -------------------------------------------------------------
// Stock
// -------------------------------------------------------------
restaurantRoutes.get('/stock', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const stocks = await loadStockSnapshots(rid);
  const items = await db.select({ item: inventoryItems, product: products, supplierName: suppliers.name })
    .from(inventoryItems).innerJoin(products, eq(products.id, inventoryItems.productId))
    .leftJoin(suppliers, eq(suppliers.id, inventoryItems.preferredSupplierId)).where(eq(inventoryItems.restaurantId, rid));
  const byProduct = new Map(stocks.map((s) => [s.productId, s]));
  const out = items.map(({ item, product, supplierName }) => {
    const s = byProduct.get(product.id)!;
    return {
      id: item.id, productId: product.id, name: product.name, category: product.category, unit: product.baseUnit,
      quantity: s.quantity, criticalLevel: s.criticalLevel, targetLevel: s.targetLevel, avgDailyUse: s.avgDailyUse,
      daysLeft: daysOfStock(s), status: stockStatus(s), preferredSupplier: supplierName, preferredSupplierId: item.preferredSupplierId, lastCountedAt: item.lastCountedAt,
    };
  }).sort((a, b) => ({ critique: 0, bas: 1, ok: 2 }[a.status] - { critique: 0, bas: 1, ok: 2 }[b.status]) || a.name.localeCompare(b.name));
  return c.json({ items: out });
});

restaurantRoutes.post('/stock/:itemId/movements', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user');
  const body = z.object({ type: z.enum(['reception', 'consommation', 'ajustement', 'perte']), quantity: z.number(), note: z.string().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const [item] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, c.req.param('itemId')), eq(inventoryItems.restaurantId, rid)));
  if (!item) return c.json({ error: 'Article introuvable' }, 404);
  const { type, quantity, note } = body.data;
  // ajustement = nouvelle quantité absolue ; sinon delta signé
  const delta = type === 'ajustement' ? quantity - n(item.quantity) : type === 'reception' ? Math.abs(quantity) : -Math.abs(quantity);
  const newQty = Math.max(0, n(item.quantity) + delta);
  await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: item.id, type, quantity: delta.toFixed(3), note, createdBy: user.id });
  await db.update(inventoryItems).set({ quantity: newQty.toFixed(3), updatedAt: new Date(), ...(type === 'ajustement' ? { lastCountedAt: new Date() } : {}) }).where(eq(inventoryItems.id, item.id));
  return c.json({ ok: true, quantity: newQty });
});

// -------------------------------------------------------------
// Fournisseurs
// -------------------------------------------------------------
restaurantRoutes.get('/suppliers', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [rows, stats, offerCounts] = await Promise.all([
    db.select().from(suppliers).where(eq(suppliers.restaurantId, rid)).orderBy(suppliers.name),
    loadSupplierStats(rid),
    db.select({ supplierId: supplierOffers.supplierId, count: sql<number>`count(*)` }).from(supplierOffers).where(eq(supplierOffers.restaurantId, rid)).groupBy(supplierOffers.supplierId),
  ]);
  const counts = new Map(offerCounts.map((o) => [o.supplierId, n(o.count)]));
  return c.json({
    suppliers: rows.map((s) => ({ ...s, stats: stats.get(s.id) ?? { delivered: 0, late: 0, discrepancies: 0, total: 0, spent: 0, reliability: supplierReliability({ delivered: 0, late: 0, discrepancies: 0 }) }, offerCount: counts.get(s.id) ?? 0 })),
  });
});

restaurantRoutes.get('/suppliers/:id', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const id = c.req.param('id');
  const [s] = await db.select().from(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, rid)));
  if (!s) return c.json({ error: 'Fournisseur introuvable' }, 404);
  const [offers, history, stats] = await Promise.all([
    db.select({ offer: supplierOffers, product: products }).from(supplierOffers).innerJoin(products, eq(products.id, supplierOffers.productId)).where(eq(supplierOffers.supplierId, id)),
    db.select().from(orders).where(eq(orders.supplierId, id)).orderBy(desc(orders.createdAt)).limit(20),
    loadSupplierStats(rid),
  ]);
  return c.json({ supplier: s, stats: stats.get(id), offers: offers.map(({ offer, product }) => ({ ...offer, productName: product.name, unit: product.baseUnit, unitPrice: n(offer.packPriceEur) / n(offer.packQty) })), orders: history });
});

restaurantRoutes.post('/suppliers', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({
    name: z.string().min(2), contactName: z.string().optional(), email: z.string().email().optional().or(z.literal('')), phone: z.string().optional(), whatsapp: z.string().optional(),
    city: z.string().optional(), leadTimeHours: z.number().int().positive().default(48), minOrderEur: z.number().nonnegative().default(0), deliveryFeeEur: z.number().nonnegative().default(0),
    preferredChannel: z.enum(['email', 'whatsapp', 'telephone', 'plateforme']).default('whatsapp'),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const d = body.data;
  const [row] = await db.insert(suppliers).values({ ...d, email: d.email || null, restaurantId: rid, minOrderEur: d.minOrderEur.toFixed(2), deliveryFeeEur: d.deliveryFeeEur.toFixed(2) }).returning();
  return c.json(row, 201);
});

// -------------------------------------------------------------
// Catalogue & comparateur
// -------------------------------------------------------------
restaurantRoutes.get('/products', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const rows = await db.select().from(products).where(sql`${products.restaurantId} is null or ${products.restaurantId} = ${rid}`).orderBy(products.category, products.name);
  return c.json({ products: rows });
});

restaurantRoutes.get('/compare/:productId', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const productId = c.req.param('productId');
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  // Cloisonnement : un produit privé n'existe que pour son restaurant (le référentiel AFRISUPPLY a restaurantId = NULL).
  // Sans cette garde, un restaurant pouvait lire le NOM du produit privé d'un concurrent (BUG-6).
  if (!product || (product.restaurantId && product.restaurantId !== rid)) return c.json({ error: 'Produit introuvable' }, 404);
  const [offers, stats, stocks] = await Promise.all([loadOffers(rid, productId), loadSupplierStats(rid), loadStockSnapshots(rid)]);
  const snap = stocks.find((s) => s.productId === productId);
  const daysLeft = snap ? daysOfStock(snap) : null;
  const neededQty = Number(c.req.query('qty')) || (snap?.targetLevel ? Math.max(0, snap.targetLevel - snap.quantity) : 0) || 1;
  const result = compareOffers(
    offers.map((o) => ({ ...o, reliabilityPct: stats.get(o.supplierId)?.reliability ?? 85 })),
    { daysOfStockLeft: daysLeft, neededQty, unit: product.baseUnit },
  );
  return c.json({ product, stock: snap ? { ...snap, daysLeft, status: stockStatus(snap) } : null, neededQty, ...result });
});

// -------------------------------------------------------------
// Commandes
// -------------------------------------------------------------
restaurantRoutes.get('/orders', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const rows = await db.select({ order: orders, supplierName: suppliers.name }).from(orders).innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(eq(orders.restaurantId, rid)).orderBy(desc(orders.createdAt)).limit(100);
  const ids = rows.map((r) => r.order.id);
  const lines = ids.length ? await db.select({ line: orderLines, productName: products.name }).from(orderLines).innerJoin(products, eq(products.id, orderLines.productId)).where(inArray(orderLines.orderId, ids)) : [];
  return c.json({ orders: rows.map((r) => ({ ...r.order, proofPhoto: undefined, proofSignature: undefined, hasProof: !!(r.order.proofPhoto || r.order.proofSignature || r.order.proofReceiverName), supplierName: r.supplierName, lines: lines.filter((l) => l.line.orderId === r.order.id).map((l) => ({ ...l.line, productName: l.productName })) })) });
});

restaurantRoutes.post('/orders', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user');
  const body = z.object({
    supplierId: z.string().uuid(), channel: z.enum(['email', 'whatsapp', 'telephone', 'plateforme']).optional(), notes: z.string().max(2000).optional(), source: z.string().optional(),
    lines: z.array(z.object({ offerId: z.string().uuid(), packs: z.number().int().positive().max(MAX_PACKS_PER_LINE) })).min(1),
    /** Confirmation explicite : autorise un volume au-delà du plafond de plausibilité. */
    override: z.boolean().optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides : chaque ligne attend un nombre de colis entre 1 et ' + MAX_PACKS_PER_LINE, details: body.error.flatten() }, 400);
  const d = body.data;
  const [sup] = await db.select().from(suppliers).where(and(eq(suppliers.id, d.supplierId), eq(suppliers.restaurantId, rid)));
  if (!sup) return c.json({ error: 'Fournisseur introuvable' }, 404);
  const offers = await db.select({ offer: supplierOffers, product: products }).from(supplierOffers)
    .innerJoin(products, eq(products.id, supplierOffers.productId))
    .where(and(eq(supplierOffers.supplierId, sup.id), inArray(supplierOffers.id, d.lines.map((l) => l.offerId))));
  if (offers.length !== d.lines.length) return c.json({ error: 'Offre invalide pour ce fournisseur' }, 400);

  // Chantier 1 (audit) : refus des quantités invraisemblables (typo 25000000 au lieu de 25)
  const outOfRange = await assertPlausibleQuantity(rid, d.lines.map((l) => {
    const o = offers.find((x) => x.offer.id === l.offerId)!;
    return {
      productId: o.product.id, productName: o.product.name, unit: o.product.baseUnit, category: o.product.category,
      packQty: n(o.offer.packQty) || 1, packs: l.packs, quantity: l.packs * n(o.offer.packQty),
    };
  }), { override: d.override });
  if (outOfRange) return c.json(outOfRange, 400);

  const linesData = d.lines.map((l) => {
    const o = offers.find((x) => x.offer.id === l.offerId)!.offer;
    const qty = l.packs * n(o.packQty); const unit = n(o.packPriceEur) / n(o.packQty);
    return { productId: o.productId, offerId: o.id, packLabel: o.packLabel, packs: l.packs, quantity: qty.toFixed(3), unitPriceEur: unit.toFixed(4), lineTotalEur: (l.packs * n(o.packPriceEur)).toFixed(2) };
  });
  const total = linesData.reduce((a, l) => a + Number(l.lineTotalEur), 0);
  const expected = new Date(Date.now() + sup.leadTimeHours * 3_600_000).toISOString().slice(0, 10);
  // Chantier 12 (suite) : une collision de référence (base semée ou RESTAURÉE) ne doit jamais
  // empêcher un restaurant de commander — l'insertion retente avec la référence suivante.
  const [order] = await insertWithFreshReference((reference) => db.insert(orders).values({
    restaurantId: rid, supplierId: sup.id, reference, status: 'preparee', channel: d.channel ?? sup.preferredChannel, expectedAt: expected,
    totalEur: total.toFixed(2), deliveryFeeEur: sup.deliveryFeeEur, source: d.source ?? 'manuel', notes: d.notes, createdBy: user.id,
  }).returning());
  const reference = order.reference;
  await db.insert(orderLines).values(linesData.map((l) => ({ ...l, orderId: order.id })));
  return c.json({ order, message: `Commande ${reference} préparée chez ${sup.name} pour ${total.toFixed(2).replace('.', ',')} €.` }, 201);
});

/**
 * Envoi de la commande au fournisseur.
 * Chantier 1 (audit) : refus si la commande est déjà réceptionnée, annulée ou à un stade
 * plus avancé (avant : renvoyer une commande « livrée » la faisait repartir en « envoyée »).
 */
restaurantRoutes.post('/orders/:id/send', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [cur] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid)));
  if (!cur) return c.json({ error: 'Commande introuvable' }, 404);
  const refusal = checkSend(cur);
  if (refusal) return c.json({ error: refusal.error, code: refusal.code }, refusal.status);
  const [o] = await db.update(orders).set({ status: 'envoyee', sentAt: cur.sentAt ?? new Date() })
    .where(and(eq(orders.id, cur.id), inArray(orders.status, ['brouillon', 'preparee', 'envoyee']))).returning();
  if (!o) return c.json({ error: 'Cette commande vient de changer d\'état : rechargez la page avant de réessayer.', code: 'order_state_changed' }, 409);
  void logOrderEvent(o.id, 'sent', 'Commande envoyée au fournisseur', 'restaurant');
  return c.json({ order: o });
});

/**
 * Réception : met à jour le stock, enregistre les prix, crée écarts + message de réclamation.
 *
 * Chantier 1 (audit) — trois protections ajoutées :
 *   1. une commande ne peut être réceptionnée qu'UNE fois (`received_at` + index unique sur `deliveries.order_id`) ;
 *   2. la quantité reçue est bornée (plafond de plausibilité dérivé de la consommation réelle) ;
 *   3. tout est écrit dans une seule transaction : soit le stock et la commande avancent ensemble, soit rien ne bouge.
 */
restaurantRoutes.post('/orders/:id/receive', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user');
  const body = z.object({
    lines: z.array(z.object({
      lineId: z.string().uuid(), receivedQty: z.number().nonnegative().max(RECEIPT_ABS_MAX),
      /** Prix réellement facturé par le fournisseur (€ par unité de base : kg, L, pièce…). Optionnel. */
      invoicedUnitPrice: z.number().positive().max(INVOICE_UNIT_MAX).optional(),
    })).min(1),
    notes: z.string().max(500).optional(),
    /** Confirmation explicite : autorise une quantité ou un prix au-delà du plafond de plausibilité. */
    override: z.boolean().optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({
      error: `Quantités reçues invalides (nombre attendu entre 0 et ${RECEIPT_ABS_MAX.toLocaleString('fr-FR')}).`,
      details: body.error.flatten(),
    }, 400);
  }
  const [order] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid)));
  if (!order) return c.json({ error: 'Commande introuvable' }, 404);

  // Garde n°1 : état de la commande (déjà réceptionnée ? annulée ? clôturée ?)
  const refusal = checkReceive(order);
  if (refusal) return c.json({ error: refusal.error, code: refusal.code }, refusal.status);

  const lines = await db.select({ line: orderLines, productName: products.name, unit: products.baseUnit, category: products.category })
    .from(orderLines).innerJoin(products, eq(products.id, orderLines.productId)).where(eq(orderLines.orderId, order.id));
  if (!lines.length) return c.json({ error: 'Cette commande ne contient aucune ligne : rien à réceptionner.' }, 400);

  // --- Validation AVANT toute écriture : plafonds de plausibilité ligne à ligne ---
  const inventory = await db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, rid), inArray(inventoryItems.productId, lines.map((l) => l.line.productId))));
  const overCeiling: { productName: string; asked: number; max: number; unit: string; message: string }[] = [];
  const resolved = new Map<string, number>();
  for (const { line, productName, unit, category } of lines) {
    const asked = body.data.lines.find((l) => l.lineId === line.id)?.receivedQty;
    const received = asked === undefined ? n(line.quantity) : asked;
    resolved.set(line.id, received);
    const packQty = n(line.quantity) / Math.max(1, n(line.packs)) || 1;
    const criticalLevel = n(inventory.find((i) => i.productId === line.productId)?.criticalLevel ?? 0);
    const ceiling = await quantityCeiling(rid, { productId: line.productId, packQty, criticalLevel, category });
    // Une réception tolère un dépassement modéré (erreur du fournisseur, lot plus gros) : ×2 le plafond.
    if (received > ceiling.maxQuantity * 2 && !body.data.override) {
      overCeiling.push({
        productName, asked: received, max: Math.round(ceiling.maxQuantity * 2), unit,
        message: `Vous avez commandé ${fmtQty(n(line.quantity), unit)} et saisissez ${fmtQty(received, unit)} reçus : c'est plus de deux fois votre plafond habituel (${Math.round(ceiling.maxQuantity * 2)} ${unit}).`,
      });
    }
  }
  if (overCeiling.length) {
    return c.json({
      error: `Quantité reçue invraisemblable pour ${overCeiling.length} ligne${overCeiling.length > 1 ? 's' : ''}. ${overCeiling[0].message} Vérifiez la saisie, ou confirmez explicitement si cette quantité est réelle.`,
      code: 'quantity_out_of_range', lines: overCeiling,
    }, 400);
  }

  // --- Prix facturés (chantier 3) : lus, bornés et vérifiés avant toute écriture ---
  const invoicedByLine = new Map<string, number>();
  const invoiceOutOfRange: { productName: string; ordered: number; invoiced: number; unit: string; message: string }[] = [];
  for (const { line, productName, unit } of lines) {
    const invoiced = body.data.lines.find((l) => l.lineId === line.id)?.invoicedUnitPrice;
    if (invoiced === undefined) continue;
    invoicedByLine.set(line.id, invoiced);
    const orderedUnit = n(line.unitPriceEur);
    if (orderedUnit > 0 && invoiced > orderedUnit * INVOICE_UNIT_FACTOR + 0.5 && !body.data.override) {
      invoiceOutOfRange.push({
        productName, ordered: orderedUnit, invoiced, unit,
        message: `${productName} : prix facturé ${eur(invoiced)}/${unit} contre ${eur(orderedUnit)}/${unit} commandés (×${(invoiced / orderedUnit).toFixed(1)}).`,
      });
    }
  }
  if (invoiceOutOfRange.length) {
    return c.json({
      error: `Prix facturé invraisemblable pour ${invoiceOutOfRange.length} ligne${invoiceOutOfRange.length > 1 ? 's' : ''}. ${invoiceOutOfRange[0].message} ` +
        `Vérifiez l'unité de la facture (prix au kilo ou au sac ?), ou confirmez si le fournisseur a réellement facturé ce prix.`,
      code: 'invoice_out_of_range', lines: invoiceOutOfRange,
    }, 400);
  }

  const isLate = !!order.expectedAt && new Date(order.expectedAt).getTime() < Date.now() - 86_400_000;
  const discrepancies: { lineId: string; productName: string; ordered: number; received: number; unit: string }[] = [];
  const priceVariance: { lineId: string; productName: string; unit: string; orderedUnit: number; invoicedUnit: number; deltaUnit: number; deltaPct: number | null; receivedQty: number; deltaEur: number }[] = [];
  const receivedByLine = new Map<string, number>();
  let deliveryId = '';
  let claimMessage: string | null = null;

  try {
    await db.transaction(async (tx) => {
      // Re-lecture verrouillée : si une autre requête a réceptionné entre-temps, elle a posé received_at.
      const [locked] = await tx.select().from(orders).where(eq(orders.id, order.id)).for('update');
      if (locked?.receivedAt) throw new ReceptionAlreadyDone(locked.receivedAt);

      const [delivery] = await tx.insert(deliveries).values({ restaurantId: rid, orderId: order.id, receivedBy: user.id, isLate, notes: body.data.notes }).returning();
      deliveryId = delivery.id;

      for (const { line, productName, unit, category } of lines) {
        const received = resolved.get(line.id) ?? n(line.quantity);
        receivedByLine.set(line.id, received);
        const invoiced = invoicedByLine.get(line.id) ?? null;
        const orderedUnit = n(line.unitPriceEur);
        // Le coût réel de l'entrée en stock est le prix facturé s'il est connu, sinon le prix commandé.
        const unitCost = invoiced ?? orderedUnit;

        await tx.update(orderLines).set({
          receivedQty: received.toFixed(3),
          ...(invoiced !== null ? { invoicedUnitPriceEur: invoiced.toFixed(4) } : {}),
        }).where(eq(orderLines.id, line.id));

        if (received > 0) {
          // Chantier 1 (audit) : un produit reçu sans être suivi naît avec des seuils explicites
          // (≈3 j critique / ≈7 j objectif) — jamais `critical_level = 0` (prévision muette ensuite).
          const dt = defaultThresholds(category);
          await tx.insert(inventoryItems).values({ restaurantId: rid, productId: line.productId, quantity: '0', criticalLevel: dt.criticalLevel.toFixed(3), targetLevel: dt.targetLevel.toFixed(3) })
            .onConflictDoNothing({ target: [inventoryItems.restaurantId, inventoryItems.productId] });
          const [inv] = await tx.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, rid), eq(inventoryItems.productId, line.productId)));
          await tx.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: inv.id, type: 'reception', quantity: received.toFixed(3), unitCostEur: unitCost.toFixed(4), orderId: order.id, createdBy: user.id, note: invoiced !== null ? 'Prix facturé saisi à la réception' : null });
          await tx.update(inventoryItems).set({ quantity: (n(inv.quantity) + received).toFixed(3), updatedAt: new Date() }).where(eq(inventoryItems.id, inv.id));
          if (line.offerId) {
            // L'historique de prix enregistre le prix RÉELLEMENT payé : c'est lui qui fait vivre
            // l'alerte de hausse et l'analyse de coûts (chantier 3 de l'audit).
            await tx.insert(priceHistory).values({ restaurantId: rid, offerId: line.offerId, unitPriceEur: unitCost.toFixed(4), source: invoiced !== null ? 'facture' : 'reception' });
            if (invoiced !== null) {
              // L'offre du fournisseur reflète le dernier prix payé (au lieu du tarif annoncé).
              const [off] = await tx.select().from(supplierOffers).where(eq(supplierOffers.id, line.offerId));
              if (off) await tx.update(supplierOffers).set({ packPriceEur: (invoiced * n(off.packQty)).toFixed(2), lastSeenAt: new Date() }).where(eq(supplierOffers.id, off.id));
            }
          }
        }
        if (Math.abs(received - n(line.quantity)) > 0.001) discrepancies.push({ lineId: line.id, productName, ordered: n(line.quantity), received, unit });
        if (invoiced !== null && Math.abs(invoiced - orderedUnit) > 0.0001) {
          const deltaUnit = invoiced - orderedUnit;
          priceVariance.push({
            lineId: line.id, productName, unit,
            orderedUnit: Math.round(orderedUnit * 10000) / 10000,
            invoicedUnit: Math.round(invoiced * 10000) / 10000,
            deltaUnit: Math.round(deltaUnit * 10000) / 10000,
            deltaPct: orderedUnit > 0 ? Math.round((deltaUnit / orderedUnit) * 1000) / 10 : null,
            receivedQty: received,
            deltaEur: Math.round(deltaUnit * received * 100) / 100,
          });
        }
      }

      // Alerte de surfacturation : la facture dépasse la commande au-delà du bruit d'arrondi.
      const surcharge = priceVariance.reduce((a, v) => a + Math.max(0, v.deltaEur), 0);
      const orderedValue = lines.reduce((a, l) => a + n(l.line.unitPriceEur) * (resolved.get(l.line.id) ?? n(l.line.quantity)), 0);
      if (surcharge > Math.max(1, orderedValue * 0.01)) {
        const worst = priceVariance.filter((v) => v.deltaEur > 0).sort((a, b) => b.deltaEur - a.deltaEur)[0];
        await tx.insert(alerts).values({
          restaurantId: rid, dedupeKey: `facture:${deliveryId}`, kind: 'hausse_prix', severity: 'orange',
          productId: lines.find((l) => l.line.id === worst.lineId)?.line.productId ?? null, supplierId: order.supplierId,
          title: `💸 Facture plus élevée que la commande — ${order.reference}`,
          message: `Les prix facturés dépassent les prix commandés de ${eur(surcharge)} au total. ` +
            `Le plus gros écart : ${worst.productName}, ${eur(worst.orderedUnit)} → ${eur(worst.invoicedUnit)}/${worst.unit} (${worst.deltaPct !== null ? `+${worst.deltaPct} %` : `+${eur(worst.deltaUnit)}`}), soit ${eur(worst.deltaEur)} sur la quantité reçue.`,
          actionUrl: '/app/analyse',
          payload: { reference: order.reference, surchargeEur: Math.round(surcharge * 100) / 100, lines: priceVariance },
        }).onConflictDoNothing();
      }

      if (discrepancies.length) {
        const [sup] = await tx.select().from(suppliers).where(eq(suppliers.id, order.supplierId));
        claimMessage = `Bonjour ${sup?.contactName ?? ''},\n\nNous avons constaté un écart sur la livraison ${order.reference} :\n` +
          discrepancies.map((d) => `• ${d.productName} : commandé ${d.ordered} ${d.unit}, reçu ${d.received} ${d.unit} (${d.ordered - d.received > 0 ? 'manquant' : 'excédent'} ${Math.abs(d.ordered - d.received)} ${d.unit})`).join('\n') +
          `\n\nMerci de nous indiquer la suite à donner (livraison complémentaire ou avoir).\n\nCordialement,\n${user.fullName}`;
        await tx.insert(deliveryDiscrepancies).values(discrepancies.map((d) => ({ deliveryId: delivery.id, orderLineId: d.lineId, orderedQty: d.ordered.toFixed(3), receivedQty: d.received.toFixed(3), reason: d.ordered > d.received ? 'manquant' : 'excédent', claimMessage })));
        await tx.update(deliveries).set({ hasDiscrepancy: true }).where(eq(deliveries.id, delivery.id));
        const missingValue = discrepancies.reduce((a, d) => { const l = lines.find((x) => x.line.id === d.lineId); return a + Math.max(0, d.ordered - d.received) * n(l?.line.unitPriceEur); }, 0);
        await tx.insert(alerts).values({
          restaurantId: rid, dedupeKey: `ecart:${delivery.id}`, kind: 'ecart_livraison', severity: 'orange', supplierId: order.supplierId,
          title: `Écart sur la livraison ${order.reference}`,
          message: `${discrepancies.length} ligne${discrepancies.length > 1 ? 's' : ''} en écart chez ${sup?.name ?? 'le fournisseur'}${missingValue > 0 ? ` (~${missingValue.toFixed(2).replace('.', ',')} € manquants)` : ''}. Réclamation pré-rédigée disponible.`,
          actionUrl: '/app/achats/ecarts', payload: { discrepancies, missingValue },
        }).onConflictDoNothing();
      }

      const allReceived = discrepancies.every((d) => d.received >= d.ordered);
      const now = new Date();
      await tx.update(orders).set({
        status: allReceived ? 'livree' : 'livree_partiel', deliveredAt: now, receivedAt: now,
        // chantier 29 : échéance de paiement = réception + délai accordé (si pas déjà posée par la livraison grossiste)
        dueAt: order.dueAt ?? (order.vendorId ? new Date(now.getTime() + (order.paymentDays ?? 0) * 86_400_000).toISOString().slice(0, 10) : null),
      }).where(eq(orders.id, order.id));
    });
  } catch (e) {
    if (e instanceof ReceptionAlreadyDone) {
      return c.json({ error: `Cette commande a déjà été réceptionnée le ${e.at.toLocaleDateString('fr-FR')} : le stock n'a pas été modifié.`, code: 'order_already_received' }, 409);
    }
    // Verrou de base (index unique deliveries.order_id) : deux validations simultanées.
    if (isUniqueViolation(e, 'deliveries_order_unique')) {
      return c.json({ error: 'Cette commande est déjà en cours de réception (double validation). Rechargez la page : le stock n\'a été modifié qu\'une fois.', code: 'order_already_received' }, 409);
    }
    throw e;
  }

  const allReceived = discrepancies.every((d) => d.received >= d.ordered);
  void logOrderEvent(order.id, 'received', allReceived ? 'Réception confirmée par le restaurant' : 'Réception avec écarts signalés', 'restaurant',
    body.data.override ? { override: true } : undefined);
  // Chantier 6 (audit) : un écart ou une surfacturation ne doit pas attendre le mail du matin.
  // L'appel est protégé : un incident d'e-mail ne peut pas faire échouer une réception déjà enregistrée.
  try { await notifyCriticalAlerts(rid); } catch (e) { console.warn('[notify] réception', (e as Error).message); }
  const surchargeEur = Math.round(priceVariance.reduce((a, v) => a + v.deltaEur, 0) * 100) / 100;
  const invoicedTotal = priceVariance.length || invoicedByLine.size
    ? Math.round(lines.reduce((a, l) => {
        const received = receivedByLine.get(l.line.id) ?? n(l.line.quantity);
        return a + (invoicedByLine.get(l.line.id) ?? n(l.line.unitPriceEur)) * received;
      }, 0) * 100) / 100
    : null;
  const orderedTotal = Math.round(lines.reduce((a, l) => a + n(l.line.unitPriceEur) * (receivedByLine.get(l.line.id) ?? n(l.line.quantity)), 0) * 100) / 100;
  return c.json({
    ok: true, isLate, discrepancies, claimMessage, deliveryId, receivedAt: new Date().toISOString(),
    priceVariance, surchargeEur, orderedTotal, invoicedTotal,
  });
});

// -------------------------------------------------------------
// Recettes & coût matière
// -------------------------------------------------------------
restaurantRoutes.get('/recipes', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [recs, ings, offers] = await Promise.all([
    db.select().from(recipes).where(eq(recipes.restaurantId, rid)).orderBy(recipes.name),
    db.select({ ing: recipeIngredients, product: products }).from(recipeIngredients).innerJoin(products, eq(products.id, recipeIngredients.productId))
      .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId)).where(eq(recipes.restaurantId, rid)),
    loadOffers(rid),
  ]);
  // dernier prix connu par produit = offre la moins chère en stock (proxy du "dernier prix payé" en V1)
  const prices = new Map<string, number>();
  for (const o of offers) if (o.inStock && (!prices.has(o.productId) || o.unitPrice < prices.get(o.productId)!)) prices.set(o.productId, o.unitPrice);
  // historique 30 j pour détecter les dérives par ingrédient
  const hist = await db.select({ productId: supplierOffers.productId, unitPrice: priceHistory.unitPriceEur, recordedAt: priceHistory.recordedAt })
    .from(priceHistory).innerJoin(supplierOffers, eq(supplierOffers.id, priceHistory.offerId)).where(and(eq(priceHistory.restaurantId, rid), gte(priceHistory.recordedAt, new Date(Date.now() - 45 * 86_400_000))));
  const drift = new Map<string, number>();
  for (const pid of new Map(hist.map((h) => [h.productId, 1])).keys()) {
    const pts = hist.filter((h) => h.productId === pid).sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    if (pts.length >= 2) { const first = n(pts[0].unitPrice), last = n(pts[pts.length - 1].unitPrice); if (first > 0) drift.set(pid, Math.round(((last - first) / first) * 1000) / 10); }
  }
  return c.json({
    recipes: recs.map((r) => {
      const list = ings.filter((i) => i.ing.recipeId === r.id).map((i) => ({ productId: i.product.id, productName: i.product.name, quantity: n(i.ing.quantity), unit: i.product.baseUnit }));
      const cost = recipeCost(list, prices);
      const margin = marginAnalysis(cost.total, r.sellingPriceEur ? n(r.sellingPriceEur) : null, n(r.targetMarginPct) || 70);
      const drifting = cost.lines.filter((l) => (drift.get(l.productId) ?? 0) >= 5).map((l) => ({ productName: l.productName, pct: drift.get(l.productId)! }));
      return { ...r, sellingPriceEur: r.sellingPriceEur ? n(r.sellingPriceEur) : null, ingredients: cost.lines, cost: cost.total, unpriced: cost.unpriced, ...margin, drifting };
    }),
  });
});

// -------------------------------------------------------------
// Alertes : calcul à la volée + persistance dédupliquée
// -------------------------------------------------------------
restaurantRoutes.post('/alerts/refresh', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const { computed, inserted } = await refreshAlerts(rid);
  // Chantier 6 : une rupture détectée à l'instant part par e-mail tout de suite (et une seule fois).
  let immediate: Awaited<ReturnType<typeof notifyCriticalAlerts>> | null = null;
  if (inserted > 0) { try { immediate = await notifyCriticalAlerts(rid); } catch (e) { console.warn('[notify] alertes', (e as Error).message); } }
  const all = await db.select().from(alerts).where(and(eq(alerts.restaurantId, rid), eq(alerts.isRead, false))).orderBy(desc(alerts.createdAt));
  return c.json({ computed, inserted, alerts: all, immediate: immediate ? { alerts: immediate.alerts, sent: immediate.sent, status: immediate.status } : null });
});

restaurantRoutes.get('/alerts', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const rows = await db.select().from(alerts).where(eq(alerts.restaurantId, rid)).orderBy(desc(alerts.createdAt)).limit(100);
  return c.json({ alerts: rows });
});

restaurantRoutes.post('/alerts/:id/read', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  await db.update(alerts).set({ isRead: true }).where(and(eq(alerts.id, c.req.param('id')), eq(alerts.restaurantId, rid)));
  return c.json({ ok: true });
});
