// =============================================================
// Chantier 4 (audit) — « Comprendre ses coûts en une page »
//
// Un seul endpoint qui rassemble ce qu'un restaurateur doit voir :
//   • ce qu'il a dépensé, mois par mois et par catégorie ;
//   • si ses prix montent, par catégorie (indice base 100) ;
//   • quels produits lui coûtent le plus cher à cause d'une hausse (chiffré en euros) ;
//   • pourquoi ses coûts ont bougé ce mois-ci (part volume / part prix) ;
//   • la marge de chaque plat, au coût réel des ingrédients ;
//   • l'évolution du coût d'un plat dans le temps, reconstruite des prix payés.
//
// Aucune valeur codée en dur : tout vient des achats de CE restaurant, au prix
// réellement facturé quand il a été saisi (chantier 3).
// =============================================================
import { Hono } from 'hono';
import { and, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { getDb, orders, orderLines, products, suppliers, supplierOffers, priceHistory, recipes, recipeIngredients, sales } from '@afrisupply/db';
import { requireAuth, requireRestaurant, type Env } from '../lib/auth.js';
import {
  monthRange, monthlySpend, priceIndexByCategory, topPriceDrifts, explainCostChange, recipeMargins, recipeCostHistory,
  type PurchaseLine, type PricePoint, type RecipeInput,
} from '../lib/analysis.js';

export const analysisRoutes = new Hono<Env>();
analysisRoutes.use('*', requireAuth, requireRestaurant);

const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
/** Fenêtre maximale de lecture de l'historique de prix (pour situer la « première hausse »). */
const PRICE_WINDOW_DAYS = 300;

analysisRoutes.get('/analysis', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const rawMonths = c.req.query('months') ?? '6';
  const months = Number(rawMonths);
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    return c.json({ error: 'Fenêtre invalide : « months » doit être un entier entre 1 et 24.' }, 400);
  }
  const window = monthRange(months);
  const [firstYear, firstMonth] = window[0].split('-').map(Number);
  const start = new Date(Date.UTC(firstYear, firstMonth - 1, 1)).toISOString();
  const priceStart = new Date(Date.now() - PRICE_WINDOW_DAYS * 86_400_000).toISOString();

  const [lines, priceRows, recipeRows, ingredientRows, salesRows] = await Promise.all([
    // Achats réellement engagés : les brouillons et les commandes annulées ne sont pas des dépenses.
    db.select({
      orderId: orders.id, reference: orders.reference, at: orders.createdAt, status: orders.status,
      productId: orderLines.productId, productName: products.name, category: products.category, unit: products.baseUnit,
      quantity: orderLines.quantity, receivedQty: orderLines.receivedQty,
      unitPriceEur: orderLines.unitPriceEur, invoicedUnitPriceEur: orderLines.invoicedUnitPriceEur,
      supplierId: suppliers.id, supplierName: suppliers.name,
    }).from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .innerJoin(products, eq(products.id, orderLines.productId))
      .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
      // Une dépense, c'est une commande ENGAGÉE : brouillon, commande préparée mais
      // jamais envoyée et commande annulée ne sont pas de l'argent dépensé.
      .where(and(eq(orders.restaurantId, rid), gte(orders.createdAt, new Date(start)), isNotNull(orders.sentAt), ne(orders.status, 'annulee'))),
    db.select({
      productId: supplierOffers.productId, productName: products.name, category: products.category, unit: products.baseUnit,
      supplierId: suppliers.id, supplierName: suppliers.name,
      unitPrice: priceHistory.unitPriceEur, recordedAt: priceHistory.recordedAt, source: priceHistory.source,
    }).from(priceHistory)
      .innerJoin(supplierOffers, eq(supplierOffers.id, priceHistory.offerId))
      .innerJoin(suppliers, eq(suppliers.id, supplierOffers.supplierId))
      .innerJoin(products, eq(products.id, supplierOffers.productId))
      .where(and(eq(priceHistory.restaurantId, rid), gte(priceHistory.recordedAt, new Date(priceStart)))),
    db.select().from(recipes).where(eq(recipes.restaurantId, rid)),
    db.select({ recipeId: recipeIngredients.recipeId, productId: recipeIngredients.productId, productName: products.name, unit: products.baseUnit, quantity: recipeIngredients.quantity })
      .from(recipeIngredients).innerJoin(products, eq(products.id, recipeIngredients.productId))
      .where(eq(recipeIngredients.recipeId, sql`any(select id from recipes where restaurant_id = ${rid})`)),
    db.select({ recipeId: sales.recipeId, portions: sql<number>`coalesce(sum(${sales.portions}),0)` })
      .from(sales).where(and(eq(sales.restaurantId, rid), gte(sales.day, new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))))
      .groupBy(sales.recipeId),
  ]);

  // --- Achats : le prix facturé prime, la quantité reçue prime ---------------
  const purchases: PurchaseLine[] = lines.map((l) => {
    const invoicedUnit = l.invoicedUnitPriceEur === null || l.invoicedUnitPriceEur === undefined ? null : n(l.invoicedUnitPriceEur);
    const received = l.receivedQty === null || l.receivedQty === undefined ? null : n(l.receivedQty);
    return {
      productId: l.productId, productName: l.productName, category: l.category, unit: l.unit,
      supplierId: l.supplierId, supplierName: l.supplierName, orderId: l.orderId, reference: l.reference,
      at: l.at.toISOString(),
      quantity: received !== null && received > 0 ? received : n(l.quantity),
      unitCostEur: invoicedUnit ?? n(l.unitPriceEur),
      invoiced: invoicedUnit !== null,
    };
  });

  const points: PricePoint[] = priceRows.map((p) => ({
    productId: p.productId, productName: p.productName, category: p.category, unit: p.unit,
    supplierId: p.supplierId, supplierName: p.supplierName,
    unitPrice: n(p.unitPrice), recordedAt: p.recordedAt.toISOString(), source: p.source,
  }));

  // --- Dernier coût connu par produit : sert de base aux marges par plat -----
  const unitCostByProduct = new Map<string, number>();
  for (const p of [...purchases].sort((a, b) => a.at.localeCompare(b.at))) {
    if (p.unitCostEur > 0) unitCostByProduct.set(p.productId, p.unitCostEur);
  }
  for (const p of [...points].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    if (!unitCostByProduct.has(p.productId) && p.unitPrice > 0) unitCostByProduct.set(p.productId, p.unitPrice);
  }

  const portionsByRecipe = new Map(salesRows.map((s) => [s.recipeId, Number(s.portions)]));
  const recipeInputs: RecipeInput[] = recipeRows.map((r) => ({
    id: r.id, name: r.name,
    sellingPriceEur: r.sellingPriceEur === null ? null : n(r.sellingPriceEur),
    targetMarginPct: r.targetMarginPct === null ? null : n(r.targetMarginPct),
    isActive: r.isActive,
    ingredients: ingredientRows.filter((i) => i.recipeId === r.id).map((i) => ({ productId: i.productId, productName: i.productName, unit: i.unit, quantity: n(i.quantity) })),
    portions30: portionsByRecipe.get(r.id) ?? 0,
  }));

  // --- Assemblage -----------------------------------------------------------
  const spend = monthlySpend(purchases, window);
  const bySupplierMap = new Map<string, { supplierId: string | null; supplierName: string; total: number; invoiced: boolean }>();
  for (const p of purchases) {
    const key = p.supplierId ?? p.supplierName;
    const row = bySupplierMap.get(key) ?? { supplierId: p.supplierId, supplierName: p.supplierName, total: 0, invoiced: false };
    row.total += p.quantity * p.unitCostEur;
    row.invoiced = row.invoiced || p.invoiced;
    bySupplierMap.set(key, row);
  }
  const bySupplier = [...bySupplierMap.values()].map((r) => ({ ...r, total: Math.round(r.total * 100) / 100 })).sort((a, b) => b.total - a.total);

  const invoicedShare = purchases.length ? Math.round((purchases.filter((p) => p.invoiced).length / purchases.length) * 100) : 0;
  const currentMonth = window[window.length - 1];
  const currentSpend = purchases.filter((p) => p.at.slice(0, 7) === currentMonth).reduce((a, p) => a + p.quantity * p.unitCostEur, 0);

  return c.json({
    months: window,
    spend: { ...spend, currentMonth, currentMonthTotal: Math.round(currentSpend * 100) / 100, invoicedSharePct: invoicedShare },
    bySupplier,
    prices: priceIndexByCategory(points, window),
    pricesInvoiced: priceIndexByCategory(points, window, { invoicedOnly: true }),
    // Ce qui coûte réellement de l'argent (hausses × quantités achetées)…
    drifts: topPriceDrifts(points, purchases, 10),
    // …et les hausses pas encore chiffrables (aucun achat sur la période) : à surveiller, pas à chiffrer.
    watchlist: topPriceDrifts(points, purchases, 5, { onlyWithVolume: false }).filter((d) => d.quantitySince <= 0),
    explanation: explainCostChange(purchases, window),
    recipes: recipeMargins(recipeInputs, unitCostByProduct),
    recipeHistory: recipeCostHistory(recipeInputs, points, window),
    unitCosts: [...unitCostByProduct.entries()].map(([productId, unitCostEur]) => ({ productId, unitCostEur: Math.round(unitCostEur * 10000) / 10000 })),
  });
});

/** Recettes actives sans ingrédient ou sans prix connu : à signaler dans l'écran. */
analysisRoutes.get('/analysis/gaps', async (c) => {
  const rid = c.get('restaurantId'); const db = await getDb();
  const recs = await db.select().from(recipes).where(and(eq(recipes.restaurantId, rid), eq(recipes.isActive, true)));
  const ing = recs.length
    ? await db.select({ recipeId: recipeIngredients.recipeId, productId: recipeIngredients.productId, quantity: recipeIngredients.quantity }).from(recipeIngredients).where(inArray(recipeIngredients.recipeId, recs.map((r) => r.id)))
    : [];
  const priced = await db.select({ productId: priceHistory.offerId }).from(priceHistory).where(eq(priceHistory.restaurantId, rid)).limit(1);
  const knownProducts = new Set((await db.select({ productId: supplierOffers.productId }).from(supplierOffers).where(eq(supplierOffers.restaurantId, rid))).map((o) => o.productId));
  void priced;
  const missing = recs.map((r) => {
    const items = ing.filter((i) => i.recipeId === r.id);
    return { id: r.id, name: r.name, noIngredients: items.length === 0, unknownPrices: items.filter((i) => !knownProducts.has(i.productId)).length };
  }).filter((r) => r.noIngredients || r.unknownPrices > 0);
  return c.json({ gaps: missing });
});
