// Chantier 3 — gestion : fournisseurs, offres, recettes, stock (seuils + inventaire),
// commandes (message d'envoi, annulation), écarts de livraison, historique de prix.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, desc, gte, inArray, sql } from 'drizzle-orm';
import {
  getDb, products, suppliers, supplierOffers, priceHistory, inventoryItems, stockMovements,
  orders, orderLines, deliveries, deliveryDiscrepancies, recipes, recipeIngredients, alerts, restaurants, vendors, commissions,
  trackProducts,
} from '@afrisupply/db';
import { sendMail } from '../lib/mailer.js';
import { requireAuth, requireRestaurant, requireMinRole, type Env } from '../lib/auth.js';
import { buildOrderMessage } from '../lib/messages.js';
import { buildOrderDoc } from './vendor.js';
import { logOrderEvent, orderTimeline } from '../lib/order-events.js';
import { checkLineEdit, checkStatusChange, isReceived } from '../lib/orders.js';
import { assertPlausibleQuantity } from './restaurant.js';

export const manageRoutes = new Hono<Env>();
manageRoutes.use('*', requireAuth, requireRestaurant);

// Chantier 2 (audit) — rôles réellement appliqués :
//   • owner  : propriétaire (tout, y compris la suppression d'un fournisseur)
//   • manager: responsable (fournisseurs, recettes, commandes, écarts)
//   • staff  : quotidien (stock, inventaire, réception, ventes) — rien de tout cela ici
manageRoutes.on(['POST'], '/suppliers', requireMinRole('manager'));
manageRoutes.on(['PUT'], '/suppliers/:id', requireMinRole('manager'));
manageRoutes.on(['DELETE'], '/suppliers/:id', requireMinRole('owner'));
manageRoutes.on(['POST'], '/suppliers/:id/offers', requireMinRole('manager'));
manageRoutes.on(['PUT'], '/offers/:id', requireMinRole('manager'));
manageRoutes.on(['DELETE'], '/offers/:id', requireMinRole('manager'));
manageRoutes.on(['POST'], '/recipes', requireMinRole('manager'));
manageRoutes.on(['PUT'], '/recipes/:id', requireMinRole('manager'));
manageRoutes.on(['DELETE'], '/recipes/:id', requireMinRole('manager'));
manageRoutes.on(['PUT'], '/orders/:id', requireMinRole('manager'));
manageRoutes.on(['PUT'], '/orders/:id/lines', requireMinRole('manager'));
manageRoutes.on(['POST'], '/orders/:id/proposal', requireMinRole('manager'));
manageRoutes.on(['POST'], '/discrepancies/:id/resolve', requireMinRole('manager'));

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const CHANNELS = ['email', 'whatsapp', 'telephone', 'plateforme'] as const;
/** Chantier 1 (audit) : plafond structurel de colis sur une ligne (au-delà : erreur de saisie). */
const MAX_PACKS_PER_LINE = 1000;
const CATEGORIES = ['feculents', 'frais', 'viandes_poissons', 'epicerie', 'boissons', 'emballages'] as const;

// -------------------------------------------------------------
// Fournisseurs
// -------------------------------------------------------------
const supplierBody = z.object({
  name: z.string().min(2), contactName: z.string().nullable().optional(), email: z.string().email().nullable().optional().or(z.literal('')),
  phone: z.string().nullable().optional(), whatsapp: z.string().nullable().optional(), city: z.string().nullable().optional(),
  categories: z.array(z.enum(CATEGORIES)).optional(), leadTimeHours: z.number().int().positive().optional(), deliveryDays: z.array(z.number().int().min(1).max(7)).optional(),
  minOrderEur: z.number().nonnegative().optional(), deliveryFeeEur: z.number().nonnegative().optional(), preferredChannel: z.enum(CHANNELS).optional(),
  rating: z.number().min(0).max(5).nullable().optional(), notes: z.string().nullable().optional(), isActive: z.boolean().optional(),
});

manageRoutes.put('/suppliers/:id', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = supplierBody.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const d = body.data;
  const [row] = await db.update(suppliers).set({
    ...d, email: d.email === '' ? null : d.email,
    minOrderEur: d.minOrderEur !== undefined ? d.minOrderEur.toFixed(2) : undefined,
    deliveryFeeEur: d.deliveryFeeEur !== undefined ? d.deliveryFeeEur.toFixed(2) : undefined,
    rating: d.rating === null ? null : d.rating !== undefined ? d.rating.toFixed(1) : undefined,
  }).where(and(eq(suppliers.id, c.req.param('id')), eq(suppliers.restaurantId, rid))).returning();
  if (!row) return c.json({ error: 'Fournisseur introuvable' }, 404);
  return c.json(row);
});

/** Suppression douce : on garde l'historique de commandes. */
manageRoutes.delete('/suppliers/:id', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [row] = await db.update(suppliers).set({ isActive: false }).where(and(eq(suppliers.id, c.req.param('id')), eq(suppliers.restaurantId, rid))).returning({ id: suppliers.id });
  if (!row) return c.json({ error: 'Fournisseur introuvable' }, 404);
  await db.update(supplierOffers).set({ inStock: false }).where(eq(supplierOffers.supplierId, row.id));
  return c.json({ ok: true });
});

// -------------------------------------------------------------
// Offres (prix fournisseur)
// -------------------------------------------------------------
const offerBody = z.object({ productId: z.string().uuid(), packLabel: z.string().min(1), packQty: z.number().positive(), packPrice: z.number().positive(), inStock: z.boolean().default(true) });

manageRoutes.post('/suppliers/:id/offers', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const supplierId = c.req.param('id');
  const body = offerBody.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const [sup] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, supplierId), eq(suppliers.restaurantId, rid)));
  if (!sup) return c.json({ error: 'Fournisseur introuvable' }, 404);
  const d = body.data;
  const [offer] = await db.insert(supplierOffers).values({ restaurantId: rid, supplierId, productId: d.productId, packLabel: d.packLabel, packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock })
    .onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock, lastSeenAt: new Date() } }).returning();
  await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: (d.packPrice / d.packQty).toFixed(4), source: 'manuel' });
  // le produit devient suivi en stock s'il ne l'est pas encore (avec seuils par défaut — chantier 1)
  await trackProducts(rid, [d.productId]);
  return c.json(offer, 201);
});

// Chantier 3 (audit U5) — ajout d'offres en lot : 5 fournisseurs × 20 produits ne doivent plus
// signifier 100 formulaires un par un.
manageRoutes.post('/suppliers/:id/offers/batch', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const supplierId = c.req.param('id');
  const body = z.object({ items: z.array(offerBody).min(1).max(50) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const [sup] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, supplierId), eq(suppliers.restaurantId, rid)));
  if (!sup) return c.json({ error: 'Fournisseur introuvable' }, 404);
  const existing = new Set((await db.select({ productId: supplierOffers.productId }).from(supplierOffers)
    .where(and(eq(supplierOffers.supplierId, supplierId), eq(supplierOffers.restaurantId, rid)))).map((r) => r.productId));
  let created = 0, updated = 0;
  for (const d of body.data.items) {
    const before = existing.has(d.productId);
    const [offer] = await db.insert(supplierOffers).values({ restaurantId: rid, supplierId, productId: d.productId, packLabel: d.packLabel, packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock })
      .onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packQty: d.packQty.toFixed(3), packPriceEur: d.packPrice.toFixed(2), inStock: d.inStock, lastSeenAt: new Date() } }).returning();
    await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: (d.packPrice / d.packQty).toFixed(4), source: 'manuel' });
    if (before) updated++; else created++;
  }
  await trackProducts(rid, body.data.items.map((i) => i.productId));
  return c.json({ saved: body.data.items.length, created, updated }, 201);
});

manageRoutes.put('/offers/:id', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = offerBody.omit({ productId: true }).partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const d = body.data;
  const [before] = await db.select().from(supplierOffers).where(and(eq(supplierOffers.id, c.req.param('id')), eq(supplierOffers.restaurantId, rid)));
  if (!before) return c.json({ error: 'Offre introuvable' }, 404);
  const [offer] = await db.update(supplierOffers).set({
    packLabel: d.packLabel, inStock: d.inStock, lastSeenAt: new Date(),
    packQty: d.packQty !== undefined ? d.packQty.toFixed(3) : undefined, packPriceEur: d.packPrice !== undefined ? d.packPrice.toFixed(2) : undefined,
  }).where(eq(supplierOffers.id, before.id)).returning();
  const unitBefore = n(before.packPriceEur) / n(before.packQty), unitAfter = n(offer.packPriceEur) / n(offer.packQty);
  if (Math.abs(unitAfter - unitBefore) > 0.0001) await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: unitAfter.toFixed(4), source: 'manuel' });
  return c.json({ ...offer, priceChangedPct: unitBefore > 0 ? Math.round(((unitAfter - unitBefore) / unitBefore) * 1000) / 10 : null });
});

manageRoutes.delete('/offers/:id', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [row] = await db.delete(supplierOffers).where(and(eq(supplierOffers.id, c.req.param('id')), eq(supplierOffers.restaurantId, rid))).returning({ id: supplierOffers.id });
  if (!row) return c.json({ error: 'Offre introuvable' }, 404);
  return c.json({ ok: true });
});

/** Historique de prix d'un produit, toutes offres confondues (pour le graphique du comparateur). */
manageRoutes.get('/prices/:productId/history', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const days = Math.min(365, Number(c.req.query('days')) || 90);
  const rows = await db.select({ offerId: priceHistory.offerId, supplierId: supplierOffers.supplierId, supplierName: suppliers.name, packLabel: supplierOffers.packLabel, unitPrice: priceHistory.unitPriceEur, recordedAt: priceHistory.recordedAt, source: priceHistory.source })
    .from(priceHistory).innerJoin(supplierOffers, eq(supplierOffers.id, priceHistory.offerId)).innerJoin(suppliers, eq(suppliers.id, supplierOffers.supplierId))
    .where(and(eq(priceHistory.restaurantId, rid), eq(supplierOffers.productId, c.req.param('productId')), gte(priceHistory.recordedAt, new Date(Date.now() - days * 86_400_000))))
    .orderBy(priceHistory.recordedAt);
  const series = new Map<string, { offerId: string; supplierId: string; supplierName: string; packLabel: string; points: { at: string; price: number; source: string }[] }>();
  for (const r of rows) {
    if (!series.has(r.offerId)) series.set(r.offerId, { offerId: r.offerId, supplierId: r.supplierId, supplierName: r.supplierName, packLabel: r.packLabel, points: [] });
    series.get(r.offerId)!.points.push({ at: r.recordedAt.toISOString(), price: n(r.unitPrice), source: r.source });
  }
  const out = [...series.values()].map((s) => { const first = s.points[0].price, last = s.points[s.points.length - 1].price; return { ...s, first, last, changePct: first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : null }; });
  return c.json({ days, series: out });
});

// -------------------------------------------------------------
// Recettes
// -------------------------------------------------------------
const recipeBody = z.object({
  name: z.string().min(2), sellingPriceEur: z.number().nonnegative().nullable().optional(), targetMarginPct: z.number().min(0).max(100).optional(), isActive: z.boolean().optional(),
  ingredients: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().positive() })).min(1),
});

manageRoutes.post('/recipes', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = recipeBody.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const d = body.data;
  const [r] = await db.insert(recipes).values({ restaurantId: rid, name: d.name, sellingPriceEur: d.sellingPriceEur != null ? d.sellingPriceEur.toFixed(2) : null, targetMarginPct: (d.targetMarginPct ?? 70).toFixed(2) }).returning();
  await db.insert(recipeIngredients).values(d.ingredients.map((i) => ({ recipeId: r.id, productId: i.productId, quantity: i.quantity.toFixed(4) })));
  await trackProducts(rid, d.ingredients.map((i) => i.productId));
  return c.json(r, 201);
});

manageRoutes.put('/recipes/:id', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = recipeBody.partial().safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const d = body.data;
  const [r] = await db.update(recipes).set({
    name: d.name, isActive: d.isActive,
    sellingPriceEur: d.sellingPriceEur === null ? null : d.sellingPriceEur !== undefined ? d.sellingPriceEur.toFixed(2) : undefined,
    targetMarginPct: d.targetMarginPct !== undefined ? d.targetMarginPct.toFixed(2) : undefined,
  }).where(and(eq(recipes.id, c.req.param('id')), eq(recipes.restaurantId, rid))).returning();
  if (!r) return c.json({ error: 'Recette introuvable' }, 404);
  if (d.ingredients) {
    await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, r.id));
    await db.insert(recipeIngredients).values(d.ingredients.map((i) => ({ recipeId: r.id, productId: i.productId, quantity: i.quantity.toFixed(4) })));
    await trackProducts(rid, d.ingredients.map((i) => i.productId));
  }
  return c.json(r);
});

manageRoutes.delete('/recipes/:id', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [r] = await db.delete(recipes).where(and(eq(recipes.id, c.req.param('id')), eq(recipes.restaurantId, rid))).returning({ id: recipes.id });
  if (!r) return c.json({ error: 'Recette introuvable' }, 404);
  return c.json({ ok: true });
});

// -------------------------------------------------------------
// Stock : réglages d'un article, retrait du suivi, inventaire groupé
// -------------------------------------------------------------
manageRoutes.put('/stock/:itemId', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({ criticalLevel: z.number().nonnegative().optional(), targetLevel: z.number().nonnegative().nullable().optional(), preferredSupplierId: z.string().uuid().nullable().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const d = body.data;
  const [row] = await db.update(inventoryItems).set({
    criticalLevel: d.criticalLevel !== undefined ? d.criticalLevel.toFixed(3) : undefined,
    targetLevel: d.targetLevel === null ? null : d.targetLevel !== undefined ? d.targetLevel.toFixed(3) : undefined,
    preferredSupplierId: d.preferredSupplierId, updatedAt: new Date(),
  }).where(and(eq(inventoryItems.id, c.req.param('itemId')), eq(inventoryItems.restaurantId, rid))).returning();
  if (!row) return c.json({ error: 'Article introuvable' }, 404);
  return c.json(row);
});

/**
 * Chantier 1 (audit) — réglage en lot des seuils d'alerte (étape « vos seuils » de l'onboarding).
 * Une seule requête pour 30 produits : indispensable en cuisine, sur mobile.
 */
manageRoutes.post('/stock/thresholds', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({
    items: z.array(z.object({
      itemId: z.string().uuid(),
      criticalLevel: z.number().nonnegative(),
      targetLevel: z.number().nonnegative().nullable().optional(),
    })).min(1).max(200),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  let updated = 0;
  for (const it of body.data.items) {
    const [row] = await db.update(inventoryItems).set({
      criticalLevel: it.criticalLevel.toFixed(3),
      targetLevel: it.targetLevel === null ? null : it.targetLevel !== undefined ? it.targetLevel.toFixed(3) : undefined,
      updatedAt: new Date(),
    }).where(and(eq(inventoryItems.id, it.itemId), eq(inventoryItems.restaurantId, rid))).returning({ id: inventoryItems.id });
    if (row) updated++;
  }
  return c.json({ updated });
});

manageRoutes.delete('/stock/:itemId', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const [row] = await db.delete(inventoryItems).where(and(eq(inventoryItems.id, c.req.param('itemId')), eq(inventoryItems.restaurantId, rid))).returning({ id: inventoryItems.id });
  if (!row) return c.json({ error: 'Article introuvable' }, 404);
  return c.json({ ok: true });
});

/** Inventaire du soir : on envoie les quantités comptées, on génère un ajustement par écart. */
manageRoutes.post('/stock/inventory', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user');
  const body = z.object({ counts: z.array(z.object({ itemId: z.string().uuid(), quantity: z.number().nonnegative() })).min(1), note: z.string().optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const ids = body.data.counts.map((x) => x.itemId);
  const items = await db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, rid), inArray(inventoryItems.id, ids)));
  const now = new Date(); let adjusted = 0; let totalDelta = 0;
  for (const cnt of body.data.counts) {
    const it = items.find((i) => i.id === cnt.itemId); if (!it) continue;
    const delta = cnt.quantity - n(it.quantity);
    if (Math.abs(delta) > 0.0005) {
      await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: it.id, type: 'ajustement', quantity: delta.toFixed(3), note: body.data.note ?? 'Inventaire', createdBy: user.id });
      adjusted++; totalDelta += delta;
    }
    await db.update(inventoryItems).set({ quantity: cnt.quantity.toFixed(3), lastCountedAt: now, updatedAt: now }).where(eq(inventoryItems.id, it.id));
  }
  return c.json({ counted: body.data.counts.length, adjusted, totalDelta: Math.round(totalDelta * 1000) / 1000 });
});

// -------------------------------------------------------------
// Commandes : message d'envoi, modification de statut, annulation
// -------------------------------------------------------------
/** Bon de commande PDF (chantier 16) — côté restaurant. */
manageRoutes.get('/orders/:id/pdf', async (c) => {
  const r = await buildOrderDoc(c.req.param('id'), 'bon_commande'); if (!r || r.order.restaurantId !== c.get('restaurantId')) return c.json({ error: 'Commande introuvable' }, 404);
  return new Response(new Uint8Array(r.doc), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${r.order.reference}.pdf"` } });
});
manageRoutes.get('/orders/:id/message', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user');
  const [row] = await db.select({ order: orders, supplier: suppliers }).from(orders).innerJoin(suppliers, eq(suppliers.id, orders.supplierId)).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid)));
  if (!row) return c.json({ error: 'Commande introuvable' }, 404);
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  const lines = await db.select({ line: orderLines, productName: products.name, unit: products.baseUnit }).from(orderLines).innerJoin(products, eq(products.id, orderLines.productId)).where(eq(orderLines.orderId, row.order.id));
  const msg = buildOrderMessage({
    reference: row.order.reference, restaurantName: restaurant.name, senderName: user.fullName, senderPhone: user.phone ?? null,
    supplier: { name: row.supplier.name, contactName: row.supplier.contactName, email: row.supplier.email, whatsapp: row.supplier.whatsapp ?? row.supplier.phone },
    expectedAt: row.order.expectedAt, notes: row.order.notes, total: n(row.order.totalEur), deliveryFee: n(row.order.deliveryFeeEur),
    lines: lines.map(({ line, productName, unit }) => ({ productName, packLabel: line.packLabel, packs: line.packs, quantity: n(line.quantity), unit, lineTotal: n(line.lineTotalEur) })),
  });
  return c.json(msg);
});

manageRoutes.put('/orders/:id', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({ status: z.enum(['preparee', 'envoyee', 'confirmee', 'annulee']).optional(), expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), notes: z.string().max(2000).nullable().optional(), channel: z.enum(CHANNELS).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const [cur] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid)));
  if (!cur) return c.json({ error: 'Commande introuvable' }, 404);
  // Chantier 1 (audit) : machine à états centralisée (déjà réceptionnée / clôturée / transition impossible)
  if (body.data.status) {
    const refusal = checkStatusChange(cur.status, body.data.status);
    if (refusal) return c.json({ error: refusal.error, code: refusal.code }, refusal.status);
  } else if (isReceived(cur)) {
    return c.json({ error: 'Commande déjà réceptionnée : elle n\'est plus modifiable.', code: 'order_already_received' }, 409);
  }
  const d = body.data;
  const [o] = await db.update(orders).set({ status: d.status, expectedAt: d.expectedAt, notes: d.notes, channel: d.channel, sentAt: d.status === 'envoyee' && !cur.sentAt ? new Date() : undefined }).where(eq(orders.id, cur.id)).returning();
  if (d.status && d.status !== cur.status) void logOrderEvent(cur.id, d.status === 'annulee' ? 'cancelled' : d.status === 'confirmee' ? 'confirmed' : 'note', `Statut modifié par le restaurant : ${cur.status} → ${d.status}`, 'restaurant');
  return c.json({ order: o });
});

/** Modifier les lignes d'une commande encore « préparée ». */
manageRoutes.put('/orders/:id/lines', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({ lines: z.array(z.object({ lineId: z.string().uuid(), packs: z.number().int().nonnegative().max(MAX_PACKS_PER_LINE) })).min(1) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const [cur] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid)));
  if (!cur) return c.json({ error: 'Commande introuvable' }, 404);
  // Chantier 1 (audit) : une commande réceptionnée ou clôturée n'est plus modifiable
  const refusal = checkLineEdit(cur);
  if (refusal) return c.json({ error: refusal.error, code: refusal.code }, refusal.status);
  if (cur.status !== 'preparee') return c.json({ error: 'Seule une commande « préparée » peut être modifiée' }, 409);
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, cur.id));

  // Chantier 1 (audit) : même plafond de plausibilité que la création (consommation réelle du restaurant)
  const asked = await db.select({ line: orderLines, product: products }).from(orderLines).innerJoin(products, eq(products.id, orderLines.productId)).where(eq(orderLines.orderId, cur.id));
  const outOfRange = await assertPlausibleQuantity(rid, asked
    .filter(({ line }) => body.data.lines.some((x) => x.lineId === line.id))
    .map(({ line, product }) => {
      const packs = body.data.lines.find((x) => x.lineId === line.id)!.packs;
      const packQty = n(line.quantity) / Math.max(1, line.packs) || 1;
      return { productId: product.id, productName: product.name, unit: product.baseUnit, category: product.category, packQty, packs, quantity: packs * packQty };
    }));
  if (outOfRange) return c.json(outOfRange, 400);

  for (const l of lines) {
    const upd = body.data.lines.find((x) => x.lineId === l.id); if (!upd) continue;
    if (upd.packs === 0) { await db.delete(orderLines).where(eq(orderLines.id, l.id)); continue; }
    const packQty = n(l.quantity) / l.packs; const packPrice = n(l.lineTotalEur) / l.packs;
    await db.update(orderLines).set({ packs: upd.packs, quantity: (upd.packs * packQty).toFixed(3), lineTotalEur: (upd.packs * packPrice).toFixed(2) }).where(eq(orderLines.id, l.id));
  }
  const [{ total, count }] = await db.select({ total: sql<number>`coalesce(sum(${orderLines.lineTotalEur}),0)`, count: sql<number>`count(*)` }).from(orderLines).where(eq(orderLines.orderId, cur.id));
  if (n(count) === 0) { await db.update(orders).set({ status: 'annulee', totalEur: '0' }).where(eq(orders.id, cur.id)); return c.json({ ok: true, cancelled: true }); }
  const [o] = await db.update(orders).set({ totalEur: n(total).toFixed(2) }).where(eq(orders.id, cur.id)).returning();
  return c.json({ order: o });
});

// -------------------------------------------------------------
// Écarts de livraison
// -------------------------------------------------------------
manageRoutes.get('/discrepancies', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const onlyOpen = c.req.query('all') !== '1';
  const rows = await db.select({ d: deliveryDiscrepancies, delivery: deliveries, order: orders, supplierName: suppliers.name, productName: products.name, unit: products.baseUnit, unitPrice: orderLines.unitPriceEur })
    .from(deliveryDiscrepancies).innerJoin(deliveries, eq(deliveries.id, deliveryDiscrepancies.deliveryId)).innerJoin(orders, eq(orders.id, deliveries.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId)).innerJoin(orderLines, eq(orderLines.id, deliveryDiscrepancies.orderLineId)).innerJoin(products, eq(products.id, orderLines.productId))
    .where(onlyOpen ? and(eq(deliveries.restaurantId, rid), eq(deliveryDiscrepancies.resolved, false)) : eq(deliveries.restaurantId, rid)).orderBy(desc(deliveries.receivedAt)).limit(200);
  const items = rows.map((r) => {
    const missing = n(r.d.orderedQty) - n(r.d.receivedQty);
    return { id: r.d.id, deliveryId: r.delivery.id, orderId: r.order.id, vendorId: r.order.vendorId, reference: r.order.reference, supplierName: r.supplierName, productName: r.productName, unit: r.unit, ordered: n(r.d.orderedQty), received: n(r.d.receivedQty), missing, valueEur: Math.round(missing * n(r.unitPrice) * 100) / 100, reason: r.d.reason, resolved: r.d.resolved, receivedAt: r.delivery.receivedAt, isLate: r.delivery.isLate, claimMessage: r.d.claimMessage };
  });
  const openValue = items.filter((i) => !i.resolved && i.missing > 0).reduce((a, i) => a + i.valueEur, 0);
  return c.json({ items, openValue: Math.round(openValue * 100) / 100 });
});

manageRoutes.post('/discrepancies/:id/resolve', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({ resolution: z.enum(['avoir', 'relivraison', 'abandon']).default('avoir'), note: z.string().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const [row] = await db.select({ d: deliveryDiscrepancies, rid: deliveries.restaurantId }).from(deliveryDiscrepancies).innerJoin(deliveries, eq(deliveries.id, deliveryDiscrepancies.deliveryId)).where(eq(deliveryDiscrepancies.id, c.req.param('id')));
  if (!row || row.rid !== rid) return c.json({ error: 'Écart introuvable' }, 404);
  await db.update(deliveryDiscrepancies).set({ resolved: true, reason: `${row.d.reason ?? 'ecart'} → ${body.data.resolution}${body.data.note ? ` (${body.data.note})` : ''}` }).where(eq(deliveryDiscrepancies.id, row.d.id));
  await db.update(alerts).set({ isRead: true }).where(and(eq(alerts.restaurantId, rid), eq(alerts.dedupeKey, `ecart:${row.d.deliveryId}`)));
  return c.json({ ok: true });
});

/** Chantier 23 : chronologie + preuve de livraison d'une commande (côté restaurant). */
manageRoutes.get('/orders/:id/timeline', async (c) => {
  const db = await getDb(); const rid = c.get('restaurantId');
  const [o] = await db.select({ id: orders.id, fulfillment: orders.fulfillment, deliverySlot: orders.deliverySlot, driverName: orders.driverName, proofPhoto: orders.proofPhoto, proofSignature: orders.proofSignature, proofReceiverName: orders.proofReceiverName, proofNote: orders.proofNote, vendorDeliveredAt: orders.vendorDeliveredAt, shippedAt: orders.shippedAt, preparedAt: orders.preparedAt, expectedAt: orders.expectedAt, status: orders.status }).from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid)));
  if (!o) return c.json({ error: 'Commande introuvable' }, 404);
  return c.json({ order: o, events: await orderTimeline(o.id) });
});

/** Chantier 21 : réponse du restaurant à une proposition de modification (accept → lignes modifiées + commande confirmée ; decline → annulée). */
manageRoutes.post('/orders/:id/proposal', async (c) => {
  const body = z.object({ action: z.enum(['accept', 'decline']) }).safeParse(await c.req.json()); if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const db = await getDb(); const rid = c.get('restaurantId'); const user = c.get('user');
  const [o] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, rid))); if (!o) return c.json({ error: 'Commande introuvable' }, 404);
  if (!o.proposal || o.status !== 'envoyee') return c.json({ error: 'Aucune proposition en attente' }, 400);
  const [v] = o.vendorId ? await db.select().from(vendors).where(eq(vendors.id, o.vendorId)) : [];
  if (body.data.action === 'decline') {
    const [upd] = await db.update(orders).set({ status: 'annulee', vendorDecisionAt: new Date(), vendorNote: 'Proposition de modification refusée par le restaurant', proposal: null }).where(eq(orders.id, o.id)).returning();
    void logOrderEvent(o.id, 'cancelled', 'Proposition refusée par le restaurant — commande annulée', 'restaurant');
    if (v?.contactEmail) void sendMail({ to: v.contactEmail, subject: `❌ ${o.reference} : proposition refusée, commande annulée`, text: `Le restaurant a refusé votre proposition de modification pour la commande ${o.reference}. La commande est annulée.`, html: `<p>Le restaurant a refusé votre proposition de modification pour la commande <b>${o.reference}</b>. La commande est annulée.</p>`, tags: { type: 'order_proposal' } });
    return c.json({ order: upd });
  }
  const p = o.proposal;
  for (const l of p.lines) {
    if (l.newPacks !== l.packs) {
      if (l.newPacks === 0) await db.delete(orderLines).where(eq(orderLines.id, l.lineId));
      else { const [cur] = await db.select().from(orderLines).where(eq(orderLines.id, l.lineId)); if (cur) await db.update(orderLines).set({ packs: l.newPacks, quantity: (Number(cur.quantity) / Number(cur.packs) * l.newPacks).toFixed(3), lineTotalEur: l.newLineTotalEur.toFixed(2) }).where(eq(orderLines.id, l.lineId)); }
    }
    if (l.replacement) { const r = l.replacement; await db.insert(orderLines).values({ orderId: o.id, productId: r.productId, packLabel: r.packLabel, packs: r.packs, quantity: (r.packs * r.packQty).toFixed(3), unitPriceEur: (r.packPriceEur / Math.max(0.001, r.packQty)).toFixed(4), lineTotalEur: r.lineTotalEur.toFixed(2) }); }
  }
  const [upd] = await db.update(orders).set({ status: 'confirmee', totalEur: p.newTotalEur.toFixed(2), expectedAt: p.expectedAt ?? o.expectedAt, vendorDecisionAt: new Date(), vendorNote: p.note ?? 'Modification acceptée par le restaurant', proposal: null }).where(eq(orders.id, o.id)).returning();
  if (v) { const amount = p.newTotalEur * Number(v.commissionPct) / 100; await db.insert(commissions).values({ vendorId: v.id, orderId: o.id, orderTotalEur: p.newTotalEur.toFixed(2), pct: v.commissionPct, amountEur: amount.toFixed(2), period: new Date().toISOString().slice(0, 7) }).onConflictDoNothing(); }
  void logOrderEvent(o.id, 'confirmed', `Modification acceptée par le restaurant — commande confirmée (${p.newTotalEur.toFixed(2).replace('.', ',')} €)`, 'restaurant', { by: user.email });
  if (v?.contactEmail) void sendMail({ to: v.contactEmail, subject: `✅ ${o.reference} : modification acceptée — à préparer`, text: `Le restaurant a accepté votre proposition pour la commande ${o.reference}. Nouveau total ${p.newTotalEur.toFixed(2)} €. La commande est confirmée : préparez-la depuis votre espace.`, html: `<p>Le restaurant a accepté votre proposition pour la commande <b>${o.reference}</b>. Nouveau total <b>${p.newTotalEur.toFixed(2)} €</b>. La commande est confirmée.</p>`, tags: { type: 'order_proposal' } });
  return c.json({ order: { ...upd, proofPhoto: undefined, proofSignature: undefined } });
});
