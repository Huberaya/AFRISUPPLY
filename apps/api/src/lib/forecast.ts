// =============================================================
// AFRISUPPLY — Prévision des besoins (cascade explicable, V2)
//
// Un restaurateur ne saisit pas ses ventes tous les jours : la prévision ne doit
// JAMAIS être vide pour autant. Elle descend donc une cascade de sources, et dit
// toujours laquelle elle a utilisée :
//
//   1. « ventes 28 j »  — moyenne pondérée des mêmes jours de semaine (4 semaines)
//   2. « ventes 7 j »   — moyenne des 7 derniers jours saisis × profil hebdo du restaurant
//   3. « couverts »     — couverts/jour × part du plat dans les ventes récentes
//   4. « seuils »       — aucune donnée : le besoin produit retombe sur les seuils critiques
//
// Sont également appliqués : jours de fermeture (semaine type), saisonnalité
// (mois de pleine activité du restaurant, ou `products.seasonality` produit),
// coefficients d'événement, et une tendance bornée (4 semaines vs 4 précédentes).
// =============================================================

export interface SaleRow { recipeId: string; day: string; portions: number }
export interface IngredientRow { recipeId: string; productId: string; quantity: number }
export interface StockRow {
  productId: string; productName: string; unit: string; quantity: number; criticalLevel: number; targetLevel: number | null;
  shelfLifeDays?: number | null;
  /** `products.seasonality` : « {"months":[7,8],"coef":1.3} », « [7,8] » ou texte libre (ignoré). */
  seasonality?: string | null;
}

/** Source de la prévision — affichée telle quelle à l'écran : aucune estimation muette. */
export type ForecastBasis = 'ventes_28j' | 'ventes_7j' | 'couverts' | 'seuils';
export const BASIS_LABEL: Record<ForecastBasis, string> = {
  ventes_28j: 'vos ventes des 4 dernières semaines',
  ventes_7j: 'vos ventes de la semaine écoulée',
  couverts: 'votre nombre de couverts',
  seuils: 'vos seuils critiques',
};
const BASIS_CONFIDENCE: Record<ForecastBasis, number> = { ventes_28j: 0.85, ventes_7j: 0.45, couverts: 0.3, seuils: 0.15 };
const BASIS_ORDER: ForecastBasis[] = ['ventes_28j', 'ventes_7j', 'couverts', 'seuils'];
/** La source la plus fragile de deux sources (afficher la vérité, pas la plus flatteuse). */
export const weakestBasis = (a: ForecastBasis, b: ForecastBasis): ForecastBasis =>
  BASIS_ORDER.indexOf(a) >= BASIS_ORDER.indexOf(b) ? a : b;

export interface RecipeForecast {
  recipeId: string; perDay: number[]; total: number; confidence: number;
  basis: ForecastBasis; closedPerDay: boolean[];
  /** Jours réellement couverts par des données observées : 0 = démarrage à froid (aucune vente). */
  daysWithData: number;
}
export interface ProductForecast {
  productId: string; productName: string; unit: string;
  horizonDays: number; predictedNeed: number; currentStock: number; safetyStock: number;
  recommendedOrder: number; daysOfStockLeft: number | null; stockoutDay: string | null;
  confidence: number; explanation: string; avgDailyNeed: number; perDay: number[];
  /** Source réellement utilisée (la plus fragile des recettes qui composent ce produit). */
  basis: ForecastBasis;
  /** Coefficient de saisonnalité produit appliqué (1 = aucun). */
  seasonCoef: number;
}

const DAY_MS = 86_400_000;
const DOW_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const dayToTime = (day: string) => new Date(`${day}T00:00:00Z`).getTime();

export interface ForecastOptions {
  horizonDays?: number;        // défaut 7
  safetyDays?: number;         // stock de sécurité en jours de besoin (défaut 2)
  eventMultipliers?: Record<string, number>; // 'YYYY-MM-DD' → coef (soirée privatisée…)
  today?: Date;
  coversPerDay?: number | null;    // couverts moyens/jour (repli « couverts »)
  closedWeekdays?: number[];       // 0 = dimanche — jours de fermeture : besoin nul
  peakMonths?: number[];           // mois de pleine activité (1 = janvier)
  peakCoef?: number;               // coefficient appliqué ces mois-là (défaut 1,2)
}

/** Lit `products.seasonality` et en tire des mois + un coefficient (tolérant aux formats). */
export function parseSeasonality(text: string | null | undefined): { months: number[]; coef: number } | null {
  if (!text) return null;
  const t = text.trim();
  try {
    const v = JSON.parse(t);
    if (Array.isArray(v)) {
      const months = v.map((x) => Number(x)).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
      return months.length ? { months, coef: 1.3 } : null;
    }
    if (v && typeof v === 'object') {
      const months = Array.isArray(v.months) ? v.months.map((x: unknown) => Number(x)).filter((m: number) => Number.isInteger(m) && m >= 1 && m <= 12) : [];
      const coef = Number(v.coef);
      if (months.length) return { months, coef: Number.isFinite(coef) && coef > 1 && coef <= 3 ? coef : 1.3 };
    }
  } catch { /* texte libre : on n'invente rien */ }
  return null;
}

/** Prévision de ventes par plat, jour par jour — avec la source utilisée. */
export function forecastRecipes(sales: SaleRow[], recipeIds: string[], opts: ForecastOptions = {}): Map<string, RecipeForecast> {
  const horizon = opts.horizonDays ?? 7; const today = opts.today ?? new Date();
  const closed = new Set(opts.closedWeekdays ?? []);
  const peakMonths = opts.peakMonths ?? []; const peakCoef = opts.peakCoef ?? 1.2;
  const covers = opts.coversPerDay ?? 0;
  const out = new Map<string, RecipeForecast>();
  const byRecipe = new Map<string, Map<string, number>>();
  for (const s of sales) { if (!byRecipe.has(s.recipeId)) byRecipe.set(s.recipeId, new Map()); byRecipe.get(s.recipeId)!.set(s.day, s.portions); }
  const WEIGHTS = [0.4, 0.3, 0.2, 0.1];

  // Profil hebdomadaire du restaurant (tous plats confondus) : sert de repli quand un plat
  // n'a pas encore d'historique pour ce jour de semaine précis.
  const dowSum = new Array<number>(7).fill(0); const dowCount = new Array<number>(7).fill(0);
  for (const s of sales) { const dow = new Date(dayToTime(s.day)).getUTCDay(); dowSum[dow] += s.portions; dowCount[dow] += 1; }
  const grandMean = dowSum.reduce((a, b) => a + b, 0) / Math.max(1, dowCount.reduce((a, b) => a + b, 0));
  const dowFactor = (dow: number) => (dowCount[dow] >= 2 && grandMean > 0 ? (dowSum[dow] / dowCount[dow]) / grandMean : 1);

  // Part de chaque plat dans les ventes des 28 derniers jours (repli « couverts »).
  const totals28 = new Map<string, number>(); let grand28 = 0;
  for (const s of sales) {
    const age = (today.getTime() - dayToTime(s.day)) / DAY_MS;
    if (age >= 0 && age <= 28) { totals28.set(s.recipeId, (totals28.get(s.recipeId) ?? 0) + s.portions); grand28 += s.portions; }
  }
  const shareOf = (rid: string) => (grand28 > 0 ? (totals28.get(rid) ?? 0) / grand28 : 1 / Math.max(1, recipeIds.length));

  for (const rid of recipeIds) {
    const hist = byRecipe.get(rid) ?? new Map<string, number>();
    const daysWithData = hist.size;
    let days28 = 0; let days7 = 0; let sum7 = 0; let recent = 0; let previous = 0;
    for (const [day, p] of hist) {
      const age = (today.getTime() - dayToTime(day)) / DAY_MS;
      if (age > 0 && age <= 28) { days28++; recent += p; } else if (age > 28 && age <= 56) previous += p;
      if (age > 0 && age <= 7) { days7++; sum7 += p; }
    }
    const trend = previous > 0 && recent > 0 ? Math.min(1.3, Math.max(0.7, recent / previous)) : 1;
    // La source décidée une fois pour le plat, du plus fiable au plus dégradé.
    const basis: ForecastBasis = days28 >= 4 ? 'ventes_28j' : days7 >= 1 ? 'ventes_7j' : covers > 0 ? 'couverts' : 'seuils';
    const mean7 = days7 > 0 ? sum7 / days7 : 0;
    const recipeMean = daysWithData ? [...hist.values()].reduce((a, b) => a + b, 0) / daysWithData : 0;
    const perDay: number[] = []; const closedPerDay: boolean[] = [];

    for (let d = 1; d <= horizon; d++) {
      const target = new Date(today.getTime() + d * DAY_MS);
      const dow = target.getUTCDay();
      if (closed.has(dow)) { perDay.push(0); closedPerDay.push(true); continue; }   // jour de fermeture : aucun besoin
      const seasonal = peakMonths.includes(target.getUTCMonth() + 1) ? peakCoef : 1;
      let base = 0;
      if (basis === 'ventes_28j' || basis === 'ventes_7j') {
        let num = 0, den = 0;
        for (let k = 1; k <= 4; k++) {
          const past = isoDay(new Date(target.getTime() - k * 7 * DAY_MS));
          const v = hist.get(past);
          if (v !== undefined) { num += v * WEIGHTS[k - 1]; den += WEIGHTS[k - 1]; }
        }
        if (den > 0) base = num / den;
        else {
          // Aucune vente ce jour de semaine : soit le plat ne se vend jamais ce jour-là (fermeture),
          // soit l'historique est trop court → profil hebdomadaire du restaurant.
          const closedDow = [1, 2, 3].every((k) => {
            const before = hist.has(isoDay(new Date(target.getTime() - (k * 7 + 1) * DAY_MS)));
            const after = hist.has(isoDay(new Date(target.getTime() - (k * 7 - 1) * DAY_MS)));
            return before || after;
          });
          base = closedDow ? 0 : (basis === 'ventes_7j' ? mean7 : recipeMean) * dowFactor(dow);
        }
      } else if (basis === 'couverts') {
        base = covers * shareOf(rid) * dowFactor(dow);
      }
      const ev = opts.eventMultipliers?.[isoDay(target)] ?? 1;
      perDay.push(Math.round(base * trend * ev * seasonal * 100) / 100);
      closedPerDay.push(false);
    }
    const total = perDay.reduce((a, b) => a + b, 0);
    // Confiance : la plus PRUDENTE des deux lectures — la source utilisée (cascade du chantier 9)
    // et le nombre de jours réellement observés (démarrage à froid). Jamais la plus flatteuse.
    const parSource = basis === 'ventes_28j'
      ? (daysWithData >= 28 ? 0.85 : daysWithData >= 14 ? 0.7 : 0.55)
      : BASIS_CONFIDENCE[basis];
    // On ne pénalise pas une estimation qui ne repose PAS sur des ventes : « couverts » et « seuils »
    // ont déjà leur propre niveau, volontairement bas (0,3 et 0,15). En revanche, dès qu'il s'agit de
    // ventes, la confiance ne peut pas dépasser ce que les jours réellement observés justifient.
    const ventes = basis === 'ventes_28j' || basis === 'ventes_7j';
    const parHistorique = ventes
      ? (daysWithData >= 28 ? 0.85 : daysWithData >= 14 ? 0.7 : daysWithData >= 7 ? 0.55 : daysWithData > 0 ? 0.4 : 0.2)
      : parSource;
    const confidence = Math.min(parSource, parHistorique);
    out.set(rid, { recipeId: rid, perDay, total: Math.round(total * 10) / 10, confidence, basis, closedPerDay, daysWithData });
  }
  return out;
}

/** Prévision de besoins par produit + commande recommandée (avec la source de chaque chiffre). */
export function forecastProducts(
  recipeForecasts: Map<string, RecipeForecast>, ingredients: IngredientRow[], stocks: StockRow[], opts: ForecastOptions = {},
): ProductForecast[] {
  const horizon = opts.horizonDays ?? 7; const safetyDays = opts.safetyDays ?? 2; const today = opts.today ?? new Date();
  const closed = new Set(opts.closedWeekdays ?? []);
  const perProduct = new Map<string, { perDay: number[]; conf: number[]; recipes: number; basis: ForecastBasis; usedCovers: boolean; daysWithData: number }>();
  for (const ing of ingredients) {
    const rf = recipeForecasts.get(ing.recipeId); if (!rf) continue;
    const acc = perProduct.get(ing.productId) ?? { perDay: new Array<number>(horizon).fill(0), conf: [] as number[], recipes: 0, basis: 'ventes_28j' as ForecastBasis, usedCovers: false, daysWithData: 0 };
    rf.perDay.forEach((p, i) => { acc.perDay[i] += p * ing.quantity; });
    acc.conf.push(rf.confidence); acc.recipes++;
    acc.basis = acc.recipes === 1 ? rf.basis : weakestBasis(acc.basis, rf.basis);
    if (rf.basis === 'couverts') acc.usedCovers = true;
    acc.daysWithData = Math.max(acc.daysWithData, rf.daysWithData);
    perProduct.set(ing.productId, acc);
  }
  const out: ProductForecast[] = [];
  for (const s of stocks) {
    const acc = perProduct.get(s.productId);
    const perDay: number[] = acc ? acc.perDay.map((v) => Math.round(v * 1000) / 1000) : new Array<number>(horizon).fill(0);
    // Saisonnalité du produit (ex. pic de la mangue en été) : appliquée jour par jour.
    const season = parseSeasonality(s.seasonality);
    if (season) perDay.forEach((v, i) => {
      const month = new Date(today.getTime() + (i + 1) * DAY_MS).getUTCMonth() + 1;
      if (season.months.includes(month)) perDay[i] = Math.round(v * season.coef * 1000) / 1000;
    });
    for (let i = 0; i < perDay.length; i++) if (closed.has(new Date(today.getTime() + (i + 1) * DAY_MS).getUTCDay())) perDay[i] = 0;
    const need = perDay.reduce((a, b) => a + b, 0);
    const avg = need / horizon;
    const basis: ForecastBasis = acc ? acc.basis : 'seuils';
    const confidence = acc && acc.conf.length ? Math.round((acc.conf.reduce((a, b) => a + b, 0) / acc.conf.length) * 100) / 100 : BASIS_CONFIDENCE.seuils;
    let cum = 0; let stockoutIdx: number | null = null;
    for (let i = 0; i < perDay.length; i++) { cum += perDay[i]; if (cum > s.quantity) { stockoutIdx = i; break; } }
    const daysLeft = avg > 0 ? Math.round((s.quantity / avg) * 10) / 10 : null;
    const safety = Math.max(s.criticalLevel, avg * safetyDays);
    const needWithSafety = need + safety;
    // Démarrage à froid (chantier 1) : sans AUCUN historique de vente, se couvrir sur l'horizon donne
    // toujours 0 et le panier intelligent reste muet. On complète alors au moins jusqu'à l'objectif
    // (politique (s, S)) ; sans objectif, on retombe sur le seuil critique.
    const daysWithData = acc?.daysWithData ?? 0;
    let upTo = needWithSafety;
    if (daysWithData === 0) upTo = Math.max(needWithSafety, s.targetLevel ?? 0);
    let recommended = Math.max(0, upTo - s.quantity);
    // Plafond anti-surstock : jamais en dessous du besoin couvert (une cible mal réglée ne doit pas
    // faire sous-commander une période de forte activité).
    const cap = Math.max(needWithSafety, s.targetLevel ? s.targetLevel * 1.5 : 0);
    if (s.quantity + recommended > cap) recommended = Math.max(0, cap - s.quantity);
    if (s.shelfLifeDays && s.shelfLifeDays < horizon && avg > 0) recommended = Math.min(recommended, Math.max(0, avg * s.shelfLifeDays + safety - s.quantity));
    recommended = Math.round(recommended * 10) / 10;

    const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} ${s.unit}`;
    const source = BASIS_LABEL[basis];
    let explanation: string;
    // Mention ajoutée quand la recommandation ne vient pas d'une prévision chiffrée mais de
    // l'objectif de stock fixé par le restaurant (démarrage à froid) : on dit d'où vient le chiffre.
    const parObjectif = daysWithData === 0 && (s.targetLevel ?? 0) > 0 && recommended > 0
      ? ' (ramène le stock à votre objectif)' : '';
    if (!acc) {
      // Produit hors recette : le seuil critique est la seule vérité disponible — et on le dit.
      explanation = `${s.productName} n'entre dans aucune recette : besoin estimé à partir de votre seuil critique uniquement (${fmt(s.criticalLevel)}). ` +
        (recommended > 0 ? `Commande recommandée : ${fmt(recommended)}${parObjectif}.` : 'Rien à commander pour l’instant.');
    } else {
      const peak = perDay.indexOf(Math.max(...perDay)); const peakDay = DOW_FR[new Date(today.getTime() + (peak + 1) * DAY_MS).getDay()];
      const base = `Besoin estimé de ${fmt(Math.round(need * 10) / 10)} sur ${horizon} jours, calculé à partir de ${acc.recipes} recette${acc.recipes > 1 ? 's' : ''} et de ${source}`;
      const ventes = basis === 'ventes_28j' || basis === 'ventes_7j';
      // Aucune vente saisie : on le dit d'emblée — c'est l'information la plus utile à un restaurant
      // qui démarre — avant d'expliquer sur quoi la commande s'appuie réellement.
      const preambule = daysWithData === 0
        ? `Pas encore assez de ventes pour prévoir ${s.productName.toLowerCase()} sur ${horizon} jours. `
        : '';
      explanation = preambule + base +
        (basis === 'ventes_28j' ? ` (pic ${peakDay})` : '') + '. ' +
        (basis === 'seuils'
          ? `Aucune vente ni couvert renseigné : la commande recommandée vient uniquement de votre seuil critique. `
          : basis === 'couverts' ? `Estimation de repli à partir de vos couverts : saisissez vos ventes pour l’affiner jour par jour. ` : '') +
        (ventes && daysWithData < 7 ? `Données encore légères (${daysWithData} jour${daysWithData > 1 ? 's' : ''}). ` : '') +
        `Stock actuel ${fmt(s.quantity)}` + (stockoutIdx !== null && need > 0 ? ` → rupture prévue ${DOW_FR[new Date(today.getTime() + (stockoutIdx + 1) * DAY_MS).getDay()]}.` : ', suffisant sur la période.') +
        (season ? ` Coefficient de saisonnalité ${season.coef} appliqué (mois ${season.months.join(', ')}).` : '') +
        (recommended > 0 ? ` Commande recommandée : ${fmt(recommended)}${parObjectif} (inclut ${safetyDays} j de sécurité).` : '');
    }
    out.push({
      productId: s.productId, productName: s.productName, unit: s.unit, horizonDays: horizon,
      predictedNeed: Math.round(need * 10) / 10, currentStock: s.quantity, safetyStock: Math.round(safety * 10) / 10, recommendedOrder: recommended,
      daysOfStockLeft: daysLeft, stockoutDay: stockoutIdx === null ? null : isoDay(new Date(today.getTime() + (stockoutIdx + 1) * DAY_MS)),
      confidence, explanation, avgDailyNeed: Math.round(avg * 1000) / 1000, perDay, basis, seasonCoef: season ? season.coef : 1,
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
