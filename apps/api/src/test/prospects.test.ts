import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.PGLITE_DIR = 'memory://prospects'; process.env.ADMIN_EMAILS = 'admin@afrisupply.fr'; delete process.env.STRIPE_SECRET_KEY;
type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => { const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); let json: Json = {}; try { json = await res.json(); } catch { /* */ } return { status: res.status, json }; };
let ADM: Record<string, string>; let USR: Record<string, string>;
beforeAll(async () => { await runMigrations(); ADM = { authorization: `Bearer ${(await call('POST', '/api/auth/register', { email: 'admin@afrisupply.fr', password: 'Plantain-Yassa-42', fullName: 'Admin', restaurantName: 'Admin' })).json.token}` }; USR = { authorization: `Bearer ${(await call('POST', '/api/auth/register', { email: 'u@r.fr', password: 'Plantain-Yassa-42', fullName: 'U R', restaurantName: 'Resto U' })).json.token}` }; }, 60_000);
describe('prospection', () => {
  it('réservé admin ; création restaurant et fournisseur avec nom/adresse/tél/e-mail ; filtres ; import ; statut ; suppression', async () => {
    expect((await call('GET', '/api/admin/prospects', undefined, USR)).status).toBe(403);
    const r = await call('POST', '/api/admin/prospects', { kind: 'restaurant', name: 'Chez Fatou', address: '12 rue de Strasbourg', city: 'Nantes', phone: '02 40 00 00 00', email: 'contact@chezfatou.fr', contactName: 'Fatou Ndiaye' }, ADM); expect(r.status).toBe(201); expect(r.json.prospect).toMatchObject({ kind: 'restaurant', status: 'a_contacter', phone: '02 40 00 00 00' });
    const f = await call('POST', '/api/admin/prospects', { kind: 'fournisseur', name: 'Sahel Distribution', address: 'ZI Nord', city: 'Rezé', phone: '06 00 00 00 00', email: '' }, ADM); expect(f.status).toBe(201); expect(f.json.prospect.email).toBeNull();
    expect((await call('POST', '/api/admin/prospects', { kind: 'restaurant', name: 'X', email: 'pas-un-mail' }, ADM)).status).not.toBe(201);
    expect((await call('GET', '/api/admin/prospects?kind=restaurant', undefined, ADM)).json.prospects).toHaveLength(1);
    expect((await call('GET', '/api/admin/prospects?kind=fournisseur&q=sahel', undefined, ADM)).json.prospects[0].name).toBe('Sahel Distribution');
    const imp = await call('POST', '/api/admin/prospects/import?kind=restaurant', { rows: [{ name: 'Le Baobab', city: 'Angers', phone: '02 41 00 00 00' }, { name: 'A' }] }, ADM); expect(imp.json).toMatchObject({ imported: 1, ignored: 1 });
    const u = await call('PUT', `/api/admin/prospects/${r.json.prospect.id}`, { status: 'rdv', nextActionAt: '2026-09-25', notes: 'RDV jeudi 10 h' }, ADM); expect(u.json.prospect.status).toBe('rdv');
    const all = await call('GET', '/api/admin/prospects', undefined, ADM); expect(all.json.counts.find((c: Json) => c.kind === 'restaurant' && c.status === 'rdv').c).toBe(1);
    expect((await call('DELETE', `/api/admin/prospects/${f.json.prospect.id}`, undefined, ADM)).json.ok).toBe(true);
    expect((await call('GET', '/api/admin/prospects?kind=fournisseur', undefined, ADM)).json.prospects).toHaveLength(0);
  });
});
