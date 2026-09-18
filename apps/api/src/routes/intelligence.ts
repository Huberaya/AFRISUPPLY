// =============================================================
// Intelligence : prévision, panier intelligent, auto-reorder, assistant, ventes
// =============================================================
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, desc, gte, sql, inArray } from 'drizzle-orm';
import {
  getDb, products, suppliers, supplierOffers, priceHistory, inventoryItems, orders, orderLines, deliveries,
  recipes, recipeIngredients, sales, forecasts, reorderRules, alerts, restaurants,
} from '@afrisupply/db';
import { nextOrderReference } from '../lib/reference.js';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import { forecastRecipes, forecastProducts, buildSmartCart, type CartOffer } from '../lib/forecast.js';
import { compareOffers, recipeCost, marginAnalysis, supplierReliability, daysOfStock, stockStatus } from '../lib/engines.js';
import { classifyIntent, llmRephrase, llmEnabled, EXAMPLE_QUESTIONS, eur, qty } from '../lib/assistant.js';

export const intelligenceRoutes = new Hono<Env>();
intelligenceRoutes.use('*', requireAuth, requireRestaurant);
const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

// -------------------------------------------------------------
// Chargeurs
// -------------------------------------------------------------
export async function loadContext(rid: string) {
  const db = await getDb();
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  const [inv, salesRows, ingRows, recs, offerRows, statRows] = await Promise.all([
    db.select({ item: inventoryItems, product: products }).from(inventoryItems).innerJoin(products, eq(products.id, inventoryItems.productId)).where(eq(inventoryItems.restaurantId, rid)),
    db.select({ recipeId: sales.recipeId, day: sales.day, portions: sales.portions }).from(sales).where(and(eq(sales.restaurantId, rid), gte(sales.day, new Date(Date.now() - 70 * 86_400_000).toISOString().slice(0, 10)))),
    db.select({ recipeId: recipeIngredients.recipeId, productId: recipeIngredients.productId, quantity: recipeIngredients.quantity }).from(recipeIngredients).innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId)).where(and(eq(recipes.restaurantId, rid), eq(recipes.isActive, true))),
    db.select().from(recipes).where(eq(recipes.restaurantId, rid)),
    db.select({ offer: supplierOffers, supplier: suppliers }).from(supplierOffers).innerJoin(suppliers, eq(suppliers.id, supplierOffers.supplierId)).where(and(eq(supplierOffers.restaurantId, rid), eq(suppliers.isActive, true))),
    db.select({ supplierId: orders.supplierId, delivered: sql<number>`count(*) filter (where ${orders.status} in ('livree','livree_partiel'))`, late: sql<number>`count(*) filter (where ${deliveries.isLate})`, disc: sql<number>`count(*) filter (where ${deliveries.hasDiscrepancy})`, spent: sql<number>`coalesce(sum(${orders.totalEur}),0)` })
      .from(orders).leftJoin(deliveries, eq(deliveries.orderId, orders.id)).where(eq(orders.restaurantId, rid)).groupBy(orders.supplierId),
  ]);
  const stats = new Map(statRows.map((r) => [r.supplierId, { delivered: n(r.delivered), late: n(r.late), discrepancies: n(r.disc), spent: n(r.spent), reliability: supplierReliability({ delivered: n(r.delivered), late: n(r.late), discrepancies: n(r.disc) }) }]));
  const offers: CartOffer[] = offerRows.map(({ offer, supplier }) => ({ offerId: offer.id, supplierId: supplier.id, supplierName: supplier.name, productId: offer.productId, packLabel: offer.packLabel, packQty: n(offer.packQty), packPrice: n(offer.packPriceEur), unitPrice: n(offer.packPriceEur) / n(offer.packQty), inStock: offer.inStock, leadTimeHours: supplier.leadTimeHours, deliveryFee: n(supplier.deliveryFeeEur), minOrder: n(supplier.minOrderEur), reliabilityPct: stats.get(supplier.id)?.reliability ?? 85 }));
  const stocks = inv.map(({ item, product }) => ({ productId: product.id, productName: product.name, unit: product.baseUnit, quantity: n(item.quantity), criticalLevel: n(item.criticalLevel), targetLevel: item.targetLevel ? n(item.targetLevel) : null, shelfLifeDays: product.shelfLifeDays, preferredSupplierId: item.preferredSupplierId, inventoryItemId: item.id }));
  const ingredients = ingRows.map((i) => ({ ...i, quantity: n(i.quantity) }));
  const horizon = restaurant.settings?.forecastHorizonDays ?? 7;
  const rf = forecastRecipes(salesRows, recs.map((r) => r.id), { horizonDays: horizon });
  const pf = forecastProducts(rf, ingredients, stocks, { horizonDays: horizon });
  return { restaurant, stocks, offers, stats, recipes: recs, ingredients, sales: salesRows, recipeForecasts: rf, productForecasts: pf, horizon };
}

// -------------------------------------------------------------
// Prévision
// -------------------------------------------------------------
intelligenceRoutes.get('/forecast', async (c) => {
  const rid = c.get('restaurantId'); const ctx = await loadContext(rid);
  const recipeView = ctx.recipes.map((r) => ({ id: r.id, name: r.name, ...(ctx.recipeForecasts.get(r.id) ?? { perDay: [], total: 0, confidence: 0 }) }));
  return c.json({ horizonDays: ctx.horizon, generatedAt: new Date().toISOString(), products: ctx.productForecasts, recipes: recipeView, salesDays: new Set(ctx.sales.map((s) => s.day)).size });
});

/** Persiste un instantané (pour suivre la précision dans le temps). */
intelligenceRoutes.post('/forecast/snapshot', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const ctx = await loadContext(rid);
  if (ctx.productForecasts.length) await db.insert(forecasts).values(ctx.productForecasts.map((f) => ({ restaurantId: rid, productId: f.productId, horizonDays: f.horizonDays, predictedNeed: f.predictedNeed.toFixed(3), currentStock: f.currentStock.toFixed(3), recommendedOrder: f.recommendedOrder.toFixed(3), daysOfStockLeft: f.daysOfStockLeft?.toFixed(1), confidence: f.confidence.toFixed(2), explanation: f.explanation })));
  return c.json({ saved: ctx.productForecasts.length });
});

// -------------------------------------------------------------
// Panier intelligent
// -------------------------------------------------------------
intelligenceRoutes.get('/smart-cart', async (c) => {
  const rid = c.get('restaurantId'); const ctx = await loadContext(rid);
  const needs = ctx.productForecasts.filter((f) => f.recommendedOrder > 0).map((f) => {
    const s = ctx.stocks.find((x) => x.productId === f.productId)!;
    return { productId: f.productId, productName: f.productName, unit: f.unit, neededQty: f.recommendedOrder, daysOfStockLeft: f.daysOfStockLeft, preferredSupplierId: s.preferredSupplierId };
  });
  const cart = buildSmartCart(needs, ctx.offers);
  return c.json({ ...cart, needsCount: needs.length, horizonDays: ctx.horizon });
});

/** Transforme le panier (éventuellement modifié) en commandes préparées, une par fournisseur. */
intelligenceRoutes.post('/smart-cart/checkout', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user');
  const body = z.object({ suppliers: z.array(z.object({ supplierId: z.string().uuid(), lines: z.array(z.object({ offerId: z.string().uuid(), packs: z.number().int().positive() })).min(1) })).min(1), source: z.string().default('panier_ia') }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const created: { reference: string; supplierName: string; total: number }[] = [];
  for (const s of body.data.suppliers) {
    const [sup] = await db.select().from(suppliers).where(and(eq(suppliers.id, s.supplierId), eq(suppliers.restaurantId, rid)));
    if (!sup) continue;
    const offs = await db.select().from(supplierOffers).where(and(eq(supplierOffers.supplierId, sup.id), inArray(supplierOffers.id, s.lines.map((l) => l.offerId))));
    const reference = await nextOrderReference();
    const lines = s.lines.flatMap((l) => { const o = offs.find((x) => x.id === l.offerId); if (!o) return []; const unit = n(o.packPriceEur) / n(o.packQty); return [{ productId: o.productId, offerId: o.id, packLabel: o.packLabel, packs: l.packs, quantity: (l.packs * n(o.packQty)).toFixed(3), unitPriceEur: unit.toFixed(4), lineTotalEur: (l.packs * n(o.packPriceEur)).toFixed(2) }]; });
    const total = lines.reduce((a, l) => a + Number(l.lineTotalEur), 0);
    const [order] = await db.insert(orders).values({ restaurantId: rid, supplierId: sup.id, reference, status: 'preparee', channel: sup.preferredChannel, expectedAt: new Date(Date.now() + sup.leadTimeHours * 3_600_000).toISOString().slice(0, 10), totalEur: total.toFixed(2), deliveryFeeEur: sup.deliveryFeeEur, source: body.data.source, createdBy: user.id }).returning();
    await db.insert(orderLines).values(lines.map((l) => ({ ...l, orderId: order.id })));
    created.push({ reference, supplierName: sup.name, total });
  }
  return c.json({ created, message: `${created.length} commande${created.length > 1 ? 's' : ''} préparée${created.length > 1 ? 's' : ''} pour ${eur(created.reduce((a, x) => a + x.total, 0))}. Validez-les dans Achats.` }, 201);
});

// -------------------------------------------------------------
// Auto-Reorder : règles + exécution (préparation, jamais d'envoi)
// -------------------------------------------------------------
intelligenceRoutes.get('/reorder-rules', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const rows = await db.select({ rule: reorderRules, product: products, item: inventoryItems }).from(reorderRules).innerJoin(inventoryItems, eq(inventoryItems.id, reorderRules.inventoryItemId)).innerJoin(products, eq(products.id, inventoryItems.productId)).where(eq(reorderRules.restaurantId, rid));
  return c.json({ rules: rows.map((r) => ({ ...r.rule, productName: r.product.name, unit: r.product.baseUnit, quantity: n(r.item.quantity) })) });
});

intelligenceRoutes.put('/reorder-rules/:inventoryItemId', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({ enabled: z.boolean().default(true), threshold: z.number().nonnegative(), reorderQty: z.number().positive(), supplierStrategy: z.enum(['best', 'preferred']).default('best') }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const [item] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, c.req.param('inventoryItemId')), eq(inventoryItems.restaurantId, rid)));
  if (!item) return c.json({ error: 'Article introuvable' }, 404);
  const [rule] = await db.insert(reorderRules).values({ restaurantId: rid, inventoryItemId: item.id, enabled: body.data.enabled, threshold: body.data.threshold.toFixed(3), reorderQty: body.data.reorderQty.toFixed(3), supplierStrategy: body.data.supplierStrategy })
    .onConflictDoUpdate({ target: reorderRules.inventoryItemId, set: { enabled: body.data.enabled, threshold: body.data.threshold.toFixed(3), reorderQty: body.data.reorderQty.toFixed(3), supplierStrategy: body.data.supplierStrategy } }).returning();
  return c.json(rule);
});

intelligenceRoutes.delete('/reorder-rules/:inventoryItemId', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  await db.delete(reorderRules).where(and(eq(reorderRules.inventoryItemId, c.req.param('inventoryItemId')), eq(reorderRules.restaurantId, rid)));
  return c.json({ ok: true });
});

/** Exécute les règles : pour chaque article sous seuil, prépare une commande + alerte « à valider ». Idempotent (pas de doublon si une commande préparée existe déjà). */
intelligenceRoutes.post('/reorder-rules/run', async (c) => {
  const r = await runAutoReorder(c.get('restaurantId'), c.get('user').id);
  return c.json(r);
});

// -------------------------------------------------------------
// Ventes du jour (alimente la prévision + décrément automatique du stock)
// -------------------------------------------------------------
intelligenceRoutes.get('/sales', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const day = c.req.query('day') ?? new Date().toISOString().slice(0, 10);
  const [recs, rows] = await Promise.all([db.select().from(recipes).where(and(eq(recipes.restaurantId, rid), eq(recipes.isActive, true))).orderBy(recipes.name), db.select().from(sales).where(and(eq(sales.restaurantId, rid), eq(sales.day, day)))]);
  const last14 = await db.select({ day: sales.day, portions: sql<number>`sum(${sales.portions})` }).from(sales).where(and(eq(sales.restaurantId, rid), gte(sales.day, new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)))).groupBy(sales.day).orderBy(sales.day);
  return c.json({ day, recipes: recs.map((r) => ({ id: r.id, name: r.name, portions: rows.find((s) => s.recipeId === r.id)?.portions ?? 0 })), history: last14.map((h) => ({ day: h.day, portions: n(h.portions) })) });
});

intelligenceRoutes.post('/sales', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb(); const user = c.get('user');
  const body = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), lines: z.array(z.object({ recipeId: z.string().uuid(), portions: z.number().int().nonnegative() })), decrementStock: z.boolean().default(true) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Données invalides' }, 400);
  const { day, lines, decrementStock } = body.data;
  const prev = await db.select().from(sales).where(and(eq(sales.restaurantId, rid), eq(sales.day, day)));
  const prevMap = new Map(prev.map((p) => [p.recipeId, p.portions]));
  let consumed = 0;
  for (const l of lines) {
    await db.insert(sales).values({ restaurantId: rid, recipeId: l.recipeId, day, portions: l.portions }).onConflictDoUpdate({ target: [sales.restaurantId, sales.recipeId, sales.day], set: { portions: l.portions } });
    const delta = l.portions - (prevMap.get(l.recipeId) ?? 0);
    if (!decrementStock || delta === 0) continue;
    const ings = await db.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, l.recipeId));
    for (const ing of ings) {
      const [inv] = await db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, rid), eq(inventoryItems.productId, ing.productId)));
      if (!inv) continue;
      const q = delta * n(ing.quantity);
      const { stockMovements } = await import('@afrisupply/db');
      await db.insert(stockMovements).values({ restaurantId: rid, inventoryItemId: inv.id, type: 'consommation', quantity: (-q).toFixed(3), note: `Ventes ${day}`, createdBy: user.id });
      await db.update(inventoryItems).set({ quantity: Math.max(0, n(inv.quantity) - q).toFixed(3), updatedAt: new Date() }).where(eq(inventoryItems.id, inv.id));
      consumed++;
    }
  }
  return c.json({ ok: true, day, movements: consumed });
});

// -------------------------------------------------------------
// Assistant
// -------------------------------------------------------------
intelligenceRoutes.get('/assistant/examples', (c) => c.json({ examples: EXAMPLE_QUESTIONS, llm: llmEnabled() }));

intelligenceRoutes.post('/assistant/ask', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const body = z.object({ question: z.string().min(2).max(500) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: 'Question invalide' }, 400);
  const question = body.data.question; const ctx = await loadContext(rid);
  const supplierNames = [...new Set(ctx.offers.map((o) => o.supplierName))];
  const cls = classifyIntent(question, { products: ctx.stocks.map((s) => s.productName), recipes: ctx.recipes.map((r) => r.name), suppliers: supplierNames });
  const facts: string[] = []; let draft = ''; const actions: { label: string; url: string }[] = [];
  const findStock = (e?: string) => e ? ctx.stocks.find((s) => s.productName === e) ?? ctx.stocks.find((s) => s.productName.toLowerCase().includes(e.toLowerCase())) : undefined;

  switch (cls.intent) {
    case 'what_to_order': {
      const needs = ctx.productForecasts.filter((f) => f.recommendedOrder > 0);
      const cart = buildSmartCart(needs.map((f) => ({ productId: f.productId, productName: f.productName, unit: f.unit, neededQty: f.recommendedOrder, daysOfStockLeft: f.daysOfStockLeft, preferredSupplierId: ctx.stocks.find((s) => s.productId === f.productId)?.preferredSupplierId })), ctx.offers);
      const urgent = needs.filter((f) => f.stockoutDay).slice(0, 5);
      facts.push(`Produits à commander sur ${ctx.horizon} j : ${needs.length}`, ...needs.slice(0, 12).map((f) => `- ${f.productName} : besoin ${qty(f.predictedNeed, f.unit)}, stock ${qty(f.currentStock, f.unit)}, commander ${qty(f.recommendedOrder, f.unit)}${f.stockoutDay ? ` (rupture prévue le ${f.stockoutDay})` : ''}`), `Panier optimisé : ${eur(cart.total)} chez ${cart.suppliers.length} fournisseur(s) ; économie vs habitudes : ${eur(cart.saving)}`);
      draft = needs.length ? `Pour les ${ctx.horizon} prochains jours, tu dois commander **${needs.length} produits**. Les plus urgents : ${urgent.map((f) => `${f.productName} (${qty(f.recommendedOrder, f.unit)}, rupture prévue le ${f.stockoutDay?.slice(8, 10)}/${f.stockoutDay?.slice(5, 7)})`).join(', ') || 'aucune rupture imminente'}. J'ai préparé un panier optimisé de **${eur(cart.total)}** réparti entre ${cart.suppliers.map((s) => s.supplierName).join(', ')}${cart.saving > 0 ? `, soit **${eur(cart.saving)} d'économie** par rapport à tes fournisseurs habituels` : ''}.` : `Bonne nouvelle : d'après tes ventes et ton stock, rien d'urgent à commander sur ${ctx.horizon} jours.`;
      actions.push({ label: 'Voir le panier intelligent', url: '/app/achats/panier' });
      break;
    }
    case 'upcoming_stockouts': {
      const soon = ctx.productForecasts.filter((f) => f.stockoutDay).slice(0, 8);
      facts.push(...soon.map((f) => `- ${f.productName} : stock ${qty(f.currentStock, f.unit)}, besoin/jour ${qty(f.avgDailyNeed, f.unit)}, rupture le ${f.stockoutDay}`));
      draft = soon.length ? `${soon.length} rupture${soon.length > 1 ? 's' : ''} à venir : ${soon.map((f) => `**${f.productName}** le ${f.stockoutDay!.slice(8, 10)}/${f.stockoutDay!.slice(5, 7)} (reste ${qty(f.currentStock, f.unit)}, ~${qty(f.avgDailyNeed, f.unit)}/jour)`).join(' ; ')}.` : 'Aucune rupture prévue sur la période avec ton rythme de ventes actuel.';
      actions.push({ label: 'Voir la prévision', url: '/app/stock/prevision' });
      break;
    }
    case 'stock_level': {
      const s = findStock(cls.entity); if (!s) { draft = `Je ne trouve pas « ${cls.entity ?? question} » dans ton stock suivi.`; break; }
      const f = ctx.productForecasts.find((x) => x.productId === s.productId);
      facts.push(`${s.productName} : ${qty(s.quantity, s.unit)}, seuil ${qty(s.criticalLevel, s.unit)}, besoin/jour ${qty(f?.avgDailyNeed ?? 0, s.unit)}, jours restants ${f?.daysOfStockLeft ?? 'n/a'}`);
      draft = `Il te reste **${qty(s.quantity, s.unit)}** de ${s.productName.toLowerCase()}${f?.daysOfStockLeft !== null && f ? `, soit environ **${f.daysOfStockLeft} jours** au rythme actuel (${qty(f.avgDailyNeed, s.unit)}/jour)` : ''}. ${f?.recommendedOrder ? `Je recommande d'en commander ${qty(f.recommendedOrder, s.unit)}.` : 'Pas besoin de commander pour l\'instant.'}`;
      actions.push({ label: `Comparer les fournisseurs`, url: `/app/achats/comparer/${s.productId}` });
      break;
    }
    case 'find_cheaper': {
      const s = findStock(cls.entity) ?? ctx.stocks.find((x) => cls.entity && x.productName.toLowerCase().startsWith(cls.entity.toLowerCase()));
      if (!s) { draft = 'Précise le produit (ex. « moins cher pour le riz »).'; break; }
      const cands = ctx.offers.filter((o) => o.productId === s.productId);
      const f = ctx.productForecasts.find((x) => x.productId === s.productId);
      const cmp = compareOffers(cands, { daysOfStockLeft: f?.daysOfStockLeft ?? null, neededQty: f?.recommendedOrder || 1, unit: s.unit });
      facts.push(...cmp.ranked.map((o) => `- ${o.supplierName} : ${eur(o.unitPrice)}/${s.unit} (${o.packLabel} ${eur(o.packPrice)}), délai ${Math.round(o.leadTimeHours / 24)} j, ${o.inStock ? 'en stock' : 'rupture'}, fiabilité ${o.reliabilityPct} %, score ${o.score}`));
      draft = cmp.recommended ? `Pour **${s.productName.toLowerCase()}**, ${cmp.ranked.length} fournisseur${cmp.ranked.length > 1 ? 's' : ''} : ${cmp.ranked.map((o) => `${o.supplierName} à ${eur(o.unitPrice)}/${s.unit}`).join(', ')}. ${cmp.headline}. ${cmp.justification.slice(0, 2).join(' ')}` : `Aucun fournisseur ne propose ${s.productName.toLowerCase()} pour l'instant — ajoute une offre via l'import.`;
      actions.push({ label: 'Ouvrir le comparateur', url: `/app/achats/comparer/${s.productId}` });
      break;
    }
    case 'dish_cost': case 'should_raise_price': {
      const r = cls.entity ? ctx.recipes.find((x) => x.name === cls.entity) ?? ctx.recipes.find((x) => x.name.toLowerCase().includes(cls.entity!.toLowerCase())) : undefined;
      if (!r) { draft = `Quel plat ? Tes recettes : ${ctx.recipes.map((x) => x.name).slice(0, 8).join(', ')}.`; break; }
      const prices = new Map<string, number>(); for (const o of ctx.offers) if (o.inStock && (!prices.has(o.productId) || o.unitPrice < prices.get(o.productId)!)) prices.set(o.productId, o.unitPrice);
      const list = ctx.ingredients.filter((i) => i.recipeId === r.id).map((i) => { const s = ctx.stocks.find((x) => x.productId === i.productId); return { productId: i.productId, productName: s?.productName ?? '?', quantity: i.quantity, unit: s?.unit ?? '' }; });
      const cost = recipeCost(list, prices); const sell = r.sellingPriceEur ? n(r.sellingPriceEur) : null; const m = marginAnalysis(cost.total, sell, n(r.targetMarginPct) || 70);
      const top = [...cost.lines].sort((a, b) => b.cost - a.cost).slice(0, 3);
      facts.push(`${r.name} : coût matière ${eur(cost.total)}, prix de vente ${sell ? eur(sell) : 'non renseigné'}, marge brute ${m.grossMargin !== null ? eur(m.grossMargin) : 'n/a'} (${m.marginPct ?? 'n/a'} %), objectif ${n(r.targetMarginPct) || 70} %`, `Top ingrédients : ${top.map((l) => `${l.productName} ${eur(l.cost)}`).join(', ')}`, ...(cost.unpriced.length ? [`Sans prix connu : ${cost.unpriced.join(', ')}`] : []));
      if (cls.intent === 'dish_cost') draft = `Ton **${r.name}** te coûte **${eur(cost.total)}** de matières par portion${sell ? `, pour un prix de vente de ${eur(sell)} : marge brute **${eur(m.grossMargin!)}** (${m.marginPct} %)` : ''}. Les postes principaux : ${top.map((l) => `${l.productName.toLowerCase()} (${eur(l.cost)})`).join(', ')}.${cost.unpriced.length ? ` Attention, ${cost.unpriced.length} ingrédient${cost.unpriced.length > 1 ? 's' : ''} sans prix connu (${cost.unpriced.slice(0, 3).join(', ')}) : le coût réel est un peu plus élevé.` : ''}`;
      else draft = !sell ? `Renseigne d'abord le prix de vente du ${r.name}. Avec un coût matière de ${eur(cost.total)} et un objectif de ${n(r.targetMarginPct) || 70} % de marge, le prix conseillé serait **${eur(m.suggestedPrice!)}**.`
        : m.suggestedPrice ? `Oui, je te le conseille : le ${r.name} est vendu ${eur(sell)} pour ${eur(cost.total)} de matières, soit ${m.marginPct} % de marge, sous ton objectif de ${n(r.targetMarginPct) || 70} %. **Prix conseillé : ${eur(m.suggestedPrice)}**. Alternative : réduire le poste ${top[0].productName.toLowerCase()} (${eur(top[0].cost)}).`
        : `Pas nécessaire : à ${eur(sell)}, ton ${r.name} dégage ${m.marginPct} % de marge brute (${eur(m.grossMargin!)}), au-dessus de ton objectif. Surveille surtout ${top[0].productName.toLowerCase()}, premier poste de coût.`;
      actions.push({ label: 'Voir les recettes', url: '/app/recettes' });
      break;
    }
    case 'most_reliable_supplier': {
      const rows = supplierNames.map((name) => { const id = ctx.offers.find((o) => o.supplierName === name)!.supplierId; return { name, ...(ctx.stats.get(id) ?? { delivered: 0, late: 0, discrepancies: 0, spent: 0, reliability: 85 }) }; }).sort((a, b) => b.reliability - a.reliability || b.delivered - a.delivered);
      facts.push(...rows.map((r) => `- ${r.name} : fiabilité ${r.reliability} %, ${r.delivered} livraisons, ${r.late} retards, ${r.discrepancies} écarts, ${eur(r.spent)} dépensés`));
      const best = rows.find((r) => r.delivered > 0) ?? rows[0]; const worst = [...rows].reverse().find((r) => r.delivered > 0);
      draft = `Ton fournisseur le plus fiable est **${best.name}** (${best.reliability} % sur ${best.delivered} livraisons, ${best.late} retard${best.late > 1 ? 's' : ''}, ${best.discrepancies} écart${best.discrepancies > 1 ? 's' : ''}).${worst && worst.name !== best.name ? ` À surveiller : ${worst.name} (${worst.reliability} %, ${worst.late} retard${worst.late > 1 ? 's' : ''} et ${worst.discrepancies} écart${worst.discrepancies > 1 ? 's' : ''} sur ${worst.delivered}).` : ''}`;
      actions.push({ label: 'Voir les fournisseurs', url: '/app/fournisseurs' });
      break;
    }
    case 'monthly_spend': case 'why_costs_up': {
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const [sp] = await db.select({ month: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${start.toISOString()}),0)`, last30: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 30 * 86_400_000).toISOString()}),0)`, prev30: sql<number>`coalesce(sum(${orders.totalEur}) filter (where ${orders.createdAt} >= ${new Date(Date.now() - 60 * 86_400_000).toISOString()} and ${orders.createdAt} < ${new Date(Date.now() - 30 * 86_400_000).toISOString()}),0)` }).from(orders).where(and(eq(orders.restaurantId, rid), sql`${orders.status} <> 'annulee'`));
      const bySup = await db.select({ name: suppliers.name, total: sql<number>`sum(${orders.totalEur})` }).from(orders).innerJoin(suppliers, eq(suppliers.id, orders.supplierId)).where(and(eq(orders.restaurantId, rid), gte(orders.createdAt, new Date(Date.now() - 30 * 86_400_000)))).groupBy(suppliers.name).orderBy(desc(sql`sum(${orders.totalEur})`));
      const ph = await db.select({ productName: products.name, unit: products.baseUnit, supplierName: suppliers.name, price: priceHistory.unitPriceEur, at: priceHistory.recordedAt, offerId: priceHistory.offerId }).from(priceHistory).innerJoin(supplierOffers, eq(supplierOffers.id, priceHistory.offerId)).innerJoin(products, eq(products.id, supplierOffers.productId)).innerJoin(suppliers, eq(suppliers.id, supplierOffers.supplierId)).where(and(eq(priceHistory.restaurantId, rid), gte(priceHistory.recordedAt, new Date(Date.now() - 60 * 86_400_000)))).orderBy(priceHistory.recordedAt);
      const hikes: { productName: string; supplierName: string; pct: number; from: number; to: number; unit: string }[] = [];
      for (const offerId of new Set(ph.map((p) => p.offerId))) { const pts = ph.filter((p) => p.offerId === offerId); if (pts.length < 2) continue; const a = n(pts[0].price), b = n(pts[pts.length - 1].price); if (a > 0 && (b - a) / a >= 0.05) hikes.push({ productName: pts[0].productName, supplierName: pts[0].supplierName, pct: Math.round(((b - a) / a) * 100), from: a, to: b, unit: pts[0].unit }); }
      hikes.sort((x, y) => y.pct - x.pct);
      const evo = n(sp.prev30) > 0 ? Math.round(((n(sp.last30) - n(sp.prev30)) / n(sp.prev30)) * 100) : null;
      facts.push(`Dépenses mois en cours ${eur(n(sp.month))}, 30 derniers jours ${eur(n(sp.last30))}, 30 j précédents ${eur(n(sp.prev30))}, évolution ${evo ?? 'n/a'} %`, `Par fournisseur (30 j) : ${bySup.map((b) => `${b.name} ${eur(n(b.total))}`).join(', ')}`, `Hausses de prix (60 j) : ${hikes.map((h) => `${h.productName} chez ${h.supplierName} +${h.pct} % (${eur(h.from)}→${eur(h.to)}/${h.unit})`).join(' ; ') || 'aucune'}`);
      if (cls.intent === 'monthly_spend') draft = `Ce mois-ci, tu as dépensé **${eur(n(sp.month))}** chez tes fournisseurs (${eur(n(sp.last30))} sur 30 jours glissants${evo !== null ? `, ${evo > 0 ? '+' : ''}${evo} % vs la période précédente` : ''}). Répartition : ${bySup.slice(0, 4).map((b) => `${b.name} ${eur(n(b.total))}`).join(', ')}.`;
      else draft = `${evo !== null ? `Tes achats ont évolué de **${evo > 0 ? '+' : ''}${evo} %** sur 30 jours (${eur(n(sp.last30))} vs ${eur(n(sp.prev30))}). ` : ''}${hikes.length ? `Les causes identifiées côté prix : ${hikes.slice(0, 3).map((h) => `**${h.productName}** +${h.pct} % chez ${h.supplierName} (${eur(h.from)} → ${eur(h.to)}/${h.unit})`).join(', ')}. ` : 'Aucune hausse de tarif fournisseur significative : la variation vient des volumes commandés. '}${bySup[0] ? `Ton premier poste est ${bySup[0].name} (${eur(n(bySup[0].total))} sur 30 j).` : ''}${hikes.length ? ' Je peux te proposer des alternatives moins chères pour ces produits.' : ''}`;
      actions.push({ label: 'Voir l’analyse', url: '/app/analyse' });
      break;
    }
    default:
      draft = `Je peux t'aider sur : quoi commander, les ruptures à venir, le niveau d'un stock, trouver moins cher, le coût et la marge d'un plat, le fournisseur le plus fiable, tes dépenses et l'évolution des coûts. Essaie par exemple : « ${EXAMPLE_QUESTIONS[0]} »`;
  }

  const factsText = facts.join('\n');
  const polished = await llmRephrase(question, factsText, draft);
  return c.json({ question, intent: cls.intent, entity: cls.entity, confidence: cls.confidence, answer: polished ?? draft, facts, actions, engine: polished ? 'llm' : 'local' });
});

// utilitaires exposés pour d'autres routes/tests
/** Exécute les règles d'auto-reorder : prépare des commandes (jamais d'envoi). Idempotent. */
export async function runAutoReorder(rid: string, userId: string | null = null) {
  const db = await getDb(); const ctx = await loadContext(rid);
  const rules = await db.select().from(reorderRules).where(and(eq(reorderRules.restaurantId, rid), eq(reorderRules.enabled, true)));
  const pending = await db.select({ productId: orderLines.productId }).from(orderLines).innerJoin(orders, eq(orders.id, orderLines.orderId)).where(and(eq(orders.restaurantId, rid), inArray(orders.status, ['preparee', 'envoyee', 'confirmee'])));
  const pendingSet = new Set(pending.map((p) => p.productId));
  const prepared: { productName: string; supplierName: string; packs: number; packLabel: string; total: number; reference: string }[] = []; const skipped: string[] = [];
  for (const rule of rules) {
    const s = ctx.stocks.find((x) => x.inventoryItemId === rule.inventoryItemId); if (!s) continue;
    if (s.quantity > n(rule.threshold)) continue;
    if (pendingSet.has(s.productId)) { skipped.push(`${s.productName} : une commande est déjà en cours`); continue; }
    const cands = ctx.offers.filter((o) => o.productId === s.productId && o.inStock && (rule.supplierStrategy !== 'preferred' || !s.preferredSupplierId || o.supplierId === s.preferredSupplierId));
    if (!cands.length) { skipped.push(`${s.productName} : aucune offre disponible`); continue; }
    const f = ctx.productForecasts.find((x) => x.productId === s.productId);
    const cmp = compareOffers(cands, { daysOfStockLeft: f?.daysOfStockLeft ?? null, neededQty: n(rule.reorderQty), unit: s.unit });
    const best = cmp.recommended!; const packs = Math.max(1, Math.ceil(n(rule.reorderQty) / best.packQty));
    const reference = await nextOrderReference();
    const total = packs * best.packPrice;
    const sup = await db.select().from(suppliers).where(eq(suppliers.id, best.supplierId)).then((r) => r[0]);
    const [order] = await db.insert(orders).values({ restaurantId: rid, supplierId: best.supplierId, reference, status: 'preparee', channel: sup.preferredChannel, expectedAt: new Date(Date.now() + best.leadTimeHours * 3_600_000).toISOString().slice(0, 10), totalEur: total.toFixed(2), deliveryFeeEur: best.deliveryFee.toFixed(2), source: 'auto_reorder', createdBy: userId, notes: cmp.justification.join(' ') }).returning();
    await db.insert(orderLines).values({ orderId: order.id, productId: s.productId, offerId: best.offerId, packLabel: best.packLabel, packs, quantity: (packs * best.packQty).toFixed(3), unitPriceEur: best.unitPrice.toFixed(4), lineTotalEur: total.toFixed(2) });
    await db.insert(alerts).values({ restaurantId: rid, dedupeKey: `auto_reorder:${order.id}`, kind: 'stock_bas', severity: 'blue', title: `🤖 Auto-Reorder — ${s.productName}`, message: `Stock à ${qty(s.quantity, s.unit)} (seuil ${qty(n(rule.threshold), s.unit)}). Commande de ${qty(packs * best.packQty, s.unit)} préparée chez ${best.supplierName} pour ${eur(total)}. ${cmp.justification[1] ?? ''}`.trim(), productId: s.productId, supplierId: best.supplierId, actionUrl: '/app/achats' }).onConflictDoNothing();
    prepared.push({ productName: s.productName, supplierName: best.supplierName, packs, packLabel: best.packLabel, total, reference });
  }
  return { prepared, skipped };
}


export const _ctx = { loadContext, stockStatus, daysOfStock };
