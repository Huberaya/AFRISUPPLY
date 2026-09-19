import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import { parseCatalogLine, parseCatalogText, matchCatalogLines } from '../lib/catalog-import.js';
process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.PGLITE_DIR = 'memory://catimp'; process.env.ADMIN_EMAILS = 'admin@afrisupply.fr'; delete process.env.STRIPE_SECRET_KEY; delete process.env.LLM_API_KEY;
type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => { const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); let json: Json = {}; try { json = await res.json(); } catch { /* */ } return { status: res.status, json }; };
const reg = async (email: string, name: string) => ({ authorization: `Bearer ${(await call('POST', '/api/auth/register', { email, password: 'motdepasse1', fullName: 'X Y', restaurantName: name })).json.token}` });
let V: Record<string, string>; let R: Record<string, string>; let ADM: Record<string, string>; let vid: string;
beforeAll(async () => {
  await runMigrations(); V = await reg('g@tropic.fr', 'compte grossiste'); R = await reg('r@resto.fr', 'Chez Resto'); ADM = await reg('admin@afrisupply.fr', 'Admin');
  const t = await call('GET', '/api/onboarding/templates', undefined, R); await call('POST', '/api/onboarding/apply', { templates: t.json.templates.slice(0, 3).map((x: Json) => x.id ?? x.name) }, R); // peuple le référentiel commun
  vid = (await call('POST', '/api/vendor/register', { name: 'Tropic Test', deliveryZones: ['France'], categories: ['epicerie'] }, V)).json.vendor.id;
  await call('PUT', `/api/admin/vendors/${vid}`, { status: 'actif' }, ADM);
}, 60_000);

describe('parseur de tarif', () => {
  it('texte libre, tabulaire, multipack, grammes', () => {
    expect(parseCatalogLine('Riz brisé parfumé sac 25 kg 29,90')).toMatchObject({ label: 'riz brise parfume', packQty: 25, packUnit: 'kg', price: 29.9, packLabel: 'Sac 25 kg' });
    expect(parseCatalogLine('Huile de palme rouge | bidon 5 L | 24.50')).toMatchObject({ label: 'Huile de palme rouge', packQty: 5, packUnit: 'L', price: 24.5 });
    expect(parseCatalogLine('Attiéké 1kg x 10 – 32 €')).toMatchObject({ packQty: 10, packUnit: 'kg', price: 32 });
    expect(parseCatalogLine('Piment en poudre sachet 500 g 4,20')).toMatchObject({ packQty: 0.5, packUnit: 'kg', price: 4.2 });
    expect(parseCatalogLine('Riz brisé;Sac 25 kg;25;38,50;oui')).toMatchObject({ label: 'Riz brisé', packQty: 25, price: 38.5, inStock: true });
    expect(parseCatalogLine('Produit;Conditionnement;Qté;Prix')).toBeNull();
    expect(parseCatalogText('Riz brisé sac 25 kg 29,90\n\nblabla sans prix\nGombo frais carton 5 kg 19').length).toBe(2);
  });
  it('rapprochement : nom exact, incompatibilité d’unité pénalisée', () => {
    const ref = [{ id: 'a', name: 'Riz brisé', aliases: ['riz cassé'], baseUnit: 'kg' }, { id: 'b', name: 'Huile de palme rouge', aliases: [], baseUnit: 'L' }, { id: 'c', name: 'Riz parfumé', aliases: [], baseUnit: 'kg' }];
    const m = matchCatalogLines(parseCatalogText('Riz brisé sac 25 kg 29,90\nHuile de palme rouge bidon 5 L 24,50\nHuile de palme 25 kg 80'), ref);
    expect(m[0].match?.id).toBe('a'); expect(m[1].match?.id).toBe('b'); expect(m[2].warning).toMatch(/Unité kg/);
  });
});
describe('import catalogue fournisseur', () => {
  it('parse → apply → offres publiées, prix propagés au restaurant lié, prix express', async () => {
    const p = await call('POST', '/api/vendor/catalog/parse', { text: 'Riz brisé sac 25 kg 38,50\nHuile de palme rouge bidon 5 L 24,50\nTruc inconnu bidule 3 kg 9' }, V);
    expect(p.status).toBe(200); expect(p.json.total).toBe(3); expect(p.json.matched).toBeGreaterThanOrEqual(2);
    const lines = p.json.lines.filter((l: Json) => l.match).map((l: Json) => ({ productId: l.match.id, packLabel: l.packLabel, packQty: l.packQty, packPrice: l.price }));
    const a = await call('POST', '/api/vendor/catalog/apply', { lines }, V); expect(a.status).toBe(200); expect(a.json.created).toBe(lines.length);
    // restaurant lie le fournisseur → offres copiées
    await call('POST', `/api/marketplace/vendors/${vid}/link`, undefined, R);
    const p2 = await call('POST', '/api/vendor/catalog/parse', { text: 'Riz brisé sac 25 kg 41' }, V); expect(p2.json.lines[0]).toMatchObject({ currentPrice: 38.5 }); expect(p2.json.lines[0].changePct).toBeCloseTo(6.5, 0);
    const a2 = await call('POST', '/api/vendor/catalog/apply', { lines: [{ productId: p2.json.lines[0].match.id, packLabel: 'Sac 25 kg', packQty: 25, packPrice: 41 }], replaceMissing: true }, V);
    expect(a2.json).toMatchObject({ updated: 1, priceChanges: 1, propagatedTo: 1 }); expect(a2.json.outOfStock).toBe(lines.length - 1);
    const q = await call('POST', '/api/vendor/offers/quick', { text: 'riz brisé 25 kg 39,90' }, V); expect(q.status).toBe(200); expect(q.json.message).toMatch(/41,00 € → 39,90 €/);
    const q2 = await call('POST', '/api/vendor/offers/quick', { text: 'huile de palme rupture' }, V); expect(q2.json.message).toMatch(/rupture/);
    const q3 = await call('POST', '/api/vendor/offers/quick', { text: 'huile de palme dispo' }, V); expect(q3.json.message).toMatch(/disponible/);
    expect((await call('POST', '/api/vendor/offers/quick', { text: 'caviar 10' }, V)).status).toBe(404);
    // côté restaurant : le prix reflète la dernière valeur
    const sup = (await call('GET', '/api/suppliers', undefined, R)).json; const s = (sup.suppliers ?? sup).find((x: Json) => x.vendorId === vid);
    const det = await call('GET', `/api/suppliers/${s.id}`, undefined, R); const offs = det.json.offers ?? det.json.supplier?.offers ?? [];
    const riz = offs.find((o: Json) => /riz/i.test(o.productName ?? o.name ?? '')); if (riz) expect(Number(riz.packPriceEur)).toBe(39.9);
    expect((await call('POST', '/api/vendor/catalog/parse', { image: 'data:image/png;base64,AAAA' }, V)).status).toBe(503);
  });
});
