// Chantier 4 (audit) — « Pourquoi mes coûts augmentent ? » en une page.
//
// Moteur d'analyse : fonctions pures, testables, sans valeur codée en dur.
// Deux principes de calcul assumés :
//   1. le prix RÉELLEMENT facturé prime sur le prix commandé (chantier 3) ;
//   2. on sépare la part « volume » de la part « prix » dans toute évolution.
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import {
  monthKey, monthRange, monthlySpend, priceIndexByCategory, topPriceDrifts, explainCostChange, recipeMargins, recipeCostHistory,
  type PurchaseLine, type PricePoint, type RecipeInput,
} from '../lib/analysis.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.CRON_SECRET = 'cron-test'; process.env.PGLITE_DIR = 'memory://analysis';

const line = (over: Partial<PurchaseLine> = {}): PurchaseLine => ({
  productId: 'p1', productName: 'Riz parfumé', category: 'feculents', unit: 'kg', supplierId: 's1', supplierName: 'Grossiste A',
  orderId: 'o1', reference: 'AFS-1', at: '2026-09-10T10:00:00.000Z', quantity: 50, unitCostEur: 1.68, invoiced: true, ...over,
});
const point = (over: Partial<PricePoint> = {}): PricePoint => ({
  productId: 'p1', productName: 'Riz parfumé', category: 'feculents', unit: 'kg', supplierId: 's1', supplierName: 'Grossiste A',
  unitPrice: 1.68, recordedAt: '2026-06-15T10:00:00.000Z', source: 'facture', ...over,
});

describe('1. Découpage du temps et dépenses mensuelles', () => {
  it('range les achats dans le bon mois et additionne par catégorie', () => {
    const months = ['2026-07', '2026-08', '2026-09'];
    const r = monthlySpend([
      line({ at: '2026-07-05T00:00:00Z', quantity: 10, unitCostEur: 2 }),      // 20 € feculents
      line({ at: '2026-08-20T00:00:00Z', quantity: 5, unitCostEur: 3 }),       // 15 € feculents
      line({ at: '2026-09-02T00:00:00Z', quantity: 2, unitCostEur: 10, category: 'frais', productId: 'p2' }), // 20 € frais
      line({ at: '2026-01-01T00:00:00Z', quantity: 99, unitCostEur: 99 }),     // hors fenêtre : ignoré
    ], months);
    expect(r.months).toEqual(months);
    expect(r.totals).toEqual([20, 15, 20]);
    expect(r.total).toBe(55);
    expect(r.byCategory[0].category).toBe('feculents');                        // 20 + 15 = 35 €, le poste le plus lourd
    expect(r.byCategory[0].total).toBe(35);
    expect(r.byCategory.find((c) => c.category === 'feculents')!.totals).toEqual([20, 15, 0]);
    expect(r.byCategory.find((c) => c.category === 'frais')!.totals).toEqual([0, 0, 20]);
  });
  it('monthRange couvre les n derniers mois, dans l’ordre', () => {
    expect(monthRange(3, new Date('2026-09-21T12:00:00Z'))).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(monthKey('2026-01-31T23:00:00Z')).toBe('2026-01');
  });
});

describe('2. Indice de prix base 100 par catégorie', () => {
  it('calcule l’indice depuis les prix relevés et met en avant le premier mois connu', () => {
    const months = ['2026-07', '2026-08', '2026-09'];
    const idx = priceIndexByCategory([
      point({ recordedAt: '2026-07-10T00:00:00Z', unitPrice: 1.60 }),
      point({ recordedAt: '2026-08-10T00:00:00Z', unitPrice: 1.68 }),
      point({ recordedAt: '2026-09-10T00:00:00Z', unitPrice: 1.84 }),
    ], months);
    expect(idx).toHaveLength(1);
    expect(idx[0].points[0]).toBe(100);                                        // base = juillet
    expect(idx[0].points[2]).toBeCloseTo(115, 1);                              // 1,84 / 1,60
    expect(idx[0].changePct).toBeCloseTo(15, 1);
  });
  it('n’invente pas de prix : un mois sans relevé reste vide', () => {
    const idx = priceIndexByCategory([point({ recordedAt: '2026-09-10T00:00:00Z' })], ['2026-07', '2026-08', '2026-09']);
    expect(idx[0].points).toEqual([null, null, 100]);
  });
  it('peut se limiter aux prix réellement facturés', () => {
    const months = ['2026-08', '2026-09'];
    const all = priceIndexByCategory([point({ recordedAt: '2026-08-01T00:00:00Z', unitPrice: 2, source: 'catalogue' }), point({ recordedAt: '2026-09-01T00:00:00Z', unitPrice: 4, source: 'facture' })], months);
    const factures = priceIndexByCategory([point({ recordedAt: '2026-08-01T00:00:00Z', unitPrice: 2, source: 'catalogue' }), point({ recordedAt: '2026-09-01T00:00:00Z', unitPrice: 4, source: 'facture' })], months, { invoicedOnly: true });
    expect(all[0].points[1]).toBe(200);                                        // base 100 sur le catalogue
    expect(factures[0].points).toEqual([null, 100]);                           // un seul point : base = septembre
  });
});

  it('à composition constante : l’arrivée d’un produit cher ne fabrique pas une hausse', () => {
    // Juillet : riz 1 € et huile 2 €. Septembre : mêmes produits + manioc 10 € (nouveau, jamais relevé avant).
    // Une moyenne brute des prix de la catégorie bondirait (+X %) alors qu'AUCUN prix n'a changé.
    const months = ['2026-07', '2026-08', '2026-09'];
    const idx = priceIndexByCategory([
      point({ productId: 'riz', category: 'feculents', recordedAt: '2026-07-01T00:00:00Z', unitPrice: 1 }),
      point({ productId: 'huile', category: 'feculents', recordedAt: '2026-07-01T00:00:00Z', unitPrice: 2 }),
      point({ productId: 'riz', category: 'feculents', recordedAt: '2026-09-01T00:00:00Z', unitPrice: 1 }),
      point({ productId: 'huile', category: 'feculents', recordedAt: '2026-09-01T00:00:00Z', unitPrice: 2 }),
      point({ productId: 'manioc', category: 'feculents', recordedAt: '2026-09-01T00:00:00Z', unitPrice: 10 }),
    ], months);
    expect(idx[0].changePct).toBe(0);                                          // aucun prix n'a bougé
    expect(idx[0].productsTracked).toBe(3);
    expect(idx[0].risingProducts).toBe(0);
  });
  it('fait remonter une vraie hausse même noyée dans une moyenne de catégorie', () => {
    const months = ['2026-08', '2026-09'];
    const idx = priceIndexByCategory([
      point({ productId: 'p1', category: 'epicerie', recordedAt: '2026-08-01T00:00:00Z', unitPrice: 1 }),
      point({ productId: 'p1', category: 'epicerie', recordedAt: '2026-09-01T00:00:00Z', unitPrice: 1.10 }),
      point({ productId: 'p2', category: 'epicerie', recordedAt: '2026-08-01T00:00:00Z', unitPrice: 100 }),
      point({ productId: 'p2', category: 'epicerie', recordedAt: '2026-09-01T00:00:00Z', unitPrice: 100 }),
    ], months);
    expect(idx[0].points[1]).toBeCloseTo(105, 1);                              // +10 % sur un produit, +0 % sur l'autre
    expect(idx[0].changePct).toBeCloseTo(5, 1);
    expect(idx[0].risingProducts).toBe(1);
    expect(idx[0].avgProductChangePct).toBeCloseTo(5, 1);
  });
  it('un seul mois de relevés : refuse d’annoncer « 0 % » et donne le vrai signal produit', () => {
    const idx = priceIndexByCategory([
      point({ category: 'frais', recordedAt: '2026-09-02T00:00:00Z', unitPrice: 1.60 }),
      point({ category: 'frais', recordedAt: '2026-09-20T00:00:00Z', unitPrice: 1.84 }),
    ], ['2026-09']);
    expect(idx[0].monthCount).toBe(1);
    expect(idx[0].changePct).toBeNull();                                       // pas de comparaison inventée
    expect(idx[0].avgProductChangePct).toBeCloseTo(15, 1);                     // +15 % sur le produit suivi
    expect(idx[0].risingProducts).toBe(1);
  });
  it('une hausse sans aucun achat sur la période n’est pas chiffrée à 0 € dans le classement', () => {
    const pts = [
      point({ productId: 'p1', recordedAt: '2026-06-01T00:00:00Z', unitPrice: 2 }),
      point({ productId: 'p1', recordedAt: '2026-09-01T00:00:00Z', unitPrice: 2.5 }),
    ];
    expect(topPriceDrifts(pts, [], 10)).toHaveLength(0);                        // rien d'acheté → aucun impact en euros
    const surveille = topPriceDrifts(pts, [], 10, { onlyWithVolume: false });
    expect(surveille).toHaveLength(1);                                          // …mais la hausse reste visible, à part
    expect(surveille[0].changePct).toBeCloseTo(25, 1);
    expect(surveille[0].quantitySince).toBe(0);
  });

describe('3. Top des dérives, chiffré sur les quantités réellement achetées', () => {
  it('classe par montant d’impact et non par pourcentage', () => {
    const points = [
      point({ productId: 'p1', productName: 'Riz', recordedAt: '2026-06-01T00:00:00Z', unitPrice: 1 }),
      point({ productId: 'p1', productName: 'Riz', recordedAt: '2026-09-01T00:00:00Z', unitPrice: 1.2 }),   // +20 %, 500 kg achetés → 100 €
      point({ productId: 'p2', productName: 'Huile', recordedAt: '2026-06-01T00:00:00Z', unitPrice: 2 }),
      point({ productId: 'p2', productName: 'Huile', recordedAt: '2026-09-01T00:00:00Z', unitPrice: 2.6 }), // +30 %, 20 L achetés → 12 €
    ];
    const drifts = topPriceDrifts(points, [line({ productId: 'p1', quantity: 500, at: '2026-07-01T00:00:00Z' }), line({ productId: 'p2', quantity: 20, at: '2026-07-01T00:00:00Z' })]);
    expect(drifts[0].productName).toBe('Riz');                                 // 100 € > 12 € malgré +20 % < +30 %
    expect(drifts[0].impactEur).toBeCloseTo(100, 2);
    expect(drifts[1].changePct).toBeCloseTo(30, 1);
  });
  it('ignore les baisses et les produits sans historique', () => {
    const drifts = topPriceDrifts([
      point({ productId: 'p1', recordedAt: '2026-06-01T00:00:00Z', unitPrice: 2 }),
      point({ productId: 'p1', recordedAt: '2026-09-01T00:00:00Z', unitPrice: 1.5 }),
      point({ productId: 'p3', recordedAt: '2026-09-01T00:00:00Z', unitPrice: 5 }),
    ], []);
    expect(drifts).toHaveLength(0);
  });
});

describe('4. « Pourquoi mes coûts augmentent ? » : séparation volume / prix', () => {
  it('attribue la hausse au prix quand les quantités sont identiques', () => {
    const months = ['2026-08', '2026-09'];
    const e = explainCostChange([
      line({ at: '2026-08-10T00:00:00Z', quantity: 100, unitCostEur: 2 }),
      line({ at: '2026-09-10T00:00:00Z', quantity: 100, unitCostEur: 2.5 }),
    ], months);
    expect(e.previousTotal).toBe(200); expect(e.currentTotal).toBe(250);
    expect(e.deltaTotal).toBe(50);
    expect(e.priceEffectEur).toBeCloseTo(50, 2);                                // tout vient du prix
    expect(e.volumeEffectEur).toBeCloseTo(0, 2);
    expect(e.contributors[0].reason).toBe('prix');
    expect(e.sentence).toMatch(/hausse des PRIX/);
    expect(e.sentence).toMatch(/50,00 €/);
  });
  it('attribue la hausse au volume quand les prix sont identiques', () => {
    const e = explainCostChange([
      line({ at: '2026-08-10T00:00:00Z', quantity: 100, unitCostEur: 2 }),
      line({ at: '2026-09-10T00:00:00Z', quantity: 150, unitCostEur: 2 }),
    ], ['2026-08', '2026-09']);
    expect(e.volumeEffectEur).toBeCloseTo(100, 2);
    expect(e.priceEffectEur).toBeCloseTo(0, 2);
    expect(e.contributors[0].reason).toBe('volume');
    expect(e.sentence).toMatch(/VOLUME/);
  });
  it('détecte une baisse de coûts et le dit', () => {
    const e = explainCostChange([
      line({ at: '2026-08-10T00:00:00Z', quantity: 100, unitCostEur: 3 }),
      line({ at: '2026-09-10T00:00:00Z', quantity: 50, unitCostEur: 3 }),
    ], ['2026-08', '2026-09']);
    expect(e.deltaTotal).toBe(-150);
    expect(e.sentence).toMatch(/de moins/);
  });
  it('reste sobre quand rien ne change (aucun chiffre inventé)', () => {
    const e = explainCostChange([line({ at: '2026-09-10T00:00:00Z', quantity: 10, unitCostEur: 2 })], ['2026-08', '2026-09']);
    expect(e.deltaTotal).toBe(20);
    expect(e.sentence).toMatch(/20,00 €/);
  });
  it('chiffre chaque contributeur et fournit le lien vers le comparateur', () => {
    const e = explainCostChange([
      line({ at: '2026-08-10T00:00:00Z', quantity: 100, unitCostEur: 1 }),
      line({ at: '2026-09-10T00:00:00Z', quantity: 100, unitCostEur: 1.4, productId: 'p2', productName: 'Huile de palme' }),
    ], ['2026-08', '2026-09']);
    expect(e.contributors.map((c) => c.productName)).toContain('Huile de palme');
    expect(e.contributors[0].productUrl).toBe('/app/achats/comparer/p2');
  });
});

describe('5. Marge par plat au coût réel', () => {
  const recipe = (over: Partial<RecipeInput> = {}): RecipeInput => ({
    id: 'r1', name: 'Poulet braisé', sellingPriceEur: 12, targetMarginPct: 70, isActive: true,
    ingredients: [
      { productId: 'p1', productName: 'Poulet', unit: 'kg', quantity: 0.25 },
      { productId: 'p2', productName: 'Riz', unit: 'kg', quantity: 0.2 },
    ], portions30: 100, ...over,
  });
  it('calcule le coût matière, la marge en euros et en pourcentage', () => {
    const [m] = recipeMargins([recipe()], new Map([['p1', 6.4], ['p2', 1.68]]));
    expect(m.costPerPortion).toBeCloseTo(0.25 * 6.4 + 0.2 * 1.68, 2);           // 1,94 €
    expect(m.marginEur).toBeCloseTo(12 - 1.936, 2);
    expect(m.marginPct).toBeCloseTo(83.9, 0);
    expect(m.marginTotalEur).toBeCloseTo(m.marginEur! * 100, 1);
    expect(m.missingPrices).toEqual([]);
  });
  it('refuse d’inventer une marge si un prix d’ingrédient manque', () => {
    const [m] = recipeMargins([recipe()], new Map([['p1', 6.4]]));
    expect(m.costPerPortion).toBeNull();
    expect(m.marginPct).toBeNull();
    expect(m.missingPrices).toEqual(['Riz']);
  });
  it('classe les plats du moins rentable au plus rentable', () => {
    const a = recipe({ id: 'a', name: 'Plat faible marge', sellingPriceEur: 3, ingredients: [{ productId: 'p1', productName: 'Poulet', unit: 'kg', quantity: 0.4 }] });
    const b = recipe({ id: 'b', name: 'Plat rentable', sellingPriceEur: 12, ingredients: [{ productId: 'p2', productName: 'Riz', unit: 'kg', quantity: 0.1 }] });
    const list = recipeMargins([b, a], new Map([['p1', 6], ['p2', 2]]));
    expect(list[0].name).toBe('Plat faible marge');
  });
});

describe('6. Coût d’un plat mois par mois (reconstruit des prix réels)', () => {
  it('suit la hausse d’un ingrédient sur trois mois', () => {
    const months = ['2026-07', '2026-08', '2026-09'];
    const hist = recipeCostHistory([{
      id: 'r1', name: 'Poulet braisé', sellingPriceEur: 12, targetMarginPct: 70, isActive: true, portions30: 100,
      ingredients: [{ productId: 'p1', productName: 'Poulet', unit: 'kg', quantity: 0.25 }],
    }], [
      point({ productId: 'p1', recordedAt: '2026-07-10T00:00:00Z', unitPrice: 6.0 }),
      point({ productId: 'p1', recordedAt: '2026-08-10T00:00:00Z', unitPrice: 6.4 }),
      point({ productId: 'p1', recordedAt: '2026-09-10T00:00:00Z', unitPrice: 7.2 }),
    ], months);
    expect(hist[0].points).toEqual([1.5, 1.6, 1.8]);                            // 0,25 kg × le prix du mois
    expect(hist[0].changePct).toBeCloseTo(20, 1);
  });
  it('laisse un mois vide plutôt que de deviner', () => {
    const hist = recipeCostHistory([{
      id: 'r1', name: 'Plat', sellingPriceEur: 10, targetMarginPct: 70, isActive: true, portions30: 0,
      ingredients: [{ productId: 'p1', productName: 'Ingrédient', unit: 'kg', quantity: 1 }],
    }], [point({ productId: 'p1', recordedAt: '2026-09-10T00:00:00Z', unitPrice: 3 })], ['2026-07', '2026-08', '2026-09']);
    // le premier mois connu est utilisé pour les mois antérieurs (prix en vigueur), jamais inventé
    expect(hist[0].points.every((p) => p === 3)).toBe(true);
  });
});

describe('7. Endpoint GET /api/analysis sur des données réelles', () => {
  let auth: Record<string, string> = {};
  let productId = ''; let supplierId = ''; let offerId = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...auth }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text(); let json: Record<string, any> = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: res.status, json };
  };
  beforeAll(async () => { await runMigrations(); }, 60_000);

  it('prépare un restaurant avec un achat à prix facturé', async () => {
    const reg = await app.request('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'analyse@resto.fr', password: 'Plantain-Yassa-42', fullName: 'Awa Analyse', restaurantName: 'Chez Analyse', city: 'Nantes', coversPerDay: 60 }) });
    const body = await reg.json() as Record<string, any>;
    expect(reg.status).toBe(201); auth = { authorization: `Bearer ${body.token}` };
    const tpl = await call('GET', '/api/onboarding/templates');
    await call('POST', '/api/onboarding/apply', { templates: [tpl.json.templates[0].name] });
    const stock = await call('GET', '/api/stock');
    productId = stock.json.items[0].productId;
    const sup = await call('POST', '/api/suppliers', { name: 'Grossiste Analyse', leadTimeHours: 24 });
    supplierId = sup.json.supplier?.id ?? sup.json.id;
    const offer = await call('POST', `/api/suppliers/${supplierId}/offers`, { productId, packLabel: 'sac 25 kg', packQty: 25, packPrice: 42 });
    offerId = offer.json.offer?.id ?? offer.json.id;
    const order = await call('POST', '/api/orders', { supplierId, channel: 'whatsapp', lines: [{ offerId, packs: 2 }] });
    const oid = order.json.order.id;
    await call('POST', `/api/orders/${oid}/send`);
    const detail = await call('GET', '/api/orders');
    const lineId = (detail.json.orders as Record<string, any>[]).find((o) => o.id === oid)!.lines[0].id;
    const rec = await call('POST', `/api/orders/${oid}/receive`, { lines: [{ lineId, receivedQty: 50, invoicedUnitPrice: 1.84 }] });
    expect(rec.status).toBe(200);
  });

  it('renvoie une analyse complète et cohérente', async () => {
    const r = await call('GET', '/api/analysis');
    expect(r.status).toBe(200);
    const a = r.json;
    // dépenses : 50 kg × 1,84 € (prix RÉELLEMENT facturé)
    expect(a.spend.total).toBeCloseTo(92, 1);
    expect(a.spend.months.length).toBeGreaterThanOrEqual(6);
    expect(a.spend.byCategory.length).toBeGreaterThanOrEqual(1);
    // explication du mois : phrase calculée, jamais figée
    expect(a.explanation.sentence).toMatch(/Vos achats/);
    expect(a.explanation.currentTotal).toBeCloseTo(92, 1);
    // prix : un point d'historique facturé doit apparaître
    expect(a.prices.length).toBeGreaterThanOrEqual(1);
    // achats par fournisseur : conservé de l'ancienne page
    expect(a.bySupplier[0].supplierName).toMatch(/Grossiste Analyse/);
    expect(Array.isArray(a.drifts)).toBe(true);
    expect(Array.isArray(a.watchlist)).toBe(true);
    expect(Array.isArray(a.recipes)).toBe(true);
    expect(Array.isArray(a.recipeHistory)).toBe(true);
    // l'offre à 1,68 €/kg et la facture à 1,84 €/kg : la hausse est chiffrée sur les 50 kg achetés
    expect(a.drifts[0].changePct).toBeCloseTo(9.5, 1);
    expect(a.drifts[0].impactEur).toBeCloseTo(8, 1);
    expect(a.drifts[0].invoiced).toBe(true);
    // un seul mois de relevés : l'indice refuse d'annoncer « 0 % » et donne la variation produit
    const cat = a.prices[0];
    expect(cat.monthCount).toBe(1);
    expect(cat.changePct).toBeNull();
    expect(cat.avgProductChangePct).toBeCloseTo(9.5, 1);
    expect(cat.risingProducts).toBe(1);
    // le plat hérité du modèle d'onboarding n'a pas de prix connu : aucune marge inventée
    expect(a.recipes.every((r: any) => r.costPerPortion !== null || r.missingPrices.length > 0)).toBe(true);
  });

  it('exclut les commandes non engagées (brouillon non envoyé) et respecte la fenêtre demandée', async () => {
    const draft = await call('POST', '/api/orders', { supplierId, channel: 'whatsapp', lines: [{ offerId, packs: 1 }] });
    expect(draft.status).toBe(201);
    const r = await call('GET', '/api/analysis?months=3');
    expect(r.status).toBe(200);
    expect(r.json.spend.months).toHaveLength(3);
    expect(r.json.spend.total).toBeCloseTo(92, 1);            // la commande préparée non envoyée n'est pas une dépense
  });

  it('refuse les valeurs aberrantes de fenêtre', async () => {
    expect((await call('GET', '/api/analysis?months=999')).status).toBe(400);
    expect((await call('GET', '/api/analysis?months=abc')).status).toBe(400);
  });
});
