import { describe, it, expect } from 'vitest';
import { stockStatus, daysOfStock, alertsFromStock, alertsFromPrices, compareOffers, recipeCost, marginAnalysis, supplierReliability, computeDailyUse, marginSeries, priceIndexByCategory, priceAtMonth, type StockSnapshot } from '../lib/engines.js';

const snap = (q: number, crit: number, use: number) => ({ productId: 'p', productName: 'Riz parfumé', unit: 'kg', quantity: q, criticalLevel: crit, targetLevel: 45, avgDailyUse: use });

describe('stock', () => {
  it('calcule les jours de stock', () => { expect(daysOfStock(snap(22, 15, 5.5))).toBe(4); expect(daysOfStock(snap(22, 15, 0))).toBeNull(); });
  it('statut critique sous le seuil ou < 3 jours', () => { expect(stockStatus(snap(10, 15, 1))).toBe('critique'); expect(stockStatus(snap(20, 5, 10))).toBe('critique'); });
  it('statut bas entre 3 et 6 jours', () => expect(stockStatus(snap(22, 5, 5))).toBe('bas'));
  it('statut ok sinon', () => expect(stockStatus(snap(60, 5, 3))).toBe('ok'));
  it('génère une alerte rouge lisible', () => {
    const [a] = alertsFromStock([snap(10, 15, 3)]);
    expect(a.severity).toBe('red'); expect(a.message).toContain('seuil critique');
  });
  // Chantier 1 (audit) : plus de faux « critique sous votre seuil critique de 0 kg ».
  it('produit non configuré à zéro : statut « bas » + alerte bleue « à renseigner » (jamais un faux critique)', () => {
    const unconf = { productId: 'p', productName: 'Sel', unit: 'kg', quantity: 0, criticalLevel: 0, targetLevel: null, avgDailyUse: 0 };
    expect(stockStatus(unconf)).toBe('bas');
    const [a] = alertsFromStock([unconf]);
    expect(a.severity).toBe('blue'); expect(a.title).toMatch(/renseigner/i);
    expect(a.message).not.toContain('seuil critique de 0');
  });
  it('produit non configuré avec du stock : pas de statut alarmiste, pas d’alerte', () => {
    const unconf = { productId: 'p', productName: 'Sel', unit: 'kg', quantity: 4, criticalLevel: 0, targetLevel: null, avgDailyUse: 0 };
    expect(stockStatus(unconf)).toBe('ok');
    expect(alertsFromStock([unconf])).toHaveLength(0);
  });
});

describe('prix', () => {
  it('détecte une hausse ≥ seuil et cite les alternatives', () => {
    const pts = [
      { offerId: 'o1', supplierId: 's1', supplierName: 'Afro', productId: 'p', productName: 'Huile de palme', unit: 'L', unitPrice: 4.375, recordedAt: '2026-07-01' },
      { offerId: 'o1', supplierId: 's1', supplierName: 'Afro', productId: 'p', productName: 'Huile de palme', unit: 'L', unitPrice: 4.9, recordedAt: '2026-09-18' },
    ];
    const alt = new Map([['p', [{ ...pts[0], offerId: 'o2', supplierName: 'Sahel', unitPrice: 4.3 }]]]);
    const [a] = alertsFromPrices(pts, 8, alt);
    expect(a.kind).toBe('hausse_prix'); expect(a.message).toMatch(/12 %/); expect(a.message).toContain('Sahel');
  });
  it('ignore une hausse sous le seuil', () => {
    const pts = [{ offerId: 'o1', supplierId: 's1', supplierName: 'A', productId: 'p', productName: 'X', unit: 'kg', unitPrice: 1, recordedAt: '2026-01-01' }, { offerId: 'o1', supplierId: 's1', supplierName: 'A', productId: 'p', productName: 'X', unit: 'kg', unitPrice: 1.03, recordedAt: '2026-02-01' }];
    expect(alertsFromPrices(pts, 8)).toHaveLength(0);
  });
});

describe('comparateur', () => {
  const offers = [
    { offerId: 'a', supplierId: 'A', supplierName: 'Fournisseur A', packLabel: 'Sac 25 kg', packQty: 25, packPrice: 42, unitPrice: 1.68, inStock: true, leadTimeHours: 24, deliveryFee: 0, minOrder: 0, reliabilityPct: 94 },
    { offerId: 'b', supplierId: 'B', supplierName: 'Fournisseur B', packLabel: 'Sac 25 kg', packQty: 25, packPrice: 45, unitPrice: 1.8, inStock: true, leadTimeHours: 48, deliveryFee: 0, minOrder: 0, reliabilityPct: 90 },
    { offerId: 'c', supplierId: 'C', supplierName: 'Fournisseur C', packLabel: 'Sac 25 kg', packQty: 25, packPrice: 39, unitPrice: 1.56, inStock: true, leadTimeHours: 120, deliveryFee: 0, minOrder: 0, reliabilityPct: 88 },
  ];
  it('recommande A quand le stock ne permet pas d’attendre C (scénario du concept)', () => {
    const r = compareOffers(offers, { daysOfStockLeft: 4, neededQty: 23, unit: 'kg' });
    expect(r.recommended?.supplierName).toBe('Fournisseur A');
    expect(r.justification.join(' ')).toMatch(/Fournisseur C est moins cher/);
  });
  it('recommande C quand il n’y a pas d’urgence', () => {
    const r = compareOffers(offers, { daysOfStockLeft: 20, neededQty: 23, unit: 'kg' });
    expect(r.recommended?.supplierName).toBe('Fournisseur C');
  });

  // Chantier 3 (audit B8) — le score se fait sur le COÛT TOTAL (colis + livraison, minimum inclus).
  it('livraison payante : recommande le vrai moins cher au total, même avec un prix unitaire plus élevé', () => {
    const two = [
      { offerId: 'a', supplierId: 'A', supplierName: 'Cher livraison offerte', packLabel: 'Sac 10 kg', packQty: 10, packPrice: 20, unitPrice: 2, inStock: true, leadTimeHours: 24, deliveryFee: 0, minOrder: 0, reliabilityPct: 90 },
      { offerId: 'b', supplierId: 'B', supplierName: 'Bon marché livraison payante', packLabel: 'Sac 10 kg', packQty: 10, packPrice: 15, unitPrice: 1.5, inStock: true, leadTimeHours: 24, deliveryFee: 6, minOrder: 0, reliabilityPct: 90 },
    ];
    // 10 kg : A = 20 € livrés ; B = 15 + 6 = 21 € → c'est A le vrai moins cher (l'ancien score prenait B).
    const r = compareOffers(two, { daysOfStockLeft: 30, neededQty: 10, unit: 'kg' });
    expect(r.recommended?.supplierName).toBe('Cher livraison offerte');
    expect(r.recommended?.totalCostEur).toBe(20);
    expect(r.recommended?.strengths).toContain('Livraison offerte');
    expect(r.ranked.find((o) => o.offerId === 'b')!.totalCostEur).toBe(21);
  });
  it('une livraison payante peut rester gagnante : le total est affiché « dont X € de livraison »', () => {
    const two = [
      { offerId: 'a', supplierId: 'A', supplierName: 'Livraison offerte', packLabel: 'Sac 10 kg', packQty: 10, packPrice: 20, unitPrice: 2, inStock: true, leadTimeHours: 24, deliveryFee: 0, minOrder: 0, reliabilityPct: 90 },
      { offerId: 'b', supplierId: 'B', supplierName: 'Livraison 2 €', packLabel: 'Sac 10 kg', packQty: 10, packPrice: 15, unitPrice: 1.5, inStock: true, leadTimeHours: 24, deliveryFee: 2, minOrder: 0, reliabilityPct: 90 },
    ];
    const r = compareOffers(two, { daysOfStockLeft: 30, neededQty: 10, unit: 'kg' });
    expect(r.recommended?.supplierName).toBe('Livraison 2 €');       // 17 € < 20 €
    expect(r.justification.join(' ')).toMatch(/dont 2,00 € de livraison/);
  });
  it('sous le minimum de commande : le coût réel = le minimum facturé, avec pénalité et avertissement', () => {
    const two = [
      { offerId: 'x', supplierId: 'X', supplierName: 'Sans minimum', packLabel: 'Sac 10 kg', packQty: 10, packPrice: 15, unitPrice: 1.5, inStock: true, leadTimeHours: 24, deliveryFee: 0, minOrder: 0, reliabilityPct: 90 },
      { offerId: 'y', supplierId: 'Y', supplierName: 'Avec minimum', packLabel: 'Sac 10 kg', packQty: 10, packPrice: 10, unitPrice: 1, inStock: true, leadTimeHours: 24, deliveryFee: 0, minOrder: 15, reliabilityPct: 90 },
    ];
    // Y a le meilleur prix unitaire mais 10 € de marchandises sous un minimum à 15 € : on paie 15 €.
    const r = compareOffers(two, { daysOfStockLeft: 30, neededQty: 10, unit: 'kg' });
    const y = r.ranked.find((o) => o.offerId === 'y')!;
    expect(y.underMin).toBe(true);
    expect(y.totalCostEur).toBe(15);
    expect(y.weaknesses.join(' ')).toMatch(/minimum de commande/);
    expect(y.score).toBeLessThan(r.ranked.find((o) => o.offerId === 'x')!.score); // pénalité sous-minimum
    expect(r.recommended?.supplierName).toBe('Sans minimum');
    expect(r.ranked.map((o) => o.supplierName)).toEqual(['Sans minimum', 'Avec minimum']);
  });
});

describe('recettes', () => {
  it('coût matière + marge + prix conseillé', () => {
    const cost = recipeCost([{ productId: 'poulet', productName: 'Poulet', quantity: 0.45, unit: 'kg' }, { productId: 'riz', productName: 'Riz', quantity: 0.12, unit: 'kg' }], new Map([['poulet', 4.8], ['riz', 1.68]]));
    expect(cost.total).toBeCloseTo(2.36, 2);
    const m = marginAnalysis(6.3, 18, 70); expect(m.grossMargin).toBe(11.7); expect(m.marginPct).toBe(65); expect(m.suggestedPrice).toBe(21);
  });
  it('consommation journalière depuis ventes × recettes', () => {
    const today = new Date().toISOString().slice(0, 10);
    const use = computeDailyUse([{ recipeId: 'r', day: today, portions: 28 }], [{ recipeId: 'r', productId: 'riz', quantity: 0.5 }], 28);
    expect(use.get('riz')).toBe(0.5);
  });
});

// Chantier 2 (audit B3/U4) — la vérité des coûts : jamais « 0,00 € » ni marge 100 % sans cotations.
describe('vérité des coûts (chantier 2)', () => {
  const ing = (id: string, name: string, q = 1) => ({ productId: id, productName: name, quantity: q, unit: 'kg' });

  it('un ingrédient sans prix ⇒ coût incomplet (« ≥ X € »), pas fiable si > 30 % inconnu', () => {
    const cost = recipeCost([ing('a', 'A'), ing('b', 'B')], new Map([['a', 4]]));
    expect(cost.status).toBe('incomplet');
    expect(cost.unpriced).toEqual(['B']);
    expect(cost.total).toBe(4);          // coût connu PARTIEL — affiché « ≥ 4,00 € », jamais 0,00 €
    expect(cost.coverage).toBe(0.5);
    expect(cost.reliable).toBe(false);   // 50 % > 30 % : l'IA ne doit pas chiffrer
  });
  it('≤ 30 % d\'ingrédients sans prix : annonçable en « ≥ X »', () => {
    const items = Array.from({ length: 10 }, (_, k) => ing(`p${k}`, `P${k}`, 0.1));
    const prices = new Map(Array.from({ length: 9 }, (_, k) => [`p${k}`, 10] as const));
    const cost = recipeCost(items, prices);
    expect(cost.status).toBe('incomplet');
    expect(cost.reliable).toBe(true);    // 10 % inconnu seulement
    expect(cost.total).toBeCloseTo(9, 2);
  });
  it('marge masquée si coût incomplet : jamais de marge fausse ni de prix conseillé', () => {
    const m = marginAnalysis(2, 10, 70, false);
    expect(m).toEqual({ grossMargin: null, marginPct: null, suggestedPrice: null, status: 'incomplet' });
  });
  it('coût complet : comportement historique inchangé', () => {
    const m = marginAnalysis(6.3, 18, 70, true);
    expect(m.grossMargin).toBe(11.7); expect(m.marginPct).toBe(65); expect(m.suggestedPrice).toBe(21); expect(m.status).toBe('complet');
  });
  it('report de prix : le dernier prix connu sert jusqu\'au mois suivant, jamais avant', () => {
    const pbm = new Map([['2026-02', 5], ['2026-04', 7]]);
    expect(priceAtMonth(pbm, '2026-01')).toBeNull();  // avant la première cotation : inconnu
    expect(priceAtMonth(pbm, '2026-02')).toBe(5);
    expect(priceAtMonth(pbm, '2026-03')).toBe(5);     // report en avant
    expect(priceAtMonth(pbm, '2026-05')).toBe(7);
  });
  it('courbe de marge : prix qui monte → marge qui baisse, ventes agrégées', () => {
    const s = marginSeries({
      recipeId: 'r', name: 'Riz sauce', ingredients: [ing('riz', 'Riz')], sellingPriceEur: 10,
      months: ['2026-01', '2026-02', '2026-03'],
      portionsByMonth: new Map([['2026-01', 2]]),
      priceByMonth: new Map([['riz', new Map([['2026-01', 4], ['2026-02', 5]])]]),
      currentUnpriced: [],
    });
    expect(s.points[0]).toMatchObject({ month: '2026-01', costPerPortion: 4, marginPct: 60, grossMarginPerPortion: 6, portionsSold: 2, revenueEur: 20 });
    expect(s.points[1].marginPct).toBe(50);            // coût 5 → marge 50 %
    expect(s.points[2].costPerPortion).toBe(5);        // prix de février reporté en mars
    expect(s.portionsSold).toBe(2); expect(s.revenueEur).toBe(20);
  });
  it('mois sans aucun prix connu ⇒ trou honnête (null), pas d\'extrapolation vers le passé', () => {
    const s = marginSeries({
      recipeId: 'r', name: 'Riz sauce', ingredients: [ing('riz', 'Riz')], sellingPriceEur: 10,
      months: ['2025-11', '2026-01'], portionsByMonth: new Map(),
      priceByMonth: new Map([['riz', new Map([['2026-01', 4]])]]), currentUnpriced: ['Riz'],
    });
    expect(s.points[0].costPerPortion).toBeNull();
    expect(s.points[0].marginPct).toBeNull();
    expect(s.points[1].costPerPortion).toBe(4);
    expect(s.status).toBe('incomplet');                 // ingrédient encore sans prix aujourd'hui
  });
  it('indice de prix par catégorie : base 100, moyenne des produits', () => {
    const idx = priceIndexByCategory({
      months: ['2026-01', '2026-02'],
      products: [
        { productId: 'r1', category: 'feculents', priceByMonth: new Map([['2026-01', 2], ['2026-02', 2.2]]) },
        { productId: 'r2', category: 'feculents', priceByMonth: new Map([['2026-01', 4], ['2026-02', 4]]) },
      ],
    });
    expect(idx[0].points[0]).toEqual({ month: '2026-01', index: 100 });
    expect(idx[0].points[1].index).toBe(105);           // moyenne(110 %, 100 %)
    expect(idx[0].baseMonth).toBe('2026-01');
  });
});

describe('fiabilité', () => {
  it('pénalise retards et écarts', () => { expect(supplierReliability({ delivered: 10, late: 2, discrepancies: 1 })).toBe(84); expect(supplierReliability({ delivered: 0, late: 0, discrepancies: 0 })).toBe(85); });
});

// =============================================================
// Chantier 4 (audit) — alerte de rupture vs livraison couvrante
// Critère de validation : rupture NON déclenchée si la livraison couvre le creux.
// =============================================================
describe('alertes stock : livraison couvrante (chantier 4)', () => {
  const snap = (over: Partial<StockSnapshot> = {}): StockSnapshot => ({
    productId: 'p1', productName: 'Riz', unit: 'kg', quantity: 2, criticalLevel: 5, targetLevel: 20, avgDailyUse: 1, ...over,
  });
  it('la livraison couvre le creux → pas d\'alerte de rupture (critère de validation)', () => {
    // 2 kg à 1 kg/j → rupture dans 2 j ; livraison à J+2 (au plus tard le jour de la rupture) → couvert
    expect(alertsFromStock([snap({ nextDeliveryInDays: 2 })])).toHaveLength(0);
    expect(alertsFromStock([snap({ nextDeliveryInDays: 0 })])).toHaveLength(0);
    expect(alertsFromStock([snap({ nextDeliveryInDays: 1 })])).toHaveLength(0);
    // produit déjà à zéro : la livraison du jour couvre, celle de demain non
    expect(alertsFromStock([snap({ quantity: 0, nextDeliveryInDays: 0 })])).toHaveLength(0);
    expect(alertsFromStock([snap({ quantity: 0, nextDeliveryInDays: 1 })])).toHaveLength(1);
  });
  it('livraison APRÈS la rupture → alerte maintenue, message daté', () => {
    const alerts = alertsFromStock([snap({ nextDeliveryInDays: 5 })]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe('rupture');
    expect(alerts[0].message).toContain('après la rupture prévue');
    expect(alerts[0].message).toContain('5 j');
  });
  it('sans commande en cours → comportement inchangé', () => {
    expect(alertsFromStock([snap()])).toHaveLength(1);
    expect(alertsFromStock([snap({ quantity: 0 })])[0].kind).toBe('rupture');
  });
});
