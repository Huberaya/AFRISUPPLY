// =============================================================
// AFRISUPPLY — Moteur d'analyse des coûts (chantier 4 de l'audit)
//
// Objectif : répondre à « pourquoi mes coûts augmentent ? » en une page,
// à partir des données réelles de l'application :
//   • achats réceptionnés / envoyés, au prix réellement facturé (chantier 3),
//   • historique de prix (source « facture » mise en avant),
//   • recettes et ventes.
//
// Toutes les fonctions sont PURES (aucun accès base, aucune horloge implicite) :
// elles sont donc testables ligne à ligne et auditables.
//
// Deux principes de calcul, assumés et documentés :
//   1. Un montant d'achat = quantité reçue (ou commandée si non réceptionnée) × prix
//      unitaire facturé (ou commandé si non facturé). Le prix facturé prime.
//   2. On sépare toujours ce qui vient du VOLUME et ce qui vient du PRIX :
//      acheter plus n'est pas la même chose que payer plus cher.
// =============================================================

export type PurchaseLine = {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  supplierId: string | null;
  supplierName: string;
  orderId: string;
  reference: string;
  /** Date d'achat (celle de la commande). */
  at: string;
  /** Quantité retenue (reçue si connue, sinon commandée). */
  quantity: number;
  /** Prix unitaire retenu (facturé si connu, sinon commandé). */
  unitCostEur: number;
  /** Vrai si le prix vient d'une facture réelle. */
  invoiced: boolean;
};

export type PricePoint = {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  supplierId: string | null;
  supplierName: string;
  unitPrice: number;
  recordedAt: string;
  source: string;   // facture | reception | manuel | catalogue
};

export type RecipeInput = {
  id: string;
  name: string;
  sellingPriceEur: number | null;
  targetMarginPct: number | null;
  isActive: boolean;
  ingredients: { productId: string; productName: string; unit: string; quantity: number }[];
  /** Portions vendues sur 30 jours (0 si aucune vente saisie). */
  portions30: number;
};

/** Clé de mois « AAAA-MM » d'une date ISO. */
export function monthKey(at: string | Date): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Les n derniers mois (clés croissantes), en incluant le mois courant. */
export function monthRange(months: number, today = new Date()): string[] {
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    out.push(monthKey(d));
  }
  return out;
}

const sum = (a: number, b: number) => a + b;
const round2 = (v: number) => Math.round(v * 100) / 100;

// -------------------------------------------------------------
// 1) Dépenses par mois et par catégorie
// -------------------------------------------------------------
export type MonthlySpend = {
  months: string[];
  totals: number[];
  total: number;
  byCategory: { category: string; totals: number[]; total: number }[];
};

export function monthlySpend(purchases: PurchaseLine[], months: string[]): MonthlySpend {
  const index = new Map(months.map((m, i) => [m, i]));
  const totals = months.map(() => 0);
  const perCategory = new Map<string, number[]>();
  for (const p of purchases) {
    const i = index.get(monthKey(p.at));
    if (i === undefined) continue;
    const amount = p.quantity * p.unitCostEur;
    totals[i] += amount;
    if (!perCategory.has(p.category)) perCategory.set(p.category, months.map(() => 0));
    perCategory.get(p.category)![i] += amount;
  }
  const byCategory = [...perCategory.entries()]
    .map(([category, t]) => ({ category, totals: t.map(round2), total: round2(t.reduce(sum, 0)) }))
    .sort((a, b) => b.total - a.total);
  return { months, totals: totals.map(round2), total: round2(totals.reduce(sum, 0)), byCategory };
}

// -------------------------------------------------------------
// 2) Indice de prix base 100 par catégorie (prix moyen pondéré du mois)
// -------------------------------------------------------------
export type PriceIndex = {
  category: string;
  /** Indice base 100, à COMPOSITION CONSTANTE (voir plus bas). */
  points: (number | null)[];
  /** Nombre de mois de la fenêtre qui portent au moins un relevé. */
  monthCount: number;
  /** Nombre de produits suivis dans la catégorie sur la fenêtre. */
  productsTracked: number;
  /** Nombre de produits dont le dernier relevé est supérieur au premier. */
  risingProducts: number;
  /**
   * Variation moyenne, à poids égal, des produits de la catégorie entre leur premier
   * et leur dernier relevé. Disponible même avec un seul mois de données — c'est le seul
   * signal honnête dans ce cas (on ne peut pas comparer des mois qui n'existent pas).
   */
  avgProductChangePct: number | null;
  /** Prix moyen des relevés du premier mois connu (contexte). */
  firstPrice: number;
  /** Prix moyen des relevés du dernier mois connu (contexte). */
  lastPrice: number;
  /** Variation de l'indice de catégorie d'un mois à l'autre — null s'il n'y a qu'un mois. */
  changePct: number | null;
};

/**
 * Indice de prix par catégorie.
 *
 * Choix de calcul, assumé : on indexe CHAQUE PRODUIT sur son premier prix relevé (base 100),
 * puis on moyenne les indices des produits présents dans le mois. Une simple moyenne des
 * prix de la catégorie serait trompeuse : l'arrivée d'un produit cher (ou la disparition
 * d'un produit bon marché) ferait bouger la « hausse » sans qu'aucun prix n'ait changé.
 * Ici, la composition est constante : ce qui bouge est un prix, pas un panier.
 *
 * Un seul mois de relevés = aucune comparaison mois à mois possible : `changePct` reste
 * `null` (on ne prétend pas que « c'est stable ») et `avgProductChangePct` porte le signal.
 */
export function priceIndexByCategory(points: PricePoint[], months: string[], opts: { invoicedOnly?: boolean } = {}): PriceIndex[] {
  const index = new Map(months.map((m, i) => [m, i]));
  const kept = points.filter((p) => (!opts.invoicedOnly || p.source === 'facture') && p.unitPrice > 0 && index.has(monthKey(p.recordedAt)));
  if (kept.length === 0) return [];

  // Prix moyen mensuel par produit.
  const perProduct = new Map<string, { category: string; sum: number[]; count: number[] }>();
  for (const p of kept) {
    if (!perProduct.has(p.productId)) perProduct.set(p.productId, { category: p.category, sum: months.map(() => 0), count: months.map(() => 0) });
    const acc = perProduct.get(p.productId)!;
    const i = index.get(monthKey(p.recordedAt))!;
    acc.sum[i] += p.unitPrice; acc.count[i] += 1;
  }

  const byCategory = new Map<string, { id: string; series: (number | null)[]; first: number | null; last: number | null }[]>();
  for (const [productId, acc] of perProduct) {
    const avg = acc.sum.map((v, i) => (acc.count[i] ? v / acc.count[i] : null));
    const firstIdx = avg.findIndex((v) => v !== null);
    if (firstIdx === -1) continue;
    const base = avg[firstIdx]!;
    const series = avg.map((v) => (v === null ? null : (v / base) * 100));
    // Variation propre au produit : entre son PREMIER et son DERNIER relevé réels
    // (utile même quand tout tombe dans un seul mois).
    const raw = kept.filter((p) => p.productId === productId).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    if (!byCategory.has(acc.category)) byCategory.set(acc.category, []);
    byCategory.get(acc.category)!.push({ id: productId, series, first: raw[0]?.unitPrice ?? null, last: raw[raw.length - 1]?.unitPrice ?? null });
  }

  const out: PriceIndex[] = [];
  for (const [category, products] of byCategory) {
    const pointsIdx = months.map((_, i) => {
      const vals = products.map((p) => p.series[i]).filter((v): v is number => v !== null);
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    });
    const monthCount = pointsIdx.filter((v) => v !== null).length;

    // Contexte : prix moyen réellement relevé sur le premier et le dernier mois connus.
    const rawMonth = (i: number) => {
      const vals = kept.filter((p) => p.category === category && index.get(monthKey(p.recordedAt)) === i).map((p) => p.unitPrice);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const firstIdx = pointsIdx.findIndex((v) => v !== null);
    const lastIdx = pointsIdx.length - 1 - [...pointsIdx].reverse().findIndex((v) => v !== null);
    const firstPrice = rawMonth(firstIdx), lastPrice = rawMonth(lastIdx);

    // Signal produit par produit (premier → dernier relevé), disponible dès le premier mois.
    // Les produits stables comptent pour 0 : la moyenne décrit le panier réel, pas
    // seulement les produits qui bougent (sinon on exagère la hausse).
    const changes = products
      .map((p) => (p.first && p.last ? ((p.last - p.first) / p.first) * 100 : null))
      .filter((v): v is number => v !== null);

    out.push({
      category,
      points: pointsIdx,
      monthCount,
      productsTracked: products.length,
      risingProducts: changes.filter((c) => c > 1).length,
      avgProductChangePct: changes.length ? Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 10) / 10 : null,
      firstPrice: round2(firstPrice ?? 0),
      lastPrice: round2(lastPrice ?? 0),
      // Variation de l'INDICE (composition constante), pas des prix moyens bruts : un produit
      // qui arrive dans le panier ne doit pas fabriquer une hausse. Et avec un seul mois de
      // relevés on refuse d'afficher « 0 % » — ce serait faux.
      changePct: monthCount >= 2 && pointsIdx[lastIdx] !== null
        ? Math.round((pointsIdx[lastIdx]! - 100) * 10) / 10
        : null,
    });
  }
  return out.sort((a, b) => (b.changePct ?? b.avgProductChangePct ?? -Infinity) - (a.changePct ?? a.avgProductChangePct ?? -Infinity));
}

// -------------------------------------------------------------
// 3) Top des dérives de prix (avec le montant que ça coûte vraiment)
// -------------------------------------------------------------
export type PriceDrift = {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  supplierId: string | null;
  supplierName: string;
  firstPrice: number;
  lastPrice: number;
  changePct: number;
  /** Quantité achetée depuis la première hausse (sert au chiffrage). */
  quantitySince: number;
  /** Ce que la hausse a coûté en euros : (dernier − premier) × quantité achetée. */
  impactEur: number;
  invoiced: boolean;
};

export function topPriceDrifts(points: PricePoint[], purchases: PurchaseLine[], limit = 10, opts: { onlyWithVolume?: boolean } = {}): PriceDrift[] {
  // `onlyWithVolume` (défaut) : une hausse sans achat sur la période n'a pas d'impact en euros.
  // On ne l'affiche pas avec « +0 € » (absurde) : elle part dans la liste « à surveiller ».
  const onlyWithVolume = opts.onlyWithVolume ?? true;
  // Un point de prix par produit : la hausse se lit entre le PREMIER et le DERNIER
  // prix constatés sur la fenêtre (300 jours pour l'appel de production).
  const perProduct = new Map<string, PricePoint[]>();
  for (const p of points) {
    if (!(p.unitPrice > 0)) continue;
    if (!perProduct.has(p.productId)) perProduct.set(p.productId, []);
    perProduct.get(p.productId)!.push(p);
  }
  const out: PriceDrift[] = [];
  for (const [productId, list] of perProduct) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const first = sorted[0], last = sorted[sorted.length - 1];
    const changePct = Math.round(((last.unitPrice - first.unitPrice) / first.unitPrice) * 1000) / 10;
    if (changePct < 1) continue;
    // Quantité réellement achetée entre les deux relevés (et non « en théorie »).
    const quantitySince = purchases
      .filter((p) => p.productId === productId && p.at >= first.recordedAt)
      .reduce((a, p) => a + p.quantity, 0);
    if (onlyWithVolume && quantitySince <= 0) continue;
    out.push({
      productId, productName: last.productName, category: last.category, unit: last.unit,
      supplierId: last.supplierId, supplierName: last.supplierName,
      firstPrice: round2(first.unitPrice), lastPrice: round2(last.unitPrice), changePct,
      quantitySince: round2(quantitySince),
      impactEur: round2((last.unitPrice - first.unitPrice) * quantitySince),
      invoiced: sorted.some((p) => p.source === 'facture'),
    });
  }
  return out.sort((a, b) => b.impactEur - a.impactEur).slice(0, limit);
}

// -------------------------------------------------------------
// 4) « Pourquoi mes coûts augmentent ? » : volume contre prix
// -------------------------------------------------------------
export type CostExplanation = {
  currentMonth: string;
  previousMonth: string;
  currentTotal: number;
  previousTotal: number;
  deltaTotal: number;
  /** Part du delta due au prix (à volume inchangé). */
  priceEffectEur: number;
  /** Part du delta due au volume (à prix inchangé). */
  volumeEffectEur: number;
  contributors: { productId: string; productName: string; deltaEur: number; pricePart: number; volumePart: number; reason: 'prix' | 'volume' | 'les deux'; productUrl: string }[];
  /** Phrase prête à afficher, calculée (jamais rédigée à la main). */
  sentence: string;
};

export function explainCostChange(purchases: PurchaseLine[], months: string[], today = new Date()): CostExplanation {
  const cur = months[months.length - 1] ?? monthKey(today);
  const prev = months[months.length - 2] ?? cur;
  const agg = (month: string) => {
    const m = new Map<string, { name: string; qty: number; amount: number }>();
    for (const p of purchases) {
      if (monthKey(p.at) !== month) continue;
      const row = m.get(p.productId) ?? { name: p.productName, qty: 0, amount: 0 };
      row.qty += p.quantity; row.amount += p.quantity * p.unitCostEur;
      m.set(p.productId, row);
    }
    return m;
  };
  const a = agg(prev), b = agg(cur);
  const ids = new Set([...a.keys(), ...b.keys()]);
  let priceEffect = 0, volumeEffect = 0, currentTotal = 0, previousTotal = 0;
  const contributors: CostExplanation['contributors'] = [];
  for (const id of ids) {
    const p = a.get(id), c = b.get(id);
    const qPrev = p?.qty ?? 0, qCur = c?.qty ?? 0;
    // Prix moyen réellement payé (montant / quantité) : robuste aux prix par ligne.
    const pPrev = p && p.qty > 0 ? p.amount / p.qty : null;
    const pCur = c && c.qty > 0 ? c.amount / c.qty : null;
    currentTotal += c?.amount ?? 0; previousTotal += p?.amount ?? 0;
    // Décomposition en deux temps : le prix joue sur les quantités du mois courant.
    const refPrice = pPrev ?? pCur ?? 0;
    const pricePart = (pCur ?? pPrev ?? 0) - refPrice === 0 ? 0 : ((pCur ?? refPrice) - (pPrev ?? refPrice)) * qCur;
    const volumePart = (qCur - qPrev) * refPrice;
    priceEffect += pricePart; volumeEffect += volumePart;
    const delta = (c?.amount ?? 0) - (p?.amount ?? 0);
    if (Math.abs(delta) < 0.5) continue;
    const reason: 'prix' | 'volume' | 'les deux' =
      Math.abs(pricePart) < 0.5 ? 'volume' : Math.abs(volumePart) < 0.5 ? 'prix' : 'les deux';
    contributors.push({
      productId: id, productName: c?.name ?? p!.name,
      deltaEur: round2(delta), pricePart: round2(pricePart), volumePart: round2(volumePart), reason,
      productUrl: `/app/achats/comparer/${id}`,
    });
  }
  contributors.sort((x, y) => Math.abs(y.deltaEur) - Math.abs(x.deltaEur));
  const deltaTotal = round2(currentTotal - previousTotal);
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;
  let sentence: string;
  if (Math.abs(deltaTotal) < 1) {
    sentence = `Vos achats sont stables : ${eur(currentTotal)} en ${monthLabel(cur)}, comme le mois précédent.`;
  } else if (deltaTotal > 0) {
    const pricePart = Math.max(0, priceEffect), volumePart = Math.max(0, volumeEffect);
    const main = contributors[0];
    sentence =
      `Vos achats ont coûté ${eur(currentTotal)} en ${monthLabel(cur)}, soit ${eur(deltaTotal)} de plus qu’en ${monthLabel(prev)}. ` +
      (pricePart >= volumePart
        ? `La hausse des PRIX explique l’essentiel (+${eur(pricePart)})`
        : `Le VOLUME acheté explique l’essentiel (+${eur(volumePart)})`) +
      (main ? `, principalement sur « ${main.productName} » (${main.deltaEur > 0 ? '+' : ''}${eur(main.deltaEur)}).` : '.');
  } else {
    const main = contributors[0];
    sentence = `Vos achats ont coûté ${eur(currentTotal)} en ${monthLabel(cur)}, soit ${eur(-deltaTotal)} de moins qu’en ${monthLabel(prev)}` +
      (main ? `, notamment grâce à « ${main.productName} » (${eur(main.deltaEur)}).` : '.');
  }
  return {
    currentMonth: cur, previousMonth: prev,
    currentTotal: round2(currentTotal), previousTotal: round2(previousTotal), deltaTotal,
    priceEffectEur: round2(priceEffect), volumeEffectEur: round2(volumeEffect),
    contributors: contributors.slice(0, 8), sentence,
  };
}

// -------------------------------------------------------------
// 5) Marge par plat, avec le coût réel des ingrédients
// -------------------------------------------------------------
export type RecipeMargin = {
  id: string;
  name: string;
  costPerPortion: number | null;
  sellingPriceEur: number | null;
  marginEur: number | null;
  marginPct: number | null;
  targetMarginPct: number | null;
  portions30: number;
  marginTotalEur: number | null;
  /** Ingrédients dont le prix n'est pas connu : la marge est alors partielle. */
  missingPrices: string[];
  ingredients: { productId: string; productName: string; unit: string; quantity: number; unitCostEur: number | null; lineCost: number | null }[];
  url: string;
};

export function recipeMargins(recipes: RecipeInput[], unitCostByProduct: Map<string, number>): RecipeMargin[] {
  const out = recipes.filter((r) => r.isActive).map((r) => {
    const ingredients = r.ingredients.map((i) => {
      const unitCostEur = unitCostByProduct.get(i.productId) ?? null;
      return { ...i, unitCostEur, lineCost: unitCostEur === null ? null : round2(unitCostEur * i.quantity) };
    });
    const missingPrices = ingredients.filter((i) => i.unitCostEur === null).map((i) => i.productName);
    const costPerPortion = missingPrices.length ? null : round2(ingredients.reduce((a, i) => a + (i.lineCost ?? 0), 0));
    const marginEur = costPerPortion !== null && r.sellingPriceEur !== null ? round2(r.sellingPriceEur - costPerPortion) : null;
    const marginPct = marginEur !== null && r.sellingPriceEur ? Math.round((marginEur / r.sellingPriceEur) * 1000) / 10 : null;
    return {
      id: r.id, name: r.name, costPerPortion, sellingPriceEur: r.sellingPriceEur, marginEur, marginPct,
      targetMarginPct: r.targetMarginPct, portions30: r.portions30,
      marginTotalEur: marginEur === null ? null : round2(marginEur * r.portions30),
      missingPrices, ingredients, url: '/app/recettes',
    };
  });
  return out.sort((a, b) => (a.marginPct ?? 999) - (b.marginPct ?? 999));
}

// -------------------------------------------------------------
// 6) Coût matière d'un plat, mois par mois (reconstruit depuis les prix réels)
// -------------------------------------------------------------
export type RecipeCostHistory = { id: string; name: string; points: (number | null)[]; firstCost: number | null; lastCost: number | null; changePct: number | null };

export function recipeCostHistory(recipes: RecipeInput[], points: PricePoint[], months: string[]): RecipeCostHistory[] {
  // Fin de chaque mois : on retient le dernier prix connu à cette date (sinon le premier connu après).
  const monthEnds = months.map((m) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(Date.UTC(y, mo, 1)).toISOString();
  });
  const byProduct = new Map<string, PricePoint[]>();
  for (const p of points) {
    if (!(p.unitPrice > 0)) continue;
    if (!byProduct.has(p.productId)) byProduct.set(p.productId, []);
    byProduct.get(p.productId)!.push(p);
  }
  const priceAt = (productId: string, at: string): number | null => {
    const list = (byProduct.get(productId) ?? []).filter((p) => p.recordedAt <= at).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    if (list.length) return list[list.length - 1].unitPrice;
    const after = (byProduct.get(productId) ?? []).filter((p) => p.recordedAt > at).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    return after.length ? after[0].unitPrice : null;
  };
  return recipes.filter((r) => r.isActive && r.ingredients.length).map((r) => {
    const pts: (number | null)[] = months.map((_, i) => {
      const costs = r.ingredients.map((ing) => {
        const price = priceAt(ing.productId, monthEnds[i]);
        return price === null ? null : price * ing.quantity;
      });
      if (costs.some((c) => c === null)) return null;
      return round2(costs.reduce<number>((a, c) => a + (c ?? 0), 0));
    });
    const first = pts.find((p) => p !== null) ?? null;
    const lastIdx = [...pts].reverse().findIndex((p) => p !== null);
    const last = lastIdx === -1 ? null : pts[pts.length - 1 - lastIdx];
    return {
      id: r.id, name: r.name, points: pts, firstCost: first, lastCost: last,
      changePct: first && last ? Math.round(((last - first) / first) * 1000) / 10 : null,
    };
  });
}
