// Marketplace B2B de bout en bout : fournisseur s'inscrit → admin valide → catalogue → restaurant le voit, le lie,
// commande → fournisseur confirme (commission) → achat groupé atteint → commandes créées.
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.PGLITE_DIR = 'memory://mkt'; process.env.ADMIN_EMAILS = 'admin@afrisupply.fr';
type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: Json = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
};
const reg = async (email: string, restaurantName: string, city = 'Nantes') => { const r = await call('POST', '/api/auth/register', { email, password: 'motdepasse1', fullName: 'Test', restaurantName, city }); return { h: { authorization: `Bearer ${r.json.token}` }, rid: r.json.restaurant.id as string }; };

let V: Record<string, string>; let R1: { h: Record<string, string>; rid: string }; let R2: typeof R1; let ADM: Record<string, string>; let vendorId = ''; let offerId = ''; let productId = ''; let orderId = ''; let gbId = '';
beforeAll(async () => {
  await runMigrations();
  V = (await reg('grossiste@sahel.fr', 'compte grossiste')).h; // le grossiste a aussi un « restaurant » vide : non gênant
  R1 = await reg('r1@resto.fr', 'Resto Un'); R2 = await reg('r2@resto.fr', 'Resto Deux'); ADM = (await reg('admin@afrisupply.fr', 'Admin')).h;
  await call('POST', '/api/onboarding/apply', { templates: ['Mafé bœuf', 'Yassa poulet'] }, R1.h);
  const t = await call('GET', '/api/onboarding/templates', undefined, R1.h); await call('POST', '/api/onboarding/apply', { templates: t.json.templates.slice(0, 2).map((x: Json) => x.id ?? x.name) }, R1.h);
  await call('POST', '/api/onboarding/apply', { templates: t.json.templates.slice(0, 2).map((x: Json) => x.id ?? x.name) }, R2.h);
  productId = (await call('GET', '/api/stock', undefined, R1.h)).json.items[0].productId;
}, 60_000);

describe('marketplace', () => {
  it('inscription fournisseur → en attente → invisible des restaurants → validé par admin', async () => {
    const r = await call('POST', '/api/vendor/register', { name: 'Sahel Grossiste', city: 'Nantes', deliveryZones: ['nantes', '44'], categories: ['epicerie', 'feculents'], minOrderEur: 50, contactEmail: 'commandes@sahel.fr' }, V);
    expect(r.status).toBe(201); expect(r.json.vendor.status).toBe('en_attente'); vendorId = r.json.vendor.id;
    expect((await call('GET', '/api/marketplace/vendors', undefined, R1.h)).json.vendors.length).toBe(0);
    expect((await call('GET', '/api/admin/vendors', undefined, R1.h)).status).toBe(403);
    const a = await call('PUT', `/api/admin/vendors/${vendorId}`, { status: 'actif', commissionPct: 4 }, ADM); expect(a.status).toBe(200); expect(a.json.vendor.status).toBe('actif');
  });
  it('catalogue : offre sur un produit du référentiel, import CSV par nom, refus produit privé', async () => {
    const o = await call('POST', '/api/vendor/offers', { productId, packLabel: 'sac 25 kg', packQty: 25, packPrice: 30 }, V); expect(o.status).toBe(201); offerId = o.json.offer.id;
    const imp = await call('POST', '/api/vendor/offers/import', { rows: [{ product: 'Huile de palme rouge', packLabel: 'bidon 5 L', packQty: 5, packPrice: 21 }, { product: 'Produit inconnu XYZ', packLabel: 'x', packQty: 1, packPrice: 1 }] }, V);
    expect(imp.json.imported).toBe(1); expect(imp.json.unknown).toEqual(['Produit inconnu XYZ']);
    expect((await call('GET', '/api/vendor/offers', undefined, V)).json.offers.length).toBe(2);
  });
  it('un restaurant de Nantes le voit (pas un restaurant de Lyon), le lie → fournisseur privé + prix importés', async () => {
    const lyon = await reg('lyon@resto.fr', 'Resto Lyon', 'Lyon');
    expect((await call('GET', '/api/marketplace/vendors', undefined, lyon.h)).json.vendors.length).toBe(0);
    const list = await call('GET', '/api/marketplace/vendors', undefined, R1.h); expect(list.json.vendors.length).toBe(1); expect(list.json.vendors[0].coversMyProducts).toBeGreaterThanOrEqual(1);
    const det = await call('GET', `/api/marketplace/vendors/${vendorId}`, undefined, R1.h); expect(det.json.offers.find((o: Json) => o.id === offerId).unitPrice).toBe(1.2);
    const link = await call('POST', `/api/marketplace/vendors/${vendorId}/link`, {}, R1.h); expect(link.status).toBe(200); expect(link.json.offersSynced).toBe(2);
    const sups = await call('GET', '/api/suppliers', undefined, R1.h); const s = sups.json.suppliers.find((x: Json) => x.id === link.json.supplierId); expect(s.name).toBe('Sahel Grossiste'); expect(s.offerCount).toBe(2);
  });
  it('commande plateforme : minimum respecté, statut envoyée, visible côté fournisseur, confirmation → commission 4 %', async () => {
    expect((await call('POST', `/api/marketplace/vendors/${vendorId}/orders`, { lines: [{ vendorOfferId: offerId, packs: 1 }] }, R1.h)).status).toBe(400); // 30 € < min 50 €
    const o = await call('POST', `/api/marketplace/vendors/${vendorId}/orders`, { lines: [{ vendorOfferId: offerId, packs: 2 }] }, R1.h); expect(o.status).toBe(201); expect(o.json.order.status).toBe('envoyee'); orderId = o.json.order.id;
    const inbox = await call('GET', '/api/vendor/orders?status=envoyee', undefined, V); expect(inbox.json.orders.length).toBe(1); expect(inbox.json.orders[0].restaurantName).toBe('Resto Un'); expect(inbox.json.orders[0].lines[0].packs).toBe(2);
    expect((await call('POST', `/api/vendor/orders/${orderId}/confirm`, {}, R1.h)).status).toBe(403); // le restaurant n'a pas d'espace fournisseur
    const conf = await call('POST', `/api/vendor/orders/${orderId}/confirm`, { expectedAt: '2026-09-22', note: 'Livraison mardi matin' }, V); expect(conf.status).toBe(200); expect(conf.json.order.status).toBe('confirmee'); expect(conf.json.commission).toBe(2.4);
    expect((await call('POST', `/api/vendor/orders/${orderId}/confirm`, {}, V)).status).toBe(400); // déjà confirmée
    const mine = await call('GET', '/api/orders', undefined, R1.h); expect(mine.json.orders.find((x: Json) => x.id === orderId).status).toBe('confirmee');
    const dash = await call('GET', '/api/vendor/dashboard', undefined, V); expect(dash.json.stats).toMatchObject({ confirmedOrders: 1, monthRevenue: 60, commissionThisMonth: 2.4, restaurantsFollowing: 1 });
    expect((await call('GET', '/api/vendor/commissions', undefined, V)).json.periods[0]).toMatchObject({ orders: 1, base: 60, amount: 2.4 });
  });
  it('achat groupé : 2 restaurants atteignent le palier → clôture crée 2 commandes remisées + commissions', async () => {
    const gb = await call('POST', '/api/vendor/group-buys', { vendorOfferId: offerId, zone: 'Nantes', targetPacks: 10, discountPct: 12, closesInDays: 5 }, V); expect(gb.status).toBe(201); gbId = gb.json.groupBuy.id;
    const list = await call('GET', '/api/marketplace/group-buys', undefined, R2.h); expect(list.json.groupBuys[0]).toMatchObject({ id: gbId, discountedPackPrice: 26.4, committedPacks: 0 });
    expect((await call('POST', `/api/marketplace/group-buys/${gbId}/join`, { packs: 6 }, R1.h)).json.reached).toBe(false);
    const j2 = await call('POST', `/api/marketplace/group-buys/${gbId}/join`, { packs: 5 }, R2.h); expect(j2.json).toMatchObject({ committedPacks: 11, reached: true });
    const close = await call('POST', `/api/vendor/group-buys/${gbId}/close`, {}, V); expect(close.json).toMatchObject({ status: 'cloture', committed: 11, ordersCreated: 2 });
    const r2orders = await call('GET', '/api/orders', undefined, R2.h); const o = r2orders.json.orders.find((x: Json) => x.source === 'achat_groupe'); expect(o.status).toBe('confirmee'); expect(Number(o.totalEur)).toBe(132); // 5 × 26,40
    expect((await call('GET', '/api/suppliers', undefined, R2.h)).json.suppliers.some((s: Json) => s.name === 'Sahel Grossiste')).toBe(true); // lié automatiquement
    expect((await call('GET', '/api/vendor/commissions', undefined, V)).json.periods[0].orders).toBe(3);
  });
  it('refus d’une commande → annulée avec motif ; achat groupé non atteint → annulé', async () => {
    const o = await call('POST', `/api/marketplace/vendors/${vendorId}/orders`, { lines: [{ vendorOfferId: offerId, packs: 3 }] }, R2.h);
    const ref = await call('POST', `/api/vendor/orders/${o.json.order.id}/refuse`, { reason: 'Rupture jusqu’à lundi' }, V); expect(ref.json.order.status).toBe('annulee'); expect(ref.json.order.vendorNote).toMatch(/Rupture/);
    const gb = await call('POST', '/api/vendor/group-buys', { vendorOfferId: offerId, zone: 'Nantes', targetPacks: 100, discountPct: 20 }, V);
    await call('POST', `/api/marketplace/group-buys/${gb.json.groupBuy.id}/join`, { packs: 2 }, R1.h);
    expect((await call('POST', `/api/vendor/group-buys/${gb.json.groupBuy.id}/close`, {}, V)).json.status).toBe('annule');
  });
});
