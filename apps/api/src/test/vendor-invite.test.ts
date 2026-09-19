process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.PGLITE_DIR = 'memory://invite'; process.env.ADMIN_EMAILS = 'admin@afrisupply.fr'; process.env.APP_URL = 'https://afrisupply.test';
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
type Json = Record<string, any>;
const call = async (m: string, p: string, body?: unknown, h: Record<string, string> = {}) => { const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: (await r.json().catch(() => ({}))) as Json }; };
const reg = async (email: string, name: string) => { const r = await call('POST', '/api/auth/register', { email, password: 'motdepasse1', fullName: 'Test', restaurantName: name, city: 'Nantes' }); return { h: { Authorization: `Bearer ${r.json.token}` } }; };
let ADM: Record<string, string>; let pid: string;
beforeAll(async () => { await runMigrations(); ADM = (await reg('admin@afrisupply.fr', 'Admin')).h; const p = await call('POST', '/api/admin/prospects', { kind: 'fournisseur', name: 'Exofoods Rungis', city: 'Rungis', phone: '0146870000', contactName: 'M. Diallo' }, ADM); pid = p.json.prospect?.id ?? p.json.id; }, 60_000);

describe('invitation fournisseur (chantier 14)', () => {
  let url: string;
  it('admin génère un lien pré-rempli (sans e-mail → WhatsApp)', async () => {
    const r = await call('POST', `/api/admin/prospects/${pid}/invite-vendor`, {}, ADM); expect(r.status).toBe(200); expect(r.json.url).toMatch(/afrisupply\.test\/fournisseur\?invite=/); expect(r.json.whatsapp).toContain('Exofoods Rungis'); expect(r.json.sent).toBe(false); url = r.json.url;
    const p = await call('GET', `/api/admin/prospects?kind=fournisseur&q=Exofoods`, undefined, ADM); expect(p.json.prospects[0].status).toBe('contacte');
  });
  it('lecture publique de l\'invitation', async () => {
    const token = url.split('invite=')[1]; const r = await call('GET', `/api/public/vendor-invite/${token}`); expect(r.status).toBe(200); expect(r.json.invite.name).toBe('Exofoods Rungis'); expect(r.json.invite.city).toBe('Rungis'); expect(r.json.invite.converted).toBe(false);
    expect((await call('GET', '/api/public/vendor-invite/abc')).status).toBe(404);
  });
  it('le grossiste invité crée son espace → actif immédiatement, prospect converti', async () => {
    const token = url.split('invite=')[1]; const V = (await reg('diallo@exofoods.fr', 'Exofoods Rungis')).h;
    const r = await call('POST', '/api/vendor/register', { name: 'Exofoods Rungis', city: 'Rungis', deliveryZones: ['94', 'Paris'], categories: ['frais'], invite: token }, V); expect(r.status).toBe(201); expect(r.json.vendor.status).toBe('actif');
    const p = await call('GET', `/api/admin/prospects?kind=fournisseur&q=Exofoods`, undefined, ADM); expect(p.json.prospects[0].status).toBe('converti'); expect(p.json.prospects[0].email).toBe('diallo@exofoods.fr');
    expect((await call('GET', `/api/public/vendor-invite/${token}`)).json.invite.converted).toBe(true);
    const vs = await call('GET', '/api/public/vendors'); expect(vs.json.vendors.some((v: Json) => v.name === 'Exofoods Rungis')).toBe(true);
  });
  it('sans invitation : en_attente', async () => {
    const V = (await reg('autre@gros.fr', 'Autre')).h; const r = await call('POST', '/api/vendor/register', { name: 'Autre Grossiste' }, V); expect(r.json.vendor.status).toBe('en_attente');
  });
});

describe('analytics fournisseur (chantier 15)', () => {
  it('renvoie ventes, clients, tendance et demande non couverte', async () => {
    const V = { Authorization: (await call('POST', '/api/auth/login', { email: 'diallo@exofoods.fr', password: 'motdepasse1' })).json.token ? `Bearer ${(await call('POST', '/api/auth/login', { email: 'diallo@exofoods.fr', password: 'motdepasse1' })).json.token}` : '' };
    const R = (await reg('client@resto.fr', 'Resto Client')).h;
    const t = await call('GET', '/api/onboarding/templates', undefined, R); await call('POST', '/api/onboarding/apply', { templates: t.json.templates.slice(0, 2).map((x: Json) => x.id ?? x.name) }, R);
    const pid = (await call('GET', '/api/stock', undefined, R)).json.items[0].productId;
    const a00 = await call('GET', '/api/vendor/analytics', undefined, V); expect(a00.status).toBe(200); expect(a00.json.uncovered.some((u: Json) => u.productId === pid)).toBe(false); // Rungis livre 94/Paris, le resto est à Nantes
    await call('PUT', '/api/vendor/profile', { deliveryZones: ['nantes'], categories: [] }, V);
    const a0 = await call('GET', '/api/vendor/analytics', undefined, V); expect(a0.json.uncovered.some((u: Json) => u.productId === pid)).toBe(true);
    const o = await call('POST', '/api/vendor/offers', { productId: pid, packLabel: 'sac 25 kg', packQty: 25, packPrice: 30 }, V); expect(o.status).toBe(201);
    const vid = (await call('GET', '/api/vendor/me', undefined, V)).json.vendors[0].id;
    await call('PUT', '/api/vendor/profile', { deliveryZones: [] }, V); // livre partout
    const ord = await call('POST', `/api/marketplace/vendors/${vid}/orders`, { lines: [{ vendorOfferId: o.json.offer.id, packs: 2 }] }, R); expect(ord.status).toBe(201);
    await call('POST', `/api/vendor/orders/${ord.json.order.id}/confirm`, {}, V);
    const a = await call('GET', '/api/vendor/analytics', undefined, V); expect(a.status).toBe(200);
    expect(a.json.byProduct.length).toBe(1); expect(a.json.byProduct[0].packs).toBe(2); expect(a.json.byProduct[0].revenue).toBe(60);
    expect(a.json.topCustomers[0].name).toBe('Resto Client'); expect(a.json.monthly.length).toBe(1); expect(a.json.funnel.total).toBe(1);
    expect(a.json.uncovered.some((u: Json) => u.productId === pid)).toBe(false); expect(a.json.uncovered.length).toBeGreaterThan(0);
  });
});
