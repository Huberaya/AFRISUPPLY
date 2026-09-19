import { describe, it, expect, beforeAll } from 'vitest';
import { app } from '../app.js';
import { runMigrations } from '@afrisupply/db';
process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.PGLITE_DIR = 'memory://store'; process.env.ADMIN_EMAILS = 'admin@afrisupply.fr';
type Json = Record<string, any>;
const call = async (m: string, p: string, body?: unknown, h: Record<string, string> = {}) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: (await r.json().catch(() => ({}))) as Json }; };
const reg = async (email: string, name: string) => { const r = await call('POST', '/api/auth/register', { email, password: 'motdepasse1', fullName: 'Test', restaurantName: name, city: 'Nantes' }); return { h: { Authorization: `Bearer ${r.json.token}` } }; };
let R: Record<string, string>;
beforeAll(async () => { await runMigrations(); R = (await reg('vitrine@resto.fr', 'Resto Vitrine')).h; const t = await call('GET', '/api/onboarding/templates', undefined, R); await call('POST', '/api/onboarding/apply', { templates: t.json.templates.slice(0, 2).map((x: Json) => x.id ?? x.name) }, R); }, 60_000);

describe('vitrine publique', () => {
  it('catalogue sans token : produits du référentiel, prix null tant qu\'aucun grossiste', async () => {
    const r = await call('GET', '/api/public/catalog?q=riz'); expect(r.status).toBe(200); expect(r.json.items.length).toBeGreaterThan(0); expect(r.json.items[0].fromUnitPrice).toBeNull(); expect(r.json.origins.length).toBeGreaterThan(0);
  });
  it('fiche produit publique + alerte « prévenez-moi »', async () => {
    const id = (await call('GET', '/api/public/catalog?q=riz')).json.items[0].id;
    const r = await call('GET', `/api/public/products/${id}`); expect(r.status).toBe(200); expect(r.json.product.slug).toMatch(/riz/); expect(Array.isArray(r.json.offers)).toBe(true);
    const a = await call('POST', '/api/public/product-alert', { productId: id, email: 'chef@resto.fr' }); expect(a.status).toBe(201);
  });
  it('un grossiste actif fait apparaître un prix « à partir de »', async () => {
    const V = (await reg('gros@vitrine.fr', 'Grossiste')).h; const ADM = (await reg('admin@afrisupply.fr', 'Admin')).h;
    const v = await call('POST', '/api/vendor/register', { name: 'Sahel Distribution', city: 'Nantes', deliveryZones: ['Nantes'], categories: ['feculents'] }, V); expect([200, 201]).toContain(v.status);
    const act = await call('PUT', `/api/admin/vendors/${v.json.vendor?.id ?? v.json.id}`, { status: 'actif' }, ADM); expect(act.status).toBe(200);
    const id = (await call('GET', '/api/public/catalog?q=riz')).json.items[0].id;
    const o = await call('POST', '/api/vendor/offers', { productId: id, packLabel: 'sac 25 kg', packQty: 25, packPrice: 30 }, V); expect(o.status).toBe(201);
    const r = await call('GET', `/api/public/products/${id}`); expect(r.json.offers.length).toBe(1); expect(r.json.offers[0].unitPrice).toBe(1.2); const c = await call('GET', '/api/public/catalog?q=riz'); expect(c.json.withPrice).toBeGreaterThanOrEqual(1); expect(c.json.items[0].fromUnitPrice).toBe(1.2);
    const vs = await call('GET', '/api/public/vendors'); expect(vs.status).toBe(200);
  });
});
