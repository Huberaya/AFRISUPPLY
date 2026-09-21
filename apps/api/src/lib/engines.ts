// =============================================================
// AFRISUPPLY — Moteurs métier (fonctions PURES, testables)
// Portés depuis ethimarket (alertsEngine, procurementComparator,
// pricingEngine) et adaptés au domaine restaurant / stock.
// Zéro API payante : tout est déterministe et explicable.
// =============================================================

export type Severity = 'red' | 'orange' | 'green' | 'blue';

export interface StockSnapshot {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  criticalLevel: number;
  targetLevel: number | null;
  avgDailyUse: number;          // calculé depuis ventes × recettes (0 si inconnu)
  nextDeliveryInDays?: number;  // prochaine livraison prévue (si commande en cours)
}

export type StockStatus = 'ok' | 'bas' | 'critique';

/** Vrai si le produit porte au moins un repère exploitable (seuil, objectif ou consommation connue). */
export const isStockConfigured = (s: StockSnapshot) => s.criticalLevel > 0 || s.avgDailyUse > 0 || (s.targetLevel ?? 0) > 0;

export function stockStatus(s: StockSnapshot): StockStatus {
  // Chantier 1 (audit) : sans seuil ni consommation connue, « critique » est un faux diagnostic
  // (le fameux « sous votre seuil critique de 0 kg »). Un produit à zéro non configuré est « bas »
  // (à traiter : inventaire + seuil), jamais « critique » — la critique suppose un repère.
  if (!isStockConfigured(s)) return s.quantity <= 0 ? 'bas' : 'ok';
  if (s.quantity <= s.criticalLevel) return 'critique';
  const days = daysOfStock(s);
  if (days !== null && days <= 3) return 'critique';
  if (days !== null && days <= 6) return 'bas';
  if (s.quantity <= s.criticalLevel * 1.5) return 'bas';
  return 'ok';
}

export function daysOfStock(s: StockSnapshot): number | null {
  if (!s.avgDailyUse || s.avgDailyUse <= 0) return null;
  return Math.round((s.quantity / s.avgDailyUse) * 10) / 10;
}

/** Consommation journalière moyenne par produit à partir des ventes (portions) × grammages recette. */
export function computeDailyUse(
  sales: { recipeId: string; day: string; portions: number }[],
  ingredients: { recipeId: string; productId: string; quantity: number }[],
  windowDays = 28,
): Map<string, number> {
  const byRecipe = new Map<string, { productId: string; quantity: number }[]>();
  for (const i of ingredients) {
    if (!byRecipe.has(i.recipeId)) byRecipe.set(i.recipeId, []);
    byRecipe.get(i.recipeId)!.push(i);
  }
  const totals = new Map<string, number>();
  const cutoff = Date.now() - windowDays * 86_400_000;
  for (const s of sales) {
    if (new Date(s.day).getTime() < cutoff) continue;
    for (const ing of byRecipe.get(s.recipeId) ?? []) {
      totals.set(ing.productId, (totals.get(ing.productId) ?? 0) + s.portions * ing.quantity);
    }
  }
  const out = new Map<string, number>();
  for (const [pid, total] of totals) out.set(pid, Math.round((total / windowDays) * 1000) / 1000);
  return out;
}

// -------------------------------------------------------------
// Alertes
// -------------------------------------------------------------
export interface EngineAlert {
  dedupeKey: string;
  kind: 'rupture' | 'stock_bas' | 'hausse_prix' | 'opportunite' | 'fournisseur' | 'ecart_livraison';
  severity: Severity;
  title: string;
  message: string;
  productId?: string;
  supplierId?: string;
  actionUrl?: string;
  payload?: Record<string, unknown>;
}

const fmtQty = (q: number, unit: string) => `${Number.isInteger(q) ? q : q.toFixed(1)} ${unit}`;
const fmtEur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

/** 🔴 rupture imminente / 🟠 stock bas */
export function alertsFromStock(stocks: StockSnapshot[], today = new Date()): EngineAlert[] {
  const out: EngineAlert[] = [];
  const dayKey = today.toISOString().slice(0, 10);
  for (const s of stocks) {
    const status = stockStatus(s);
    const days = daysOfStock(s);
    // Chantier 1 (audit) : produit à zéro sans aucun repère → une invitation à configurer (bleue),
    // pas 31 fausses « ruptures » le premier jour.
    if (!isStockConfigured(s)) {
      if (s.quantity <= 0) out.push({
        dedupeKey: `a_configurer:${s.productId}:${dayKey}`, kind: 'stock_bas', severity: 'blue',
        title: `⚪ À renseigner — ${s.productName}`,
        message: `Stock à 0 et aucun seuil pour ${s.productName.toLowerCase()} : faites un inventaire et fixez un seuil critique pour être alerté avant les ruptures.`,
        productId: s.productId, actionUrl: '/app/stock', payload: { quantity: s.quantity },
      });
      continue;
    }
    if (status === 'critique') {
      const reason = s.quantity <= s.criticalLevel
        ? `Stock actuel ${fmtQty(s.quantity, s.unit)}, sous votre seuil critique de ${fmtQty(s.criticalLevel, s.unit)}.`
        : `Stock actuel ${fmtQty(s.quantity, s.unit)} pour une consommation d'environ ${fmtQty(s.avgDailyUse, s.unit)}/jour : rupture dans ~${days} jour${days && days > 1 ? 's' : ''}.`;
      out.push({
        dedupeKey: `rupture:${s.productId}:${dayKey}`, kind: 'rupture', severity: 'red',
        title: `🔴 Rupture imminente — ${s.productName}`, message: reason, productId: s.productId,
        actionUrl: `/achats/comparer/${s.productId}`, payload: { quantity: s.quantity, daysLeft: days },
      });
    } else if (status === 'bas') {
      out.push({
        dedupeKey: `stock_bas:${s.productId}:${dayKey}`, kind: 'stock_bas', severity: 'orange',
        title: `🟠 Stock bas — ${s.productName}`,
        message: days !== null
          ? `Il vous reste environ ${days} jours de ${s.productName.toLowerCase()} (${fmtQty(s.quantity, s.unit)}). Pensez à commander.`
          : `Stock de ${s.productName.toLowerCase()} à ${fmtQty(s.quantity, s.unit)}, proche du seuil critique.`,
        productId: s.productId, actionUrl: `/stock`, payload: { quantity: s.quantity, daysLeft: days },
      });
    }
  }
  return out;
}

export interface PricePoint { offerId: string; supplierId: string; supplierName: string; productId: string; productName: string; unit: string; unitPrice: number; recordedAt: string }

/** 📈 hausse de prix détectée entre le prix courant et la moyenne des 30–90 derniers jours. */
export function alertsFromPrices(points: PricePoint[], thresholdPct = 8, alternatives: Map<string, PricePoint[]> = new Map()): EngineAlert[] {
  const byOffer = new Map<string, PricePoint[]>();
  for (const p of points) { if (!byOffer.has(p.offerId)) byOffer.set(p.offerId, []); byOffer.get(p.offerId)!.push(p); }
  const out: EngineAlert[] = [];
  for (const [offerId, hist] of byOffer) {
    hist.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const current = hist[hist.length - 1];
    const previous = hist.slice(0, -1);
    if (!previous.length) continue;
    const ref = previous.reduce((a, p) => a + p.unitPrice, 0) / previous.length;
    const pct = ((current.unitPrice - ref) / ref) * 100;
    if (pct >= thresholdPct) {
      const alts = (alternatives.get(current.productId) ?? []).filter((a) => a.offerId !== offerId && a.unitPrice < current.unitPrice)
        .sort((a, b) => a.unitPrice - b.unitPrice).slice(0, 2);
      const altText = alts.length
        ? ` Nous avons trouvé ${alts.length} alternative${alts.length > 1 ? 's' : ''} moins chère${alts.length > 1 ? 's' : ''} : ${alts.map((a) => `${a.supplierName} à ${fmtEur(a.unitPrice)}/${a.unit}`).join(', ')}.`
        : '';
      out.push({
        dedupeKey: `hausse:${offerId}:${current.unitPrice.toFixed(4)}`, kind: 'hausse_prix', severity: 'orange',
        title: `📈 Hausse détectée — ${current.productName}`,
        message: `Le prix de ${current.productName.toLowerCase()} chez ${current.supplierName} augmente de ${pct.toFixed(0)} % (${fmtEur(ref)} → ${fmtEur(current.unitPrice)}/${current.unit}).${altText}`,
        productId: current.productId, supplierId: current.supplierId, actionUrl: `/achats/comparer/${current.productId}`,
        payload: { pct: Math.round(pct * 10) / 10, from: ref, to: current.unitPrice, alternatives: alts },
      });
    }
  }
  return out;
}

/** 🟢 opportunité : le fournisseur habituel est plus cher qu'une alternative disponible. */
export function alertsFromOpportunities(
  items: { productId: string; productName: string; unit: string; preferredSupplierId: string | null }[],
  offers: { productId: string; supplierId: string; supplierName: string; unitPrice: number; inStock: boolean; leadTimeHours: number }[],
  minGainPct = 5,
): EngineAlert[] {
  const out: EngineAlert[] = [];
  for (const it of items) {
    if (!it.preferredSupplierId) continue;
    const mine = offers.find((o) => o.productId === it.productId && o.supplierId === it.preferredSupplierId);
    if (!mine) continue;
    const best = offers.filter((o) => o.productId === it.productId && o.inStock && o.supplierId !== it.preferredSupplierId && o.leadTimeHours <= 72)
      .sort((a, b) => a.unitPrice - b.unitPrice)[0];
    if (!best) continue;
    const pct = ((mine.unitPrice - best.unitPrice) / mine.unitPrice) * 100;
    if (pct >= minGainPct) {
      out.push({
        dedupeKey: `opportunite:${it.productId}:${best.supplierId}:${best.unitPrice.toFixed(4)}`, kind: 'opportunite', severity: 'green',
        title: `🟢 Moins cher disponible — ${it.productName}`,
        message: `Votre fournisseur habituel (${mine.supplierName}) propose ${it.productName.toLowerCase()} ${pct.toFixed(0)} % plus cher que ${best.supplierName} (${fmtEur(best.unitPrice)} vs ${fmtEur(mine.unitPrice)}/${it.unit}), livrable sous ${Math.round(best.leadTimeHours / 24)} j.`,
        productId: it.productId, supplierId: best.supplierId, actionUrl: `/achats/comparer/${it.productId}`,
        payload: { pct: Math.round(pct * 10) / 10 },
      });
    }
  }
  return out;
}

// -------------------------------------------------------------
// Comparateur (port de procurementComparator : score multi-critères + justification FR)
// -------------------------------------------------------------
export interface OfferForComparison {
  offerId: string; supplierId: string; supplierName: string; packLabel: string; packQty: number; packPrice: number;
  unitPrice: number; inStock: boolean; leadTimeHours: number; deliveryFee: number; minOrder: number; reliabilityPct: number;
}
export interface ComparisonResult {
  ranked: (OfferForComparison & { score: number; priceScore: number; delayScore: number; reliabilityScore: number; strengths: string[]; weaknesses: string[] })[];
  recommended?: ComparisonResult['ranked'][number];
  headline: string;
  justification: string[];
}

export function compareOffers(offers: OfferForComparison[], ctx: { daysOfStockLeft: number | null; neededQty: number; unit: string }): ComparisonResult {
  if (!offers.length) return { ranked: [], headline: 'Aucune offre disponible', justification: [] };
  const minPrice = Math.min(...offers.map((o) => o.unitPrice));
  const maxPrice = Math.max(...offers.map((o) => o.unitPrice));
  const urgencyHours = ctx.daysOfStockLeft !== null ? Math.max(0, ctx.daysOfStockLeft * 24) : Infinity;

  const ranked = offers.map((o) => {
    const priceScore = maxPrice === minPrice ? 100 : Math.round(100 - ((o.unitPrice - minPrice) / (maxPrice - minPrice)) * 100);
    const tooLate = o.leadTimeHours > urgencyHours;
    const delayScore = tooLate ? 0 : Math.max(0, Math.round(100 - (o.leadTimeHours / 168) * 100));
    const reliabilityScore = Math.round(o.reliabilityPct);
    const stockPenalty = o.inStock ? 1 : 0.2;
    const score = Math.round((priceScore * 0.5 + delayScore * 0.3 + reliabilityScore * 0.2) * stockPenalty);
    const strengths: string[] = []; const weaknesses: string[] = [];
    if (o.unitPrice === minPrice) strengths.push('Prix le plus bas du panel');
    if (o.leadTimeHours <= 24) strengths.push('Livraison sous 24 h');
    if (o.reliabilityPct >= 90) strengths.push(`Fiabilité ${o.reliabilityPct.toFixed(0)} %`);
    if (!o.inStock) weaknesses.push('Rupture chez le fournisseur');
    if (tooLate) weaknesses.push(`Délai de ${Math.round(o.leadTimeHours / 24)} j incompatible avec votre stock (${ctx.daysOfStockLeft} j restants)`);
    if (o.unitPrice === maxPrice && maxPrice !== minPrice) weaknesses.push('Prix le plus élevé du panel');
    if (o.reliabilityPct < 80) weaknesses.push('Fiabilité en dessous de 80 %');
    return { ...o, score, priceScore, delayScore, reliabilityScore, strengths, weaknesses };
  }).sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const cheapest = ranked.find((o) => o.unitPrice === minPrice)!;
  const justification: string[] = [];
  justification.push(`${best.supplierName} obtient le meilleur score global (${best.score}/100) en combinant prix (${fmtEur(best.unitPrice)}/${ctx.unit}), délai (${Math.round(best.leadTimeHours / 24)} j) et fiabilité (${best.reliabilityPct.toFixed(0)} %).`);
  if (cheapest.offerId !== best.offerId) {
    const why = cheapest.weaknesses[0] ?? 'un score global inférieur';
    justification.push(`${cheapest.supplierName} est moins cher (${fmtEur(cheapest.unitPrice)}/${ctx.unit}) mais présente ${why.charAt(0).toLowerCase() + why.slice(1)}.`);
  }
  const packs = Math.max(1, Math.ceil(ctx.neededQty / best.packQty));
  justification.push(`Pour couvrir ${fmtQty(ctx.neededQty, ctx.unit)} : ${packs} × ${best.packLabel} = ${fmtEur(packs * best.packPrice + best.deliveryFee)}${best.deliveryFee ? ` (dont ${fmtEur(best.deliveryFee)} de livraison)` : ''}.`);

  return { ranked, recommended: best, headline: `Meilleur choix : ${best.supplierName}`, justification };
}

// -------------------------------------------------------------
// Recettes : coût matière & marge
// -------------------------------------------------------------
export interface CostLine { productId: string; productName: string; quantity: number; unit: string; unitPrice: number; cost: number; priced: boolean }

export interface RecipeCostResult {
  lines: CostLine[];
  /** Coût des seuls ingrédients cotés — à afficher « ≥ X € » si status 'incomplet' (jamais « 0,00 € »). */
  total: number;
  /** Noms des ingrédients sans prix connu. */
  unpriced: string[];
  /** 'incomplet' dès qu'un ingrédient est sans prix : la marge réelle ne peut pas être calculée. */
  status: 'complet' | 'incomplet';
  /** Part des ingrédients dont le prix est connu (0..1). */
  coverage: number;
  /** Faux si plus de 30 % des ingrédients sont sans prix : le total n'est pas annonçable en chiffre (règle IA, chantier 2). */
  reliable: boolean;
}

export function recipeCost(
  ingredients: { productId: string; productName: string; quantity: number; unit: string }[],
  lastUnitPrices: Map<string, number>,
): RecipeCostResult {
  const lines = ingredients.map((i) => {
    const unitPrice = lastUnitPrices.get(i.productId) ?? 0;
    return { ...i, unitPrice, cost: Math.round(i.quantity * unitPrice * 1000) / 1000, priced: lastUnitPrices.has(i.productId) };
  });
  const total = Math.round(lines.reduce((a, l) => a + l.cost, 0) * 100) / 100;
  const unpriced = lines.filter((l) => !l.priced).map((l) => l.productName);
  const coverage = lines.length ? (lines.length - unpriced.length) / lines.length : 1;
  return {
    lines, total, unpriced,
    status: unpriced.length ? 'incomplet' : 'complet',
    coverage: Math.round(coverage * 100) / 100,
    reliable: coverage >= 0.7,
  };
}

export interface MarginAnalysisResult {
  grossMargin: number | null;
  marginPct: number | null;
  suggestedPrice: number | null;
  /** 'incomplet' quand le coût de référence est partiel : les champs marge restent null (masqués, jamais faux). */
  status: 'complet' | 'incomplet';
}

export function marginAnalysis(cost: number, sellingPrice: number | null, targetMarginPct = 70, costComplete = true): MarginAnalysisResult {
  // Chantier 2 (audit B3/U4) : un coût partiel donnerait une marge FAUSSE (trop haute) et un
  // « 0,00 € » présenté comme vrai. Coût incomplet ⇒ marge et prix conseillé masqués.
  if (!costComplete) return { grossMargin: null, marginPct: null, suggestedPrice: null, status: 'incomplet' };
  if (!sellingPrice) return { grossMargin: null, marginPct: null, suggestedPrice: Math.round((cost / (1 - targetMarginPct / 100)) * 10) / 10, status: 'complet' };
  const grossMargin = Math.round((sellingPrice - cost) * 100) / 100;
  const marginPct = Math.round((grossMargin / sellingPrice) * 1000) / 10;
  const suggestedPrice = marginPct < targetMarginPct ? Math.round((cost / (1 - targetMarginPct / 100)) * 10) / 10 : null;
  return { grossMargin, marginPct, suggestedPrice, status: 'complet' };
}

// -------------------------------------------------------------
// Chantier 2 (audit) — courbe de marge par plat & indice de prix par catégorie
// -------------------------------------------------------------
export interface MarginPoint {
  month: string;                       // 'YYYY-MM'
  /** Coût matière / portion pour ce mois (prix de l'historique, reportés en avant) — null si un ingrédient est introuvable. */
  costPerPortion: number | null;
  marginPct: number | null;
  grossMarginPerPortion: number | null;
  portionsSold: number;
  revenueEur: number;
}

export interface DishMarginSeries {
  recipeId: string; name: string; sellingPriceEur: number | null;
  /** État du coût AUJOURD'HUI : 'incomplet' si des ingrédients sont encore sans prix (courbe partielle). */
  status: 'complet' | 'incomplet';
  points: MarginPoint[];
  portionsSold: number;
  revenueEur: number;
}

/** Prix du produit pour un mois : moyenne du mois si cotée, sinon dernier prix connu avant (report). */
export function priceAtMonth(priceByMonth: Map<string, number>, month: string): number | null {
  const direct = priceByMonth.get(month);
  if (direct !== undefined) return direct;
  let best: string | null = null;
  for (const m of priceByMonth.keys()) if (m < month && (best === null || m > best)) best = m;
  return best === null ? null : priceByMonth.get(best)!;
}

/**
 * Série de marge d'un plat sur une fenêtre de mois ('YYYY-MM' croissants).
 * Un mois sans prix connu pour TOUS les ingrédients reste à null (trou dans la courbe) —
 * jamais une extrapolation silencieuse.
 */
export function marginSeries(input: {
  recipeId: string; name: string;
  ingredients: { productId: string; productName: string; quantity: number; unit: string }[];
  sellingPriceEur: number | null;
  months: string[];
  portionsByMonth: Map<string, number>;
  priceByMonth: Map<string, Map<string, number>>; // productId → 'YYYY-MM' → prix moyen du mois
  currentUnpriced: string[];
}): DishMarginSeries {
  const sell = input.sellingPriceEur;
  let portionsSold = 0; let revenueEur = 0;
  const points: MarginPoint[] = input.months.map((month) => {
    const portions = input.portionsByMonth.get(month) ?? 0;
    portionsSold += portions;
    const revenue = sell ? Math.round(sell * portions * 100) / 100 : 0;
    revenueEur = Math.round((revenueEur + revenue) * 100) / 100;
    let cost: number | null = 0;
    for (const ing of input.ingredients) {
      const p = priceAtMonth(input.priceByMonth.get(ing.productId) ?? new Map(), month);
      if (p === null) { cost = null; break; }
      cost += ing.quantity * p;
    }
    const costPerPortion = cost === null ? null : Math.round(cost * 100) / 100;
    const grossMarginPerPortion = costPerPortion !== null && sell ? Math.round((sell - costPerPortion) * 100) / 100 : null;
    const marginPct = grossMarginPerPortion !== null && sell ? Math.round((grossMarginPerPortion / sell) * 1000) / 10 : null;
    return { month, costPerPortion, marginPct, grossMarginPerPortion, portionsSold: portions, revenueEur: revenue };
  });
  return {
    recipeId: input.recipeId, name: input.name, sellingPriceEur: sell,
    status: input.currentUnpriced.length ? 'incomplet' : 'complet',
    points, portionsSold, revenueEur,
  };
}

export interface CategoryPriceIndex {
  category: string;
  baseMonth: string | null;
  points: { month: string; index: number | null }[];
}

/**
 * Indice de prix par catégorie (type « indice des prix », base = 100 au premier mois avec données).
 * Pour chaque produit : prix du mois (report en avant) ; l'indice est la moyenne des produits
 * ayant un prix à la base ET au mois visé. Aucun produit éligible ⇒ index null (trou honnête).
 */
export function priceIndexByCategory(input: {
  months: string[];
  products: { productId: string; category: string; priceByMonth: Map<string, number> }[];
}): CategoryPriceIndex[] {
  const byCat = new Map<string, { productId: string; priceByMonth: Map<string, number> }[]>();
  for (const p of input.products) {
    if (!byCat.has(p.category)) byCat.set(p.category, []);
    byCat.get(p.category)!.push(p);
  }
  const out: CategoryPriceIndex[] = [];
  for (const [category, prods] of [...byCat.entries()].sort()) {
    const baseMonth = input.months.find((m) => prods.some((p) => priceAtMonth(p.priceByMonth, m) !== null)) ?? null;
    const points = input.months.map((month) => {
      if (!baseMonth) return { month, index: null };
      const ratios: number[] = [];
      for (const p of prods) {
        const base = priceAtMonth(p.priceByMonth, baseMonth);
        const cur = priceAtMonth(p.priceByMonth, month);
        if (base !== null && base > 0 && cur !== null) ratios.push(cur / base);
      }
      const index = ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 1000) / 10 : null;
      return { month, index };
    });
    out.push({ category, baseMonth, points });
  }
  return out;
}

/** Fiabilité fournisseur : 100 − pénalités (retards, écarts). */
export function supplierReliability(stats: { delivered: number; late: number; discrepancies: number }) {
  if (!stats.delivered) return 85; // valeur neutre sans historique
  const pct = 100 - (stats.late / stats.delivered) * 60 - (stats.discrepancies / stats.delivered) * 40;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
