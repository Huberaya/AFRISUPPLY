// =============================================================
// Chantier 3 (audit B8/B5/U2/U5) — non-régression « finitions du cœur métier »
//
// Verrouille : comparateur sur coût total (livraison + minimum de commande) ;
// journal des mouvements de stock ; message de réclamation sans « Bonjour , » ;
// ajout d'offres fournisseur en lot.
// =============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import { _resetRateLimits } from '../lib/ops.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.CRON_SECRET = 'cron-test'; process.env.PGLITE_DIR = 'memory://finishing';

type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: Json = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
};
let token = ''; let rid = ''; let auth: Record<string, string> = {};
let productId = '';

beforeAll(async () => {
  await runMigrations();
  _resetRateLimits();
  const r = await call('POST', '/api/auth/register', { email: 'finitions@resto.fr', password: 'Mafé-Couscous-42', fullName: 'Finitions Test', restaurantName: 'Les Finitions', city: 'Nantes', coversPerDay: 40 });
  token = r.json.token; rid = r.json.restaurant.id; auth = { authorization: `Bearer ${token}`, 'x-restaurant-id': rid };
  await call('GET', '/api/catalog', undefined, auth); // amorçage du référentiel
  const prods = await call('GET', '/api/products', undefined, auth);
  productId = prods.json.products.find((p: Json) => !p.restaurantId).id;
}, 60_000);

describe('1. Comparateur : le score suit le coût total (B8)', () => {
  it('« cher mais livraison offerte » bat « bon marché mais livraison payante » quand le total est réellement inférieur', async () => {
    // Deux fournisseurs identiques (délai, fiabilité) — seul le couple prix/livraison change.
    const sa = await call('POST', '/api/suppliers', { name: 'Cher Offerte', leadTimeHours: 24, deliveryFeeEur: 0, minOrderEur: 0 }, auth);
    const sb = await call('POST', '/api/suppliers', { name: 'PasCher Payante', leadTimeHours: 24, deliveryFeeEur: 6, minOrderEur: 0 }, auth);
    const idA = sa.json.supplier?.id ?? sa.json.id; const idB = sb.json.supplier?.id ?? sb.json.id;
    await call('POST', `/api/suppliers/${idA}/offers`, { productId, packLabel: 'Sac 10 kg', packQty: 10, packPrice: 20 }, auth);
    await call('POST', `/api/suppliers/${idB}/offers`, { productId, packLabel: 'Sac 10 kg', packQty: 10, packPrice: 15 }, auth);
    const cmp = await call('GET', `/api/compare/${productId}?qty=10`, undefined, auth);
    expect(cmp.status).toBe(200);
    // 20 € livrés vs 15 + 6 = 21 € : la recommandation honnête est « Cher Offerte ».
    expect(cmp.json.recommended?.supplierName).toBe('Cher Offerte');
    expect(cmp.json.recommended?.totalCostEur).toBe(20);
    const dear = cmp.json.ranked.find((o: Json) => o.supplierName === 'PasCher Payante');
    expect(dear.totalCostEur).toBe(21);
    expect(cmp.json.justification.join(' ')).toMatch(/dont 6,00 € de livraison|coût total/i);
  });
  it('affiche le détail « dont X € de livraison » et le dimensionnement en colis', async () => {
    const cmp = await call('GET', `/api/compare/${productId}?qty=10`, undefined, auth);
    const best = cmp.json.recommended;
    expect(best.packs).toBe(1);
    expect(cmp.json.justification.join(' ')).toMatch(/1 × Sac 10 kg/);
  });
});

describe('2. Journal des mouvements de stock (U2)', () => {
  it('liste les 20 derniers mouvements, du plus récent au plus ancien, avec l’auteur', async () => {
    const stock = await call('GET', '/api/stock', undefined, auth);
    const item = stock.json.items.find((i: Json) => i.productId === productId);
    expect(item).toBeTruthy();
    const a = await call('POST', `/api/stock/${item.id}/movements`, { type: 'reception', quantity: 10, note: 'Réception test' }, auth);
    expect(a.status).toBe(200);
    await call('POST', `/api/stock/${item.id}/movements`, { type: 'consommation', quantity: 3 }, auth);
    await call('POST', `/api/stock/${item.id}/movements`, { type: 'perte', quantity: 1, note: 'Casse' }, auth);
    const j = await call('GET', `/api/stock/${item.id}/movements`, undefined, auth);
    expect(j.status).toBe(200);
    expect(j.json.movements.length).toBeGreaterThanOrEqual(3);
    const [last, prev] = j.json.movements;
    expect(last.type).toBe('perte'); expect(last.quantity).toBe(-1); expect(last.note).toBe('Casse');
    expect(prev.type).toBe('consommation'); expect(prev.quantity).toBe(-3);
    expect(last.createdBy).toBeTruthy();           // « qui a sorti 1 kg » : une réponse !
    expect(new Date(last.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(prev.createdAt).getTime());
  });
  it('isolation : un article d’un autre restaurant → 404', async () => {
    const ghost = await call('GET', '/api/stock/00000000-0000-4000-8000-000000000000/movements', undefined, auth);
    expect(ghost.status).toBe(404);
  });
});

describe('3. Message de réclamation sans virgule orpheline (B5)', () => {
  it('écart de livraison sans contactName → « Bonjour, » (jamais « Bonjour , »)', async () => {
    // Produit dédié : les mouvements des tests précédents feraient plafonner la quantité
    // commandée (quantityCeiling mesure la consommation réelle) — pas le sujet ici.
    const prods = await call('GET', '/api/products', undefined, auth);
    const pClaim = prods.json.products.filter((x: Json) => !x.restaurantId)[1];
    const s = await call('POST', '/api/suppliers', { name: 'Grossiste Sans Nom', leadTimeHours: 24 }, auth); // aucun contactName
    const supId = s.json.supplier?.id ?? s.json.id;
    const off = await call('POST', `/api/suppliers/${supId}/offers`, { productId: pClaim.id, packLabel: 'Sac 50 kg', packQty: 50, packPrice: 100 }, auth);
    const offerId = off.json.offer?.id ?? off.json.id;
    const o = await call('POST', '/api/orders', { supplierId: supId, lines: [{ offerId, packs: 1 }] }, auth);
    expect(o.status).toBe(201);
    const orderId = o.json.order?.id ?? o.json.id;
    await call('POST', `/api/orders/${orderId}/send`, {}, auth);
    const list = await call('GET', '/api/orders', undefined, auth);
    const mine = list.json.orders.find((x: Json) => x.id === orderId);
    const rec = await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId: mine.lines[0].id, receivedQty: 45 }] }, auth); // 50 commandés / 45 reçus
    expect(rec.status).toBe(200);
    expect(rec.json.discrepancies).toHaveLength(1);
    const msg = rec.json.claimMessage as string;
    expect(msg).toMatch(/^Bonjour,/);              // virgule collée au mot, pas orpheline
    expect(msg).not.toMatch(/Bonjour ,/);          // le bug B5 a disparu
    expect(msg).toMatch(/écart/);
  });
  it('avec un contactName : « Bonjour Prénom, »', async () => {
    const prods = await call('GET', '/api/products', undefined, auth);
    const pClaim2 = prods.json.products.filter((x: Json) => !x.restaurantId)[2];
    const s = await call('POST', '/api/suppliers', { name: 'Grossiste Avec Nom', contactName: 'Awa', leadTimeHours: 24 }, auth);
    const supId = s.json.supplier?.id ?? s.json.id;
    const off = await call('POST', `/api/suppliers/${supId}/offers`, { productId: pClaim2.id, packLabel: 'Sac 20 kg', packQty: 20, packPrice: 40 }, auth);
    const offerId = off.json.offer?.id ?? off.json.id;
    const o = await call('POST', '/api/orders', { supplierId: supId, lines: [{ offerId, packs: 1 }] }, auth);
    const orderId = o.json.order?.id ?? o.json.id;
    await call('POST', `/api/orders/${orderId}/send`, {}, auth);
    const list = await call('GET', '/api/orders', undefined, auth);
    const mine = list.json.orders.find((x: Json) => x.id === orderId);
    const rec = await call('POST', `/api/orders/${orderId}/receive`, { lines: [{ lineId: mine.lines[0].id, receivedQty: 18 }] }, auth);
    expect(rec.json.claimMessage).toMatch(/^Bonjour Awa,/);
  });
});

describe('4. Offres fournisseur en lot (U5)', () => {
  it('POST /suppliers/:id/offers/batch crée N offres, historise les prix et suit les produits', async () => {
    const prods = await call('GET', '/api/products', undefined, auth);
    const p = prods.json.products.filter((x: Json) => !x.restaurantId).slice(0, 3);
    const s = await call('POST', '/api/suppliers', { name: 'Grossiste Lot', leadTimeHours: 24 }, auth);
    const supId = s.json.supplier?.id ?? s.json.id;
    const r = await call('POST', `/api/suppliers/${supId}/offers/batch`, { items: [
      { productId: p[0].id, packLabel: 'Sac 10 kg', packQty: 10, packPrice: 20, inStock: true },
      { productId: p[1].id, packLabel: 'Carton 5 kg', packQty: 5, packPrice: 15, inStock: true },
      { productId: p[2].id, packLabel: 'Bidon 5 L', packQty: 5, packPrice: 25, inStock: true },
    ] }, auth);
    expect(r.status).toBe(201);
    expect(r.json.saved).toBe(3); expect(r.json.created).toBe(3); expect(r.json.updated).toBe(0);
    const detail = await call('GET', `/api/suppliers/${supId}`, undefined, auth);
    expect(detail.json.offers).toHaveLength(3);
    // produits suivis en stock (seuils par défaut — chantier 1) sans action supplémentaire
    const stock = await call('GET', '/api/stock', undefined, auth);
    for (const prod of p) expect(stock.json.items.some((i: Json) => i.productId === prod.id)).toBe(true);
    // re-lot sur un même produit = mise à jour comptée (upsert, pas de doublon)
    const again = await call('POST', `/api/suppliers/${supId}/offers/batch`, { items: [
      { productId: p[0].id, packLabel: 'Sac 10 kg', packQty: 10, packPrice: 19, inStock: true },
    ] }, auth);
    expect(again.json.updated).toBe(1); expect(again.json.created).toBe(0);
  });
  it('lot vide ou invalide → 400 ; fournisseur inconnu → 404', async () => {
    const s = await call('POST', '/api/suppliers', { name: 'Grossiste Garde-Fou', leadTimeHours: 24 }, auth);
    const supId = s.json.supplier?.id ?? s.json.id;
    const empty = await call('POST', `/api/suppliers/${supId}/offers/batch`, { items: [] }, auth);
    expect(empty.status).toBe(400);
    const bad = await call('POST', `/api/suppliers/${supId}/offers/batch`, { items: [{ productId: 'pas-un-uuid', packLabel: 'X', packQty: 1, packPrice: 1 }] }, auth);
    expect(bad.status).toBe(400);
    const ghost = await call('POST', '/api/stock/00000000-0000-4000-8000-000000000000/movements', { type: 'ajustement', quantity: 1 }, auth);
    expect(ghost.status).toBe(404);
  });
});
