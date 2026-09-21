// =============================================================
// AFRISUPPLY — Prévision des besoins (V1 déterministe, explicable)
//
// Besoin(j) = Σ recettes [ ventes prévues(plat, j) × grammage ]
// ventes prévues(plat, j) = moyenne pondérée des ventes du même jour
//   de semaine (4 dernières occurrences, poids récents 40/30/20/10)
//   × coefficient de tendance (4 sem. vs 4 sem. précédentes, borné)
//   × coefficient d'événement (optionnel)
// Chaque prévision expose son "pourquoi".
// =============================================================

export interface SaleRow { recipeId: string; day: string; portions: number }
export interface IngredientRow { recipeId: string; productId: string; quantity: number }
export interface StockRow { productId: string; productName: string; unit: string; quantity: number; criticalLevel: number; targetLevel: number | null; shelfLifeDays?: number | null }

export interface RecipeForecast { recipeId: string; perDay: number[]; total: number; confidence: number; daysWithData: number }
export interface ProductForecast {
  productId: string; productName: string; unit: string;
  horizonDays: number; predictedNeed: number; currentStock: number; safetyStock: number;
  recommendedOrder: number; daysOfStockLeft: number | null; stockoutDay: string | null;
  confidence: number; explanation: string; avgDailyNeed: number; perDay: number[];
}

const DAY_MS = 86_400_000;
const DOW_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export interface ForecastOptions {
  horizonDays?: number;        // défaut 7
  safetyDays?: number;         // stock de sécurité en jours de besoin (défaut 2)
  eventMultipliers?: Record<string, number>; // 'YYYY-MM-DD' → coef (ex. 1.5 pour une soirée privatisée)
  today?: Date;
}

/** Prévision de ventes par plat, jour par jour. */
export function forecastRecipes(sales: SaleRow[], recipeIds: string[], opts: ForecastOptions = {}): Map<string, RecipeForecast> {
  const horizon = opts.horizonDays ?? 7; const today = opts.today ?? new Date();
  const out = new Map<string, RecipeForecast>();
  const byRecipe = new Map<string, Map<string, number>>();
  for (const s of sales) { if (!byRecipe.has(s.recipeId)) byRecipe.set(s.recipeId, new Map()); byRecipe.get(s.recipeId)!.set(s.day, s.portions); }
  const WEIGHTS = [0.4, 0.3, 0.2, 0.1];

  for (const rid of recipeIds) {
    const hist = byRecipe.get(rid) ?? new Map<string, number>();
    const daysWithData = hist.size;
    // tendance : 4 dernières semaines vs 4 précédentes
    let recent = 0, previous = 0;
    for (const [day, p] of hist) {
      const age = (today.getTime() - new Date(day).getTime()) / DAY_MS;
      if (age > 0 && age <= 28) recent += p; else if (age > 28 && age <= 56) previous += p;
    }
    const trend = previous > 0 && recent > 0 ? Math.min(1.3, Math.max(0.7, recent / previous)) : 1;
    const perDay: number[] = [];
    for (let d = 1; d <= horizon; d++) {
      const target = new Date(today.getTime() + d * DAY_MS);
      // mêmes jours de semaine passés
      let num = 0, den = 0;
      for (let k = 1; k <= 4; k++) {
        const past = isoDay(new Date(target.getTime() - k * 7 * DAY_MS));
        const v = hist.get(past);
        if (v !== undefined) { num += v * WEIGHTS[k - 1]; den += WEIGHTS[k - 1]; }
      }
      let base: number;
      // si le jour de semaine n'a jamais de vente alors que les jours voisins en ont (≥ 3 occurrences couvertes) → jour de fermeture
      const closedDow = den === 0 && [1, 2, 3].every((k) => {
        const before = hist.has(isoDay(new Date(target.getTime() - (k * 7 + 1) * DAY_MS)));
        const after = hist.has(isoDay(new Date(target.getTime() - (k * 7 - 1) * DAY_MS)));
        return before || after;
      });
      if (den > 0) base = num / den;
      else if (closedDow) base = 0;
      else if (daysWithData) base = [...hist.values()].reduce((a, b) => a + b, 0) / Math.max(daysWithData, 1) * 0.8; // fallback moyenne dégradée
      else base = 0;
      const ev = opts.eventMultipliers?.[isoDay(target)] ?? 1;
      perDay.push(Math.round(base * trend * ev * 100) / 100);
    }
    const total = perDay.reduce((a, b) => a + b, 0);
    const confidence = daysWithData >= 28 ? 0.85 : daysWithData >= 14 ? 0.7 : daysWithData >= 7 ? 0.55 : daysWithData > 0 ? 0.4 : 0.2;
    out.set(rid, { recipeId: rid, perDay, total: Math.round(total * 10) / 10, confidence, daysWithData });
  }
  return out;
}

/** Prévision de besoins par produit + commande recommandée. */
export function forecastProducts(
  recipeForecasts: Map<string, RecipeForecast>, ingredients: IngredientRow[], stocks: StockRow[], opts: ForecastOptions = {},
): ProductForecast[] {
  const horizon = opts.horizonDays ?? 7; const safetyDays = opts.safetyDays ?? 2; const today = opts.today ?? new Date();
  const perProduct = new Map<string, { perDay: number[]; conf: number[]; recipes: number; daysWithData: number }>();
  for (const ing of ingredients) {
    const rf = recipeForecasts.get(ing.recipeId); if (!rf) continue;
    const acc = perProduct.get(ing.productId) ?? { perDay: new Array<number>(horizon).fill(0), conf: [] as number[], recipes: 0, daysWithData: 0 };
    rf.perDay.forEach((p, i) => { acc.perDay[i] += p * ing.quantity; });
    acc.conf.push(rf.confidence); acc.recipes++; acc.daysWithData = Math.max(acc.daysWithData, rf.daysWithData);
    perProduct.set(ing.productId, acc);
  }
  const out: ProductForecast[] = [];
  for (const s of stocks) {
    const acc = perProduct.get(s.productId);
    const perDay: number[] = acc ? acc.perDay.map((v) => Math.round(v * 1000) / 1000) : new Array<number>(horizon).fill(0);
    const need = perDay.reduce((a, b) => a + b, 0);
    const avg = need / horizon;
    const confidence = acc && acc.conf.length ? Math.round((acc.conf.reduce((a, b) => a + b, 0) / acc.conf.length) * 100) / 100 : 0.2;
    // jour de rupture : premier jour où le cumul dépasse le stock
    let cum = 0; let stockoutIdx: number | null = null;
    for (let i = 0; i < perDay.length; i++) { cum += perDay[i]; if (cum > s.quantity) { stockoutIdx = i; break; } }
    const daysLeft = avg > 0 ? Math.round((s.quantity / avg) * 10) / 10 : null;
    const safety = Math.max(s.criticalLevel, avg * safetyDays);
    const needWithSafety = need + safety;
    // Chantier 1 (audit) — démarrage à froid : sans AUCUN historique de vente, se couvrir sur l'horizon
    // donne toujours 0 et le panier intelligent reste muet. On complète alors au moins jusqu'à
    // l'objectif (politique (s, S)) ; sans objectif, le retour au seuil critique (comportement d'origine).
    const daysWithData = acc?.daysWithData ?? 0;
    let upTo = needWithSafety;
    if (daysWithData === 0) upTo = Math.max(needWithSafety, s.targetLevel ?? 0);
    let recommended = Math.max(0, upTo - s.quantity);
    // Plafond anti-surstock : jamais en dessous du besoin couvert (une cible mal réglée ne doit
    // pas faire sous-commander une période de forte activité).
    const cap = Math.max(needWithSafety, s.targetLevel ? s.targetLevel * 1.5 : 0);
    if (s.quantity + recommended > cap) recommended = Math.max(0, cap - s.quantity);
    // ne pas dépasser une DLC courte
    if (s.shelfLifeDays && s.shelfLifeDays < horizon && avg > 0) recommended = Math.min(recommended, Math.max(0, avg * s.shelfLifeDays + safety - s.quantity));
    recommended = Math.round(recommended * 10) / 10;

    const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} ${s.unit}`;
    let explanation: string;
    if (daysWithData === 0) {
      // Démarrage à froid : on n'invente ni « pic » ni prévision — on dit ce qu'on sait.
      const seuils = (s.criticalLevel > 0 || (s.targetLevel ?? 0) > 0)
        ? `je m'appuie sur vos seuils (critique ${fmt(s.criticalLevel)}${s.targetLevel ? `, objectif ${fmt(s.targetLevel)}` : ''})`
        : `définissez un seuil critique (ou faites un inventaire) pour que je puisse chiffrer une commande`;
      explanation = (!acc
        ? `${s.productName} n'entre dans aucune recette. `
        : `Pas encore assez de ventes pour prévoir ${s.productName.toLowerCase()} sur ${horizon} jours. `) +
        `${seuils.charAt(0).toUpperCase()}${seuils.slice(1)}.` +
        (recommended > 0 ? ` Commande recommandée : ${fmt(recommended)}${s.targetLevel ? ' (ramène le stock à votre objectif)' : ''}.` : '');
    } else {
      const peakVal = Math.max(...perDay);
      const peak = perDay.indexOf(peakVal); const peakDay = DOW_FR[new Date(today.getTime() + (peak + 1) * DAY_MS).getDay()];
      explanation = `Besoin estimé de ${fmt(Math.round(need * 10) / 10)} sur ${horizon} jours, calculé à partir de ${acc!.recipes} recette${acc!.recipes > 1 ? 's' : ''} et de vos ventes des 4 dernières semaines${peakVal > 0 ? ` (pic ${peakDay})` : ''}` +
        (daysWithData < 7 ? ` — estimé sur ${daysWithData} jour${daysWithData > 1 ? 's' : ''} seulement` : '') + `. ` +
        `Stock actuel ${fmt(s.quantity)}` + (stockoutIdx !== null && need > 0 ? ` → rupture prévue ${DOW_FR[new Date(today.getTime() + (stockoutIdx + 1) * DAY_MS).getDay()]}.` : ', suffisant sur la période.') +
        (recommended > 0 ? ` Commande recommandée : ${fmt(recommended)} (inclut ${safetyDays} j de sécurité).` : '');
    }
    out.push({
      productId: s.productId, productName: s.productName, unit: s.unit, horizonDays: horizon,
      predictedNeed: Math.round(need * 10) / 10, currentStock: s.quantity, safetyStock: Math.round(safety * 10) / 10, recommendedOrder: recommended,
      daysOfStockLeft: daysLeft, stockoutDay: stockoutIdx === null ? null : isoDay(new Date(today.getTime() + (stockoutIdx + 1) * DAY_MS)),
      confidence, explanation, avgDailyNeed: Math.round(avg * 1000) / 1000, perDay,
    });
  }
  return out.sort((a, b) => (a.stockoutDay ?? '9').localeCompare(b.stockoutDay ?? '9') || b.recommendedOrder - a.recommendedOrder);
}

// =============================================================
// Panier intelligent : répartition des besoins entre fournisseurs
// =============================================================
export interface CartOffer { offerId: string; supplierId: string; supplierName: string; productId: string; packLabel: string; packQty: number; packPrice: number; unitPrice: number; inStock: boolean; leadTimeHours: number; deliveryFee: number; minOrder: number; reliabilityPct: number }
export interface CartLine { productId: string; productName: string; unit: string; neededQty: number; offer: CartOffer; packs: number; quantity: number; lineTotal: number; alternativeSaving: number; reason: string }
export interface CartSupplier { supplierId: string; supplierName: string; lines: CartLine[]; subtotal: number; deliveryFee: number; minOrder: number; belowMinimum: boolean; total: number; leadTimeHours: number }
export interface SmartCart { suppliers: CartSupplier[]; total: number; baselineTotal: number; saving: number; unavailable: { productId: string; productName: string; neededQty: number; unit: string }[]; notes: string[] }

/**
 * Stratégie : pour chaque produit, choisir l'offre au meilleur coût effectif
 * (prix + délai compatible + fiabilité), puis consolider par fournisseur ;
 * si un fournisseur reste sous son minimum, réaffecter ses lignes au 2e choix
 * quand le surcoût est inférieur au frais de livraison évité.
 */
export function buildSmartCart(
  needs: { productId: string; productName: string; unit: string; neededQty: number; daysOfStockLeft: number | null; preferredSupplierId?: string | null }[],
  offers: CartOffer[],
): SmartCart {
  const notes: string[] = []; const unavailable: SmartCart['unavailable'] = [];
  type Choice = { line: CartLine; alternatives: CartOffer[] };
  const choices: Choice[] = [];
  let baseline = 0;

  for (const n of needs) {
    if (n.neededQty <= 0) continue;
    const cands = offers.filter((o) => o.productId === n.productId && o.inStock);
    if (!cands.length) { unavailable.push({ productId: n.productId, productName: n.productName, unit: n.unit, neededQty: n.neededQty }); continue; }
    const urgencyH = n.daysOfStockLeft !== null ? Math.max(24, n.daysOfStockLeft * 24) : Infinity;
    const score = (o: CartOffer) => {
      const packs = Math.max(1, Math.ceil(n.neededQty / o.packQty));
      const cost = packs * o.packPrice;
      const latePenalty = o.leadTimeHours > urgencyH ? 1e6 : 0;
      const reliabilityPenalty = (100 - o.reliabilityPct) / 100 * cost * 0.15; // 15 % du coût pondéré par le manque de fiabilité
      return cost + latePenalty + reliabilityPenalty;
    };
    const ranked = [...cands].sort((a, b) => score(a) - score(b));
    const best = ranked[0];
    const packs = Math.max(1, Math.ceil(n.neededQty / best.packQty));
    const usual = n.preferredSupplierId ? cands.find((o) => o.supplierId === n.preferredSupplierId) : undefined;
    const usualCost = usual ? Math.max(1, Math.ceil(n.neededQty / usual.packQty)) * usual.packPrice : packs * best.packPrice;
    baseline += usualCost;
    const lineTotal = packs * best.packPrice;
    const reason = best.leadTimeHours > 48 && urgencyH !== Infinity ? `Délai ${Math.round(best.leadTimeHours / 24)} j accepté (stock ${n.daysOfStockLeft} j)`
      : usual && usual.offerId !== best.offerId ? `${best.supplierName} moins cher que ${usual.supplierName} (${(usualCost - lineTotal).toFixed(2)} € économisés)`
      : best.unitPrice === Math.min(...cands.map((c) => c.unitPrice)) ? 'Meilleur prix disponible' : 'Meilleur compromis prix / délai / fiabilité';
    choices.push({ line: { productId: n.productId, productName: n.productName, unit: n.unit, neededQty: n.neededQty, offer: best, packs, quantity: packs * best.packQty, lineTotal, alternativeSaving: Math.max(0, usualCost - lineTotal), reason }, alternatives: ranked.slice(1) });
  }

  // consolidation + gestion des minimums de commande
  const group = () => {
    const m = new Map<string, CartSupplier>();
    for (const { line } of choices) {
      const o = line.offer;
      const g = m.get(o.supplierId) ?? { supplierId: o.supplierId, supplierName: o.supplierName, lines: [], subtotal: 0, deliveryFee: o.deliveryFee, minOrder: o.minOrder, belowMinimum: false, total: 0, leadTimeHours: o.leadTimeHours };
      g.lines.push(line); g.subtotal += line.lineTotal; m.set(o.supplierId, g);
    }
    for (const g of m.values()) { g.belowMinimum = g.subtotal < g.minOrder; g.total = g.subtotal + g.deliveryFee; g.subtotal = Math.round(g.subtotal * 100) / 100; g.total = Math.round(g.total * 100) / 100; }
    return m;
  };
  let groups = group();
  for (let pass = 0; pass < 3; pass++) {
    const weak = [...groups.values()].filter((g) => g.belowMinimum);
    if (!weak.length) break;
    for (const g of weak) {
      // tenter de déplacer chaque ligne vers un autre fournisseur déjà présent dans le panier
      for (const ch of choices.filter((c) => c.line.offer.supplierId === g.supplierId)) {
        const alt = ch.alternatives.find((a) => groups.has(a.supplierId) && a.supplierId !== g.supplierId);
        if (!alt) continue;
        const packs = Math.max(1, Math.ceil(ch.line.neededQty / alt.packQty));
        const extra = packs * alt.packPrice - ch.line.lineTotal;
        if (extra <= g.deliveryFee + 5) {
          notes.push(`${ch.line.productName} déplacé vers ${alt.supplierName} (+${extra.toFixed(2)} €) pour éviter une commande sous minimum chez ${g.supplierName}.`);
          ch.line = { ...ch.line, offer: alt, packs, quantity: packs * alt.packQty, lineTotal: packs * alt.packPrice, reason: `Regroupé chez ${alt.supplierName}` };
        }
      }
    }
    groups = group();
  }
  for (const g of groups.values()) if (g.belowMinimum) notes.push(`${g.supplierName} : panier ${g.subtotal.toFixed(2)} € sous le minimum de ${g.minOrder} € — complétez ou différez.`);

  const suppliers = [...groups.values()].sort((a, b) => b.total - a.total);
  const total = Math.round(suppliers.reduce((a, g) => a + g.total, 0) * 100) / 100;
  return { suppliers, total, baselineTotal: Math.round(baseline * 100) / 100, saving: Math.round(Math.max(0, baseline - suppliers.reduce((a, g) => a + g.subtotal, 0)) * 100) / 100, unavailable, notes };
}
