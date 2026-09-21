import { describe, it, expect } from 'vitest';
import { stockStatus, daysOfStock, alertsFromStock, alertsFromPrices, compareOffers, recipeCost, marginAnalysis, supplierReliability, computeDailyUse } from '../lib/engines.js';

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

describe('fiabilité', () => {
  it('pénalise retards et écarts', () => { expect(supplierReliability({ delivered: 10, late: 2, discrepancies: 1 })).toBe(84); expect(supplierReliability({ delivered: 0, late: 0, discrepancies: 0 })).toBe(85); });
});
