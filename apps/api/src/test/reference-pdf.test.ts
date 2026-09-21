process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.PGLITE_DIR = 'memory://refpdf'; process.env.ADMIN_EMAILS = 'admin@afrisupply.fr'; process.env.VENDOR_AUTO_APPROVE = 'true';
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
type Json = Record<string, any>;
const call = async (m: string, p: string, body?: unknown, h: Record<string, string> = {}) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: (await r.clone().json().catch(() => ({}))) as Json, raw: r }; };
const reg = async (email: string, name: string) => { const r = await call('POST', '/api/auth/register', { email, password: 'Plantain-Yassa-42', fullName: 'Test', restaurantName: name, city: 'Nantes' }); return { h: { Authorization: `Bearer ${r.json.token}` } }; };
let ADM: Record<string, string>; let V: Record<string, string>; let R: Record<string, string>;
beforeAll(async () => { await runMigrations(); ADM = (await reg('admin@afrisupply.fr', 'Admin')).h; V = (await reg('gros@x.fr', 'Gros')).h; R = (await reg('resto@x.fr', 'Resto PDF')).h; const t = await call('GET', '/api/onboarding/templates', undefined, R); await call('POST', '/api/onboarding/apply', { templates: t.json.templates.slice(0, 2).map((x: Json) => x.id ?? x.name) }, R); }, 60_000);

describe('admin référentiel (chantier 16)', () => {
  it('liste, création, doublon refusé, modification, demande grossiste', async () => {
    expect((await call('GET', '/api/admin/reference', undefined, R)).status).toBe(403);
    const l = await call('GET', '/api/admin/reference?q=riz', undefined, ADM); expect(l.status).toBe(200); expect(l.json.products.length).toBeGreaterThan(0);
    const req = await call('POST', '/api/reference/request', { product: 'Sauce arachide prête Dakatine', details: 'pot 1 kg' }, V); expect(req.status).toBe(201);
    const dup = await call('POST', '/api/reference/request', { product: 'Riz brisé' }, V); expect(dup.json.ok).toBe(false); expect(dup.json.existing.name).toBe('Riz brisé');
    const l2 = await call('GET', '/api/admin/reference', undefined, ADM); expect(l2.json.requests.length).toBe(1); const reqId = l2.json.requests[0].id;
    const c = await call('POST', `/api/admin/reference?request=${reqId}`, { name: 'Sauce arachide prête (Dakatine)', aliases: ['dakatine'], category: 'epicerie', baseUnit: 'kg', origin: 'Sénégal' }, ADM); expect(c.status).toBe(201);
    expect((await call('POST', '/api/admin/reference', { name: 'sauce arachide prête (dakatine)', category: 'epicerie', baseUnit: 'kg' }, ADM)).status).toBe(409);
    const u = await call('PUT', `/api/admin/reference/${c.json.product.id}`, { aliases: ['dakatine', 'pâte arachide sucrée'] }, ADM); expect(u.json.product.aliases.length).toBe(2);
    expect((await call('GET', '/api/admin/reference', undefined, ADM)).json.requests.length).toBe(0);
    const pc = await call('GET', '/api/public/catalog?q=dakatine'); expect(pc.json.items.some((x: Json) => x.id === c.json.product.id)).toBe(true);
  });
  it('fusion de doublon', async () => {
    const a = await call('POST', '/api/admin/reference', { name: 'Riz brisé thaï (doublon)', category: 'feculents', baseUnit: 'kg' }, ADM);
    const target = (await call('GET', '/api/public/catalog?q=riz brisé')).json.items.find((x: Json) => x.name === 'Riz brisé');
    await call('POST', '/api/vendor/register', { acceptCgv: true, name: 'Gros SA' }, V); const o = await call('POST', '/api/vendor/offers', { productId: a.json.product.id, packLabel: 'sac 25 kg', packQty: 25, packPrice: 30 }, V); expect(o.status).toBe(201);
    const m = await call('POST', `/api/admin/reference/${a.json.product.id}/merge`, { into: target.id }, ADM); expect(m.status).toBe(200);
    const pd = await call('GET', `/api/public/products/${target.id}`); expect(pd.json.offers.length).toBe(1); expect(pd.json.product.aliases).toContain('Riz brisé thaï (doublon)');
  });
});
describe('PDF bon de commande / livraison', () => {
  it('restaurant et grossiste téléchargent un PDF valide', async () => {
    const vid = (await call('GET', '/api/vendor/me', undefined, V)).json.vendors[0].id; const pid = (await call('GET', '/api/stock', undefined, R)).json.items[0].productId;
    const o = await call('POST', '/api/vendor/offers', { productId: pid, packLabel: 'carton 10 kg', packQty: 10, packPrice: 22.5 }, V);
    const ord = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: o.json.offer.id, packs: 3 }], notes: 'Livrer avant 10 h' }, R); expect(ord.status).toBe(201);
    const p1 = await call('GET', `/api/orders/${ord.json.order.id}/pdf`, undefined, R); expect(p1.status).toBe(200); expect(p1.raw.headers.get('content-type')).toBe('application/pdf'); const buf = Buffer.from(await p1.raw.arrayBuffer()); expect(buf.subarray(0, 5).toString()).toBe('%PDF-'); expect(buf.toString('latin1')).toContain('%%EOF'); expect(buf.length).toBeGreaterThan(1500);
    const p2 = await call('GET', `/api/vendor/orders/${ord.json.order.id}/pdf?type=livraison`, undefined, V); expect(p2.status).toBe(200); expect(p2.raw.headers.get('content-disposition')).toContain('bon_livraison');
    expect((await call('GET', `/api/vendor/orders/${ord.json.order.id}/pdf`, undefined, ADM)).status).not.toBe(200);
  });
});

describe('tableau de bord admin (chantier 17)', () => {
  it('agrégats complets, réservé admin', async () => {
    expect((await call('GET', '/api/admin/dashboard', undefined, R)).status).toBe(403);
    const d = await call('GET', '/api/admin/dashboard', undefined, ADM); expect(d.status).toBe(200);
    expect(d.json.restaurants.total).toBeGreaterThanOrEqual(3); expect(d.json.vendors.actif).toBe(1); expect(d.json.orders.mkt).toBe(1); expect(d.json.offers.productsCovered).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(d.json.weekly)).toBe(true); expect(d.json.topVendors[0].name).toBe('Gros SA'); expect(d.json.recentOrders.length).toBe(1); expect(d.json.env.adminEmails).toBe(true); expect(Array.isArray(d.json.todo)).toBe(true);
  });
});
