import { describe, it, expect } from 'vitest';
import { forecastRecipes, forecastProducts, buildSmartCart, type CartOffer } from '../lib/forecast.js';
import { classifyIntent } from '../lib/assistant.js';

const today = new Date('2026-09-18T12:00:00Z'); // vendredi
const iso = (d: Date) => d.toISOString().slice(0, 10);
// 8 semaines de ventes : 10/j en semaine, 20 le samedi, fermé lundi
const sales: { recipeId: string; day: string; portions: number }[] = [];
for (let d = 56; d >= 1; d--) { const date = new Date(today.getTime() - d * 86_400_000); const dow = date.getUTCDay(); if (dow === 1) continue; sales.push({ recipeId: 'r1', day: iso(date), portions: dow === 6 ? 20 : 10 }); }

describe('prévision', () => {
  it('reproduit la saisonnalité hebdo (samedi ×2, lundi 0)', () => {
    const rf = forecastRecipes(sales, ['r1'], { horizonDays: 7, today });
    const f = rf.get('r1')!; expect(f.confidence).toBeGreaterThanOrEqual(0.85);
    // demain = samedi 19/09 → 20 ; lundi 21/09 → 0 (jamais de vente)
    expect(f.perDay[0]).toBeGreaterThan(17); expect(f.perDay[0]).toBeLessThan(23); expect(f.perDay[2]).toBe(0); expect(f.perDay[3]).toBeGreaterThan(8.5); expect(f.perDay[3]).toBeLessThan(11.5);
  });
  it('déduit besoin produit, jour de rupture et commande recommandée avec explication', () => {
    const rf = forecastRecipes(sales, ['r1'], { horizonDays: 7, today });
    const [pf] = forecastProducts(rf, [{ recipeId: 'r1', productId: 'riz', quantity: 0.15 }], [{ productId: 'riz', productName: 'Riz parfumé', unit: 'kg', quantity: 5, criticalLevel: 3, targetLevel: 40 }], { horizonDays: 7, today });
    expect(pf.predictedNeed).toBeGreaterThan(9); expect(pf.predictedNeed).toBeLessThan(12);
    expect(pf.stockoutDay).toBe('2026-09-22'); // 3 + 1.5 + 0 (lundi fermé) + 1.5 > 5 kg le mardi
    expect(pf.recommendedOrder).toBeGreaterThan(pf.predictedNeed - 5);
    expect(pf.explanation).toMatch(/rupture prévue/);
  });
  it('sans recette, se rabat sur le seuil critique', () => {
    const [pf] = forecastProducts(new Map(), [], [{ productId: 'x', productName: 'Sel', unit: 'kg', quantity: 1, criticalLevel: 5, targetLevel: null }], { today });
    expect(pf.recommendedOrder).toBe(4); expect(pf.explanation).toMatch(/aucune recette/);
  });
});

describe('panier intelligent', () => {
  const O = (id: string, sup: string, product: string, packQty: number, packPrice: number, lead = 24, fee = 0, min = 0, rel = 90, inStock = true): CartOffer => ({ offerId: id, supplierId: sup, supplierName: sup, productId: product, packLabel: `${packQty}`, packQty, packPrice, unitPrice: packPrice / packQty, inStock, leadTimeHours: lead, deliveryFee: fee, minOrder: min, reliabilityPct: rel });
  it('choisit le moins cher compatible avec l’urgence et calcule l’économie', () => {
    const cart = buildSmartCart([{ productId: 'riz', productName: 'Riz', unit: 'kg', neededQty: 23, daysOfStockLeft: 3, preferredSupplierId: 'B' }], [O('a', 'A', 'riz', 25, 42), O('b', 'B', 'riz', 25, 45), O('c', 'C', 'riz', 25, 39, 120)]);
    expect(cart.suppliers[0].supplierName).toBe('A'); expect(cart.saving).toBe(3); expect(cart.suppliers[0].lines[0].reason).toMatch(/moins cher que B/);
  });
  it('regroupe pour éviter un fournisseur sous minimum', () => {
    const cart = buildSmartCart(
      [{ productId: 'riz', productName: 'Riz', unit: 'kg', neededQty: 25, daysOfStockLeft: 10 }, { productId: 'huile', productName: 'Huile', unit: 'L', neededQty: 5, daysOfStockLeft: 10 }],
      [O('a1', 'A', 'riz', 25, 42), O('a2', 'A', 'huile', 5, 24.5), O('b2', 'B', 'huile', 5, 22, 24, 15, 60)],
    );
    expect(cart.suppliers).toHaveLength(1); expect(cart.suppliers[0].supplierName).toBe('A'); expect(cart.notes[0]).toMatch(/déplacé vers A/);
  });
  it('liste les produits sans offre', () => {
    const cart = buildSmartCart([{ productId: 'x', productName: 'Yet', unit: 'kg', neededQty: 1, daysOfStockLeft: null }], []);
    expect(cart.unavailable[0].productName).toBe('Yet');
  });
});

describe('assistant — classification', () => {
  const ents = { products: ['Riz parfumé', 'Plantain', 'Huile de palme rouge'], recipes: ['Mafé bœuf', 'Poulet braisé'], suppliers: ['Afro Distribution Nantes'] };
  it.each([
    ['Qu’est-ce que je dois commander cette semaine ?', 'what_to_order', undefined],
    ['Pourquoi mes coûts augmentent ?', 'why_costs_up', undefined],
    ['Trouve-moi moins cher pour le riz.', 'find_cheaper', 'riz'],
    ['Combien me coûte réellement mon mafé ?', 'dish_cost', 'Mafé bœuf'],
    ['Quel fournisseur est le plus fiable ?', 'most_reliable_supplier', undefined],
    ['Est-ce que je dois augmenter le prix du poulet braisé ?', 'should_raise_price', 'Poulet braisé'],
    ['Combien il me reste de plantain ?', 'stock_level', 'Plantain'],
    ['Quelles ruptures arrivent ?', 'upcoming_stockouts', undefined],
  ])('%s', (q, intent, entity) => { const c = classifyIntent(q, ents); expect(c.intent).toBe(intent); if (entity) expect(c.entity).toBe(entity); });
});
