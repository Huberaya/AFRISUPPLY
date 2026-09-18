// Saisie express (chantier 9) : phrase libre → ventes / comptage / réception / perte ; photo de facture → lignes ; inventaire rapide.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb, recipes, products, inventoryItems, stockMovements, sales, recipeIngredients, suppliers, supplierOffers, priceHistory } from '@afrisupply/db';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import { parseQuick, extractInvoiceFromImage, bestMatches, type QuickKind } from '../lib/quick.js';

export const quickRoutes = new Hono<Env>();
quickRoutes.use('*', requireAuth, requireRestaurant);

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

async function entities(rid: string) {
  const db = await getDb();
  const [recs, items] = await Promise.all([
    db.select({ id: recipes.id, name: recipes.name }).from(recipes).where(and(eq(recipes.restaurantId, rid), eq(recipes.isActive, true))),
    db.select({ id: inventoryItems.id, name: products.name, aliases: products.aliases, unit: products.baseUnit }).from(inventoryItems).innerJoin(products, eq(products.id, inventoryItems.productId)).where(eq(inventoryItems.restaurantId, rid)),
  ]);
  return { recipes: recs, products: items.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases, unit: i.unit as string })) };
}

/** Comprendre sans appliquer : renvoie les lignes reconnues, les ambiguïtés et les candidats. */
quickRoutes.post('/quick/parse', async (c) => {
  const body = z.object({ text: z.string().min(2).max(500), kind: z.enum(['vente', 'comptage', 'reception', 'perte']).optional() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Texte requis' }, 400);
  const ctx = await entities(c.get('restaurantId'));
  return c.json(parseQuick(body.data.text, ctx, body.data.kind));
});

/** Appliquer des lignes confirmées. Ventes → upsert du jour + décrément ; comptage → ajustement ; réception/perte → mouvement. */
quickRoutes.post('/quick/apply', async (c) => {
  const body = z.object({
    kind: z.enum(['vente', 'comptage', 'reception', 'perte']), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().max(200).optional(),
    lines: z.array(z.object({ id: z.string().uuid(), qty: z.number().nonnegative() })).min(1).max(60),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user'); const d = body.data;
  const day = d.day ?? new Date().toISOString().slice(0, 10);

  if (d.kind === 'vente') {
    const ids = d.lines.map((l) => l.id);
    const valid = new Set((await db.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.restaurantId, rid), inArray(recipes.id, ids)))).map((r) => r.id));
    const prev = new Map((await db.select().from(sales).where(and(eq(sales.restaurantId, rid), eq(sales.day, day)))).map((p) => [p.recipeId, p.portions]));
    let applied = 0; let consumed = 0;
    for (const l of d.lines) {
      if (!valid.has(l.id)) continue;
      const portions = Math.round(l.qty); const delta = portions - (prev.get(l.id) ?? 0);
      await db.insert(sales).values({ restaurantId: rid, recipeId: l.id, day, portions }).onConflictDoUpdate({ target: [sales.restaurantId, sales.recipeId, sales.day], set: { portions } });
      applied++;
      if (delta === 0) continue;
      const ings = await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, l.id));
      for (const ing of ings) {
        const [item] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, rid), eq(inventoryItems.productId, ing.productId)));
        if (!item) continue;
        const q = n(ing.quantity) * delta; if (!q) continue;
        await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: item.id, type: 'consommation', quantity: (-q).toFixed(3), note: `Saisie express ventes ${day}`, createdBy: user.id });
        await db.update(inventoryItems).set({ quantity: Math.max(0, n(item.quantity) - q).toFixed(3), updatedAt: new Date() }).where(eq(inventoryItems.id, item.id)); consumed++;
      }
    }
    return c.json({ ok: true, kind: d.kind, day, applied, stockLinesUpdated: consumed });
  }

  const ids = d.lines.map((l) => l.id);
  const items = await db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, rid), inArray(inventoryItems.id, ids)));
  const byId = new Map(items.map((i) => [i.id, i])); let applied = 0;
  for (const l of d.lines) {
    const item = byId.get(l.id); if (!item) continue;
    const type = d.kind === 'comptage' ? 'ajustement' : d.kind === 'reception' ? 'reception' : 'perte';
    const delta = type === 'ajustement' ? l.qty - n(item.quantity) : type === 'reception' ? l.qty : -l.qty;
    if (type !== 'ajustement' && delta === 0) continue;
    await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: item.id, type, quantity: delta.toFixed(3), note: d.note ?? 'Saisie express', createdBy: user.id });
    await db.update(inventoryItems).set({ quantity: Math.max(0, n(item.quantity) + delta).toFixed(3), updatedAt: new Date(), ...(type === 'ajustement' ? { lastCountedAt: new Date() } : {}) }).where(eq(inventoryItems.id, item.id));
    applied++;
  }
  return c.json({ ok: true, kind: d.kind, applied });
});

/** Inventaire rapide : liste ordonnée (à compter en premier = jamais compté / le plus ancien / critique). */
quickRoutes.get('/quick/inventory', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const rows = await db.select({ id: inventoryItems.id, name: products.name, unit: products.baseUnit, category: products.category, quantity: inventoryItems.quantity, criticalLevel: inventoryItems.criticalLevel, lastCountedAt: inventoryItems.lastCountedAt })
    .from(inventoryItems).innerJoin(products, eq(products.id, inventoryItems.productId)).where(eq(inventoryItems.restaurantId, rid));
  const items = rows.map((r) => ({ ...r, quantity: n(r.quantity), criticalLevel: n(r.criticalLevel), daysSinceCount: r.lastCountedAt ? Math.floor((Date.now() - new Date(r.lastCountedAt).getTime()) / 86_400_000) : null }))
    .sort((a, b) => (a.daysSinceCount ?? 999) === (b.daysSinceCount ?? 999) ? a.name.localeCompare(b.name) : (b.daysSinceCount ?? 999) - (a.daysSinceCount ?? 999));
  const [{ counted7 }] = await db.select({ counted7: sql<number>`count(*) filter (where ${inventoryItems.lastCountedAt} > now() - interval '7 days')` }).from(inventoryItems).where(eq(inventoryItems.restaurantId, rid));
  return c.json({ items, total: items.length, countedLast7Days: n(counted7) });
});

/** Photo de facture → lignes proposées, rapprochées au stock et au fournisseur. */
quickRoutes.post('/quick/invoice', async (c) => {
  const body = z.object({ image: z.string().startsWith('data:image/').max(8_000_000) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Image requise (data URL, ≤ 6 Mo)' }, 400);
  const rid = c.get('restaurantId'); const db = await getDb();
  const res = await extractInvoiceFromImage(body.data.image);
  if (!res.ok) return c.json({ error: res.error }, 503);
  const ctx = await entities(rid);
  const sups = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.restaurantId, rid));
  const supplier = res.data.supplierName ? bestMatches(res.data.supplierName, sups, 1)[0] ?? null : null;
  const lines = res.data.lines.map((l) => { const cands = bestMatches(l.label, ctx.products); return { ...l, match: cands[0] && cands[0].score >= 0.6 ? cands[0] : null, candidates: cands }; });
  return c.json({ supplierName: res.data.supplierName ?? null, supplier, date: res.data.date ?? null, total: res.data.total ?? null, lines, matched: lines.filter((l) => l.match).length });
});

/** Valider une facture : réception en stock + mise à jour des prix fournisseur (offre + historique). */
quickRoutes.post('/quick/invoice/apply', async (c) => {
  const body = z.object({
    supplierId: z.string().uuid().optional(), date: z.string().optional(), note: z.string().max(200).optional(),
    lines: z.array(z.object({ inventoryItemId: z.string().uuid(), qty: z.number().positive(), unitPrice: z.number().positive().optional() })).min(1).max(80),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides', details: body.error.flatten() }, 400);
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user'); const d = body.data;
  const items = await db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, rid), inArray(inventoryItems.id, d.lines.map((l) => l.inventoryItemId))));
  const byId = new Map(items.map((i) => [i.id, i])); let received = 0; let pricesUpdated = 0;
  if (d.supplierId) { const [s] = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, d.supplierId), eq(suppliers.restaurantId, rid))); if (!s) return c.json({ error: 'Fournisseur introuvable' }, 404); }
  for (const l of d.lines) {
    const item = byId.get(l.inventoryItemId); if (!item) continue;
    await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: item.id, type: 'reception', quantity: l.qty.toFixed(3), note: d.note ?? `Facture ${d.date ?? ''}`.trim(), createdBy: user.id });
    await db.update(inventoryItems).set({ quantity: (n(item.quantity) + l.qty).toFixed(3), updatedAt: new Date() }).where(eq(inventoryItems.id, item.id)); received++;
    if (d.supplierId && l.unitPrice) {
      const [offer] = await db.insert(supplierOffers).values({ restaurantId: rid, supplierId: d.supplierId, productId: item.productId, packLabel: 'facture', packQty: '1.000', packPriceEur: l.unitPrice.toFixed(2), inStock: true })
        .onConflictDoUpdate({ target: [supplierOffers.supplierId, supplierOffers.productId, supplierOffers.packLabel], set: { packPriceEur: l.unitPrice.toFixed(2), lastSeenAt: new Date() } }).returning();
      await db.insert(priceHistory).values({ restaurantId: rid, offerId: offer.id, unitPriceEur: l.unitPrice.toFixed(4), source: 'facture' }); pricesUpdated++;
    }
  }
  return c.json({ ok: true, received, pricesUpdated });
});

export type { QuickKind };
