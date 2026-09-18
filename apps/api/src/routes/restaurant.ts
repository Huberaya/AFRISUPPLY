import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, desc, gte, sql, inArray } from 'drizzle-orm';
import {
  getDb, products, suppliers, supplierOffers, priceHistory, inventoryItems, stockMovements,
  orders, orderLines, deliveries, recipes, recipeIngredients, sales, alerts, restaurants,
} from '@afrisupply/db';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import {
  computeDailyUse, stockStatus, daysOfStock, alertsFromStock, alertsFromPrices, alertsFromOpportunities,
  compareOffers, recipeCost, marginAnalysis, supplierReliability, type StockSnapshot, type PricePoint,
} from '../lib/engines.js';

export const restaurantRoutes = new Hono<Env>();
restaurantRoutes.use('*', requireAuth, requireRestaurant);

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

// -------------------------------------------------------------
// Helpers de chargement (partagés entre plusieurs routes)
// -------------------------------------------------------------
async function loadStockSnapshots(rid: string): Promise<StockSnapshot[]> {
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

async function loadOffers(rid: string, productId?: string) {
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

async function loadSupplierStats(rid: string) {
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
  if (!product) return c.json({ error: 'Produit introuvable' }, 404);
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
  return c.json({ orders: rows.map((r) => ({ ...r.order, supplierName: r.supplierName, lines: lines.filter((l) => l.line.orderId === r.order.id).map((l) => ({ ...l.line, productName: l.productName })) })) });
});

restaurantRoutes.post('/orders', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user');
  const body = z.object({
    supplierId: z.string().uuid(), channel: z.enum(['email', 'whatsapp', 'telephone', 'plateforme']).optional(), notes: z.string().optional(), source: z.string().optional(),
    lines: z.array(z.object({ offerId: z.string().uuid(), packs: z.number().int().positive() })).min(1),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const d = body.data;
  const [sup] = await db.select().from(suppliers).where(and(eq(suppliers.id, d.supplierId), eq(suppliers.restaurantId, rid)));
  if (!sup) return c.json({ error: 'Fournisseur introuvable' }, 404);
  const offers = await db.select().from(supplierOffers).where(and(eq(supplierOffers.supplierId, sup.id), inArray(supplierOffers.id, d.lines.map((l) => l.offerId))));
  if (offers.length !== d.lines.length) return c.json({ error: 'Offre invalide pour ce fournisseur' }, 400);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(orders).where(eq(orders.restaurantId, rid));
  const reference = `AFS-${new Date().getFullYear()}-${String(n(count) + 1).padStart(6, '0')}`;
  const linesData = d.lines.map((l) => {
    const o = offers.find((x) => x.id === l.offerId)!;
    const qty = l.packs * n(o.packQty); const unit = n(o.packPriceEur) / n(o.packQty);
    return { productId: o.productId, offerId: o.id, packLabel: o.packLabel, packs: l.packs, quantity: qty.toFixed(3), unitPriceEur: unit.toFixed(4), lineTotalEur: (l.packs * n(o.packPriceEur)).toFixed(2) };
  });
  const total = linesData.reduce((a, l) => a + Number(l.lineTotalEur), 0);
  const expected = new Date(Date.now() + sup.leadTimeHours * 3_600_000).toISOString().slice(0, 10);
  const [order] = await db.insert(orders).values({
    restaurantId: rid, supplierId: sup.id, reference, status: 'preparee', channel: d.channel ?? sup.preferredChannel, expectedAt: expected,
    totalEur: total.toFixed(2), deliveryFeeEur: sup.deliveryFeeEur, source: d.source ?? 'manuel', notes: d.notes, createdBy: user.id,
  }).returning();
  await db.insert(orderLines).values(linesData.map((l) => ({ ...l, orderId: order.id })));
  return c.json({ order, message: `Commande ${reference} préparée chez ${sup.name} pour ${total.toFixed(2).replace('.', ',')} €.` }, 201);
});

restaurantRoutes.post('/orders/:id/send', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [o] = await db.update(orders).set({ status: 'envoyee', sentAt: new Date() }).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid))).returning();
  if (!o) return c.json({ error: 'Commande introuvable' }, 404);
  return c.json({ order: o });
});

/** Réception : met à jour le stock, enregistre les prix, crée écarts + message de réclamation. */
restaurantRoutes.post('/orders/:id/receive', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user');
  const body = z.object({ lines: z.array(z.object({ lineId: z.string().uuid(), receivedQty: z.number().nonnegative() })), notes: z.string().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const [order] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid)));
  if (!order) return c.json({ error: 'Commande introuvable' }, 404);
  const lines = await db.select({ line: orderLines, productName: products.name, unit: products.baseUnit }).from(orderLines).innerJoin(products, eq(products.id, orderLines.productId)).where(eq(orderLines.orderId, order.id));

  const isLate = !!order.expectedAt && new Date(order.expectedAt).getTime() < Date.now() - 86_400_000;
  const discrepancies: { lineId: string; productName: string; ordered: number; received: number; unit: string }[] = [];
  const [delivery] = await db.insert(deliveries).values({ restaurantId: rid, orderId: order.id, receivedBy: user.id, isLate, notes: body.data.notes }).returning();

  for (const { line, productName, unit } of lines) {
    const received = body.data.lines.find((l) => l.lineId === line.id)?.receivedQty ?? n(line.quantity);
    await db.update(orderLines).set({ receivedQty: received.toFixed(3) }).where(eq(orderLines.id, line.id));
    if (received > 0) {
      let [inv] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, rid), eq(inventoryItems.productId, line.productId)));
      if (!inv) [inv] = await db.insert(inventoryItems).values({ restaurantId: rid, productId: line.productId, quantity: '0', criticalLevel: '0' }).returning();
      await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: inv.id, type: 'reception', quantity: received.toFixed(3), unitCostEur: line.unitPriceEur, orderId: order.id, createdBy: user.id });
      await db.update(inventoryItems).set({ quantity: (n(inv.quantity) + received).toFixed(3), updatedAt: new Date() }).where(eq(inventoryItems.id, inv.id));
      if (line.offerId) await db.insert(priceHistory).values({ restaurantId: rid, offerId: line.offerId, unitPriceEur: line.unitPriceEur, source: 'reception' });
    }
    if (Math.abs(received - n(line.quantity)) > 0.001) discrepancies.push({ lineId: line.id, productName, ordered: n(line.quantity), received, unit });
  }

  let claimMessage: string | null = null;
  if (discrepancies.length) {
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, order.supplierId));
    claimMessage = `Bonjour ${sup?.contactName ?? ''},\n\nNous avons constaté un écart sur la livraison ${order.reference} :\n` +
      discrepancies.map((d) => `• ${d.productName} : commandé ${d.ordered} ${d.unit}, reçu ${d.received} ${d.unit} (${d.ordered - d.received > 0 ? 'manquant' : 'excédent'} ${Math.abs(d.ordered - d.received)} ${d.unit})`).join('\n') +
      `\n\nMerci de nous indiquer la suite à donner (livraison complémentaire ou avoir).\n\nCordialement,\n${user.fullName}`;
    const { deliveryDiscrepancies } = await import('@afrisupply/db');
    await db.insert(deliveryDiscrepancies).values(discrepancies.map((d) => ({ deliveryId: delivery.id, orderLineId: d.lineId, orderedQty: d.ordered.toFixed(3), receivedQty: d.received.toFixed(3), reason: d.ordered > d.received ? 'manquant' : 'excédent', claimMessage })));
    await db.update(deliveries).set({ hasDiscrepancy: true }).where(eq(deliveries.id, delivery.id));
    const missingValue = discrepancies.reduce((a, d) => { const l = lines.find((x) => x.line.id === d.lineId); return a + Math.max(0, d.ordered - d.received) * n(l?.line.unitPriceEur); }, 0);
    await db.insert(alerts).values({
      restaurantId: rid, dedupeKey: `ecart:${delivery.id}`, kind: 'ecart_livraison', severity: 'orange', supplierId: order.supplierId,
      title: `Écart sur la livraison ${order.reference}`,
      message: `${discrepancies.length} ligne${discrepancies.length > 1 ? 's' : ''} en écart chez ${sup?.name ?? 'le fournisseur'}${missingValue > 0 ? ` (~${missingValue.toFixed(2).replace('.', ',')} € manquants)` : ''}. Réclamation pré-rédigée disponible.`,
      actionUrl: '/app/achats/ecarts', payload: { discrepancies, missingValue },
    }).onConflictDoNothing();
  }
  const allReceived = discrepancies.every((d) => d.received >= d.ordered);
  await db.update(orders).set({ status: allReceived ? 'livree' : 'livree_partiel', deliveredAt: new Date() }).where(eq(orders.id, order.id));
  return c.json({ ok: true, isLate, discrepancies, claimMessage });
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
  const all = await db.select().from(alerts).where(and(eq(alerts.restaurantId, rid), eq(alerts.isRead, false))).orderBy(desc(alerts.createdAt));
  return c.json({ computed: computed.length, inserted, alerts: all });
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
