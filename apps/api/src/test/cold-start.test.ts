// =============================================================
// Chantier 1 (audit) — non-régression « démarrage à froid »
//
// Scénario exact du bug : un compte neuf reçoit 31 alertes « rupture »
// mais la prévision répond « rien à commander » et le panier intelligent
// reste vide. Ces tests verrouillent le comportement corrigé :
//   inscription → onboarding → seuils par défaut > 0
//   → forecast recommande dès le premier jour (repli objectif)
//   → smart-cart propose des lignes dès que des offres existent
//   → l'IA ne dit JAMAIS « rien d'urgent » quand du stock est à sec.
// =============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import { _resetRateLimits } from '../lib/ops.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.CRON_SECRET = 'cron-test'; process.env.PGLITE_DIR = 'memory://cold-start';

type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: Json = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
};
let token = ''; let rid = ''; let auth: Record<string, string> = {};
let productId = ''; let itemId = '';

beforeAll(async () => {
  await runMigrations();
  _resetRateLimits();
  const r = await call('POST', '/api/auth/register', { email: 'neuf@resto.fr', password: 'Plantain-Yassa-42', fullName: 'Neuf Test', restaurantName: 'Le Tout Neuf', city: 'Nantes', coversPerDay: 40 });
  expect(r.status).toBe(201);
  token = r.json.token; rid = r.json.restaurant.id; auth = { authorization: `Bearer ${token}`, 'x-restaurant-id': rid };
}, 60_000);

describe('1. L’onboarding crée des seuils explicites (jamais 0/0)', () => {
  it('applique des recettes types et renvoie les articles avec seuils et objectifs', async () => {
    const t = await call('GET', '/api/onboarding/templates', undefined, auth);
    const ids = t.json.templates.slice(0, 3).map((x: Json) => x.name);
    const a = await call('POST', '/api/onboarding/apply', { templates: ids }, auth);
    expect(a.status).toBeLessThan(300);
    expect(a.json.items.length).toBeGreaterThan(3);
    for (const it of a.json.items) {
      expect(it.criticalLevel).toBeGreaterThan(0);   // le cœur du bug : critique à zéro
      expect(it.targetLevel).toBeGreaterThan(0);     // → prévision muette
    }
    itemId = a.json.items[0].id; productId = a.json.items[0].productId;
  });
});

describe('2. La prévision parle dès le premier jour', () => {
  it('recommande une quantité (repli objectif) avec une explication sans « pic » inventé', async () => {
    const f = await call('GET', '/api/forecast', undefined, auth);
    expect(f.status).toBe(200);
    const recos = f.json.products.filter((p: Json) => p.recommendedOrder > 0);
    expect(recos.length).toBeGreaterThan(0);                       // plus jamais « 0 produit à commander »
    for (const p of f.json.products) expect(p.explanation).not.toMatch(/pic (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/);
    const mine = f.json.products.find((p: Json) => p.productId === productId);
    expect(mine.recommendedOrder).toBeGreaterThan(0);
    expect(mine.explanation).toMatch(/Pas encore assez de ventes|aucune recette/i);
  });
});

describe('3. Le panier intelligent n’est plus muet', () => {
  it('propose des lignes dès qu’une offre existe pour un produit recommandé', async () => {
    const s = await call('POST', '/api/suppliers', { name: 'Grossiste Neuf', whatsapp: '+33600000002', leadTimeHours: 24 }, auth);
    const supId = s.json.supplier?.id ?? s.json.id;
    const off = await call('POST', `/api/suppliers/${supId}/offers`, { productId, packLabel: 'sac 10 kg', packQty: 10, packPrice: 30 }, auth);
    expect(off.status).toBeLessThan(300);
    const cart = await call('GET', '/api/smart-cart', undefined, auth);
    expect(cart.status).toBe(200);
    expect(cart.json.suppliers.length).toBeGreaterThan(0);
    expect(cart.json.suppliers[0].lines.length).toBeGreaterThan(0);
    expect(cart.json.total).toBeGreaterThan(0);
  });
});

describe('4. L’IA reste cohérente avec le stock réel', () => {
  it('« que dois-je commander ? » ne répond jamais « rien d’urgent » avec du stock à sec', async () => {
    const q = await call('POST', '/api/assistant/ask', { question: 'Que dois-je commander cette semaine ?' }, auth);
    expect(q.status).toBe(200);
    expect(q.json.answer).not.toMatch(/rien d’urgent|rien d'urgent/);
    expect(q.json.answer).toMatch(/commander|Commande/);
  });
  it('« quelles ruptures arrivent ? » ne nie pas les produits déjà à zéro', async () => {
    const q = await call('POST', '/api/assistant/ask', { question: 'Quels produits risquent d’être en rupture ?' }, auth);
    expect(q.status).toBe(200);
    expect(q.json.answer).not.toMatch(/Aucune rupture prévue/);   // le stock est à zéro partout
    expect(q.json.answer).toMatch(/à sec|rupture/i);
  });
});

describe('5. Réglage en lot des seuils (étape onboarding)', () => {
  it('POST /stock/thresholds met à jour les seuils d’un coup', async () => {
    const r = await call('POST', '/api/stock/thresholds', { items: [{ itemId, criticalLevel: 7, targetLevel: 21 }] }, auth);
    expect(r.status).toBe(200); expect(r.json.updated).toBe(1);
    const s = await call('GET', '/api/stock', undefined, auth);
    const item = s.json.items.find((i: Json) => i.id === itemId);
    expect(Number(item.criticalLevel)).toBe(7);
  });
  it('refuse une saisie invalide et ignore les articles d’un autre restaurant', async () => {
    const bad = await call('POST', '/api/stock/thresholds', { items: [{ itemId: 'pas-un-uuid', criticalLevel: 1 }] }, auth);
    expect(bad.status).toBe(400);
    const ghost = await call('POST', '/api/stock/thresholds', { items: [{ itemId: '00000000-0000-4000-8000-000000000000', criticalLevel: 1 }] }, auth);
    expect(ghost.status).toBe(200); expect(ghost.json.updated).toBe(0);   // isolation : rien touché
  });
});

describe('6. Seuils par défaut sur les autres chemins de tracking', () => {
  it('un produit suivi via /catalog/track naît avec des seuils', async () => {
    const prods = await call('GET', '/api/products', undefined, auth);
    const other = prods.json.products.find((p: Json) => !p.restaurantId && p.id !== productId);
    const t = await call('POST', '/api/catalog/track', { productIds: [other.id] }, auth);
    expect(t.status).toBe(200);
    expect(t.json.items[0].criticalLevel).toBeGreaterThan(0);
  });
  it('une réception de produit non suivi le crée avec des seuils (jamais 0/0)', async () => {
    const prods = await call('GET', '/api/products', undefined, auth);
    const fresh = prods.json.products.find((p: Json) => !p.restaurantId && p.id !== productId);
    const s = await call('POST', '/api/suppliers', { name: 'Fournisseur Réception', leadTimeHours: 24 }, auth);
    const supId = s.json.supplier?.id ?? s.json.id;
    const off = await call('POST', `/api/suppliers/${supId}/offers`, { productId: fresh.id, packLabel: 'carton 5', packQty: 5, packPrice: 12 }, auth);
    const offerId = off.json.offer?.id ?? off.json.id;
    const o = await call('POST', '/api/orders', { supplierId: supId, lines: [{ offerId, packs: 1 }] }, auth);
    const orderId = o.json.order?.id ?? o.json.id;
    const list = await call('GET', '/api/orders', undefined, auth);
    const mine = list.json.orders.find((x: Json) => x.id === orderId);
    await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId: mine.lines[0].id, receivedQty: 5 }] }, auth);
    const stock = await call('GET', '/api/stock', undefined, auth);
    const item = stock.json.items.find((i: Json) => i.productId === fresh.id);
    expect(item).toBeTruthy();
    expect(Number(item.criticalLevel)).toBeGreaterThan(0);
  });
});
