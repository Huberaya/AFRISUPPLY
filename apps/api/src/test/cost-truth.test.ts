// =============================================================
// Chantier 2 (audit B3/U4) — non-régression « la vérité des coûts »
//
// Bug d'origine : coût « 0,00 € » et marge « 100 % » affichés comme vrais sans
// cotations, l'IA annonce « te coûte 0,00 € », et la page Analyse promettait des
// marges dans le temps qu'elle n'affichait pas. Ces tests verrouillent :
//   coût « ≥ X € » + marge masquée si incomplet · IA : pas de chiffre si > 30 % inconnu
//   · GET /analysis/margins (courbe de marge par plat + indice de prix par catégorie).
// =============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import { _resetRateLimits } from '../lib/ops.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.CRON_SECRET = 'cron-test'; process.env.PGLITE_DIR = 'memory://cost-truth';

type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: Json = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
};
let token = ''; let rid = ''; let auth: Record<string, string> = {};
const products: Json[] = [];   // 4 produits catalogue
let recipeA = ''; let recipeB = '';

beforeAll(async () => {
  await runMigrations();
  _resetRateLimits();
  const r = await call('POST', '/api/auth/register', { email: 'couts@resto.fr', password: 'Yassa-Poulet-42', fullName: 'Coûts Test', restaurantName: 'La Vérité des Coûts', city: 'Nantes', coversPerDay: 60 });
  token = r.json.token; rid = r.json.restaurant.id; auth = { authorization: `Bearer ${token}`, 'x-restaurant-id': rid };
  await call('GET', '/api/catalog', undefined, auth); // amorçage du référentiel produits (ensureReference)
  const prods = await call('GET', '/api/products', undefined, auth);
  products.push(...prods.json.products.filter((p: Json) => !p.restaurantId).slice(0, 4));
  expect(products.length).toBe(4);
}, 60_000);

describe('1. Coût incomplet : « ≥ X € » et marge masquée (jamais 0,00 € ni 100 %)', () => {
  it('recette sans aucune cotation : costStatus incomplet, marge à calculer', async () => {
    const r = await call('POST', '/api/recipes', { name: 'Plat Test Coût', sellingPriceEur: 10, targetMarginPct: 60, ingredients: [{ productId: products[0].id, quantity: 1 }, { productId: products[1].id, quantity: 1 }] }, auth);
    expect(r.status).toBeLessThan(300); recipeA = r.json.id;
    const g = await call('GET', '/api/recipes', undefined, auth);
    const mine = g.json.recipes.find((x: Json) => x.id === recipeA);
    expect(mine.costStatus).toBe('incomplet');
    expect(mine.unpriced).toHaveLength(2);
    expect(mine.cost).toBe(0);                    // valeur brute pour le calcul…
    expect(mine.marginPct).toBeNull();            // …mais la marge est masquée
    expect(mine.grossMargin).toBeNull();
    expect(mine.suggestedPrice).toBeNull();       // plus de « prix conseillé » calculé sur du vent
  });
});

describe('2. L\'IA ne présente plus 0,00 € comme un vrai coût', () => {
  it('plus de 30 % du coût inconnu ⇒ elle refuse de chiffrer (et ne dit jamais « te coûte 0,00 € »)', async () => {
    const q = await call('POST', '/api/assistant/ask', { question: 'Combien me coûte mon Plat Test Coût ?' }, auth);
    expect(q.status).toBe(200);
    expect(q.json.answer).not.toMatch(/0,00 €/);
    expect(q.json.answer).not.toMatch(/te coûte \*\*0/);
    expect(q.json.answer).toMatch(/plus de 30 % du coût est inconnu/);
    expect(q.json.answer).toMatch(/sans prix/);
  });
  it('« faut-il augmenter le prix ? » refuse tant que le coût est incomplet', async () => {
    const q = await call('POST', '/api/assistant/ask', { question: 'Dois-je augmenter le prix de vente du Plat Test Coût ?' }, auth);
    expect(q.status).toBe(200);
    expect(q.json.answer).toMatch(/à calculer|sans prix/);
    expect(q.json.answer).not.toMatch(/Prix conseillé/);
  });
});

describe('3. Des prix arrivent : le coût devient annonçable, la marge apparaît', () => {
  it('offres fournisseurs → coût complet chiffré et marge visible', async () => {
    const s = await call('POST', '/api/suppliers', { name: 'Grossiste Coûts', leadTimeHours: 24 }, auth);
    const supId = s.json.supplier?.id ?? s.json.id;
    await call('POST', `/api/suppliers/${supId}/offers`, { productId: products[0].id, packLabel: 'sac 10 kg', packQty: 10, packPrice: 20 }, auth); // 2 €/kg
    await call('POST', `/api/suppliers/${supId}/offers`, { productId: products[1].id, packLabel: 'sac 10 kg', packQty: 10, packPrice: 30 }, auth); // 3 €/kg
    const g = await call('GET', '/api/recipes', undefined, auth);
    const mine = g.json.recipes.find((x: Json) => x.id === recipeA);
    expect(mine.costStatus).toBe('complet');
    expect(mine.cost).toBe(5);                    // 1×2 + 1×3
    expect(mine.marginPct).toBe(50);              // (10 − 5) / 10 — enfin la vraie marge
    expect(mine.grossMargin).toBe(5);
    const q = await call('POST', '/api/assistant/ask', { question: 'Combien me coûte mon Plat Test Coût ?' }, auth);
    expect(q.json.answer).toMatch(/te coûte \*\*5,00 €\*\*/);
    expect(q.json.answer).not.toMatch(/au moins/);   // coût complet : pas de « au moins »
  });
  it('coût partiel fiable (≤ 30 % inconnu) : l\'IA dit « au moins » et masque la marge', async () => {
    const s = await call('POST', '/api/suppliers', { name: 'Grossiste Bis', leadTimeHours: 24 }, auth);
    const supId = s.json.supplier?.id ?? s.json.id;
    await call('POST', `/api/suppliers/${supId}/offers`, { productId: products[3].id, packLabel: 'carton 2 kg', packQty: 2, packPrice: 6 }, auth); // 3 €/kg
    // Plat B = 4 ingrédients dont products[2] resté sans prix → 25 % inconnu → fiable mais incomplet
    const r = await call('POST', '/api/recipes', {
      name: 'Plat B Recette', sellingPriceEur: 20, targetMarginPct: 60,
      ingredients: [{ productId: products[0].id, quantity: 1 }, { productId: products[1].id, quantity: 1 }, { productId: products[2].id, quantity: 1 }, { productId: products[3].id, quantity: 1 }],
    }, auth);
    recipeB = r.json.id;
    const g = await call('GET', '/api/recipes', undefined, auth);
    const mine = g.json.recipes.find((x: Json) => x.id === recipeB);
    expect(mine.costStatus).toBe('incomplet');
    expect(mine.coverage).toBe(0.75);
    expect(mine.cost).toBe(8);                   // 2 + 3 + 3 (sans products[2])
    expect(mine.marginPct).toBeNull();           // marge masquée malgré le coût fiable
    const q = await call('POST', '/api/assistant/ask', { question: 'Combien me coûte mon Plat B Recette ?' }, auth);
    expect(q.json.answer).toMatch(/au moins 8,00 €/);
    expect(q.json.answer).toMatch(/marge reste à calculer/);
    expect(q.json.answer).not.toMatch(/te coûte \*\*8/);   // jamais présenté comme LE coût
  });
});

describe('4. GET /analysis/margins : la promesse de la page Analyse est tenue', () => {
  it('courbe de marge par plat + indice de prix par catégorie, fenêtre 6 mois', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await call('POST', '/api/sales', { day: today, lines: [{ recipeId: recipeA, portions: 5 }], decrementStock: false }, auth);
    const m = await call('GET', '/api/analysis/margins?months=6', undefined, auth);
    expect(m.status).toBe(200);
    expect(m.json.months).toHaveLength(6);
    const dishA = m.json.dishes.find((d: Json) => d.recipeId === recipeA);
    expect(dishA.status).toBe('complet');
    expect(dishA.portionsSold).toBe(5);
    expect(dishA.revenueEur).toBe(50);
    // mois courant : coût 5 € (prix des offres historisés) → marge 50 %
    const cur = dishA.points[dishA.points.length - 1];
    expect(cur.month).toBe(today.slice(0, 7));
    expect(cur.costPerPortion).toBe(5);
    expect(cur.marginPct).toBe(50);
    expect(cur.portionsSold).toBe(5);
    // les mois précédant la première cotation restent à null (trous honnêtes)
    expect(dishA.points.slice(0, -1).every((p: Json) => p.costPerPortion === null)).toBe(true);
    // indice de prix : au moins une catégorie avec base 100 au mois des offres
    const withData = m.json.priceIndex.filter((c: Json) => c.points.some((p: Json) => p.index !== null));
    expect(withData.length).toBeGreaterThan(0);
    const curIdx = withData[0].points[withData[0].points.length - 1];
    expect(curIdx.index).toBe(100);              // un seul mois de données ⇒ base 100
    // plat B marqué partiel
    const dishB = m.json.dishes.find((d: Json) => d.recipeId === recipeB);
    expect(dishB.status).toBe('incomplet');
  });
  it('fenêtre 3/12 mois respectée, valeurs hors bornes ramenées', async () => {
    const m3 = await call('GET', '/api/analysis/margins?months=3', undefined, auth);
    expect(m3.json.months).toHaveLength(3);
    const m12 = await call('GET', '/api/analysis/margins?months=12', undefined, auth);
    expect(m12.json.months).toHaveLength(12);
    const mBig = await call('GET', '/api/analysis/margins?months=99', undefined, auth);
    expect(mBig.json.months).toHaveLength(12);   // cap à 12
  });
});
