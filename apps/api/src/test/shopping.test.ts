import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations, getDb, vendors, vendorOffers, products } from '@afrisupply/db';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.PGLITE_DIR = 'memory://shopping'; delete process.env.STRIPE_SECRET_KEY;
type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => { const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); let json: Json = {}; try { json = await res.json(); } catch { /* */ } return { status: res.status, json }; };
let H: Record<string, string>; let piment: string; let riz: string;
beforeAll(async () => {
  await runMigrations();
  H = { authorization: `Bearer ${(await call('POST', '/api/auth/register', { email: 'c@r.fr', password: 'motdepasse1', fullName: 'C R', restaurantName: 'Chez Courses' })).json.token}` };
  piment = (await call('POST', '/api/catalog/products', { name: 'Piment frais', category: 'frais', baseUnit: 'kg', aliases: ['piment'] }, H)).json.id;
  riz = (await call('POST', '/api/catalog/products', { name: 'Riz parfumé', category: 'feculents', baseUnit: 'kg', aliases: ['riz'] }, H)).json.id;
  // mon fournisseur perso : piment 4 €/kg (carton 5 kg = 20 €), riz 1,20 €/kg (sac 25 kg = 30 €)
  const s = (await call('POST', '/api/suppliers', { name: 'Marché Dejean', leadTimeHours: 24 }, H)).json;
  const sid = s.supplier?.id ?? s.id;
  await call('POST', `/api/suppliers/${sid}/offers`, { productId: piment, packLabel: 'Carton 5 kg', packQty: 5, packPrice: 20 }, H);
  await call('POST', `/api/suppliers/${sid}/offers`, { productId: riz, packLabel: 'Sac 25 kg', packQty: 25, packPrice: 30 }, H);
  // fournisseur plateforme actif, livre toute la France : piment 3 €/kg (carton 10 kg = 30 €)
  const db = await getDb();
  const [v] = await db.insert(vendors).values({ name: 'Tropic Test', slug: 'tropic-test', status: 'actif', deliveryZones: ['France'], categories: ['frais'], minOrderEur: '0' }).returning();
  await db.insert(vendorOffers).values({ vendorId: v.id, productId: piment, packLabel: 'Carton 10 kg', packQty: '10', packPriceEur: '30' });
  expect((await db.select().from(products).where(eq(products.id, piment))).length).toBe(1);
}, 60_000);
describe('liste de courses', () => {
  it('« 10 kg de piment, 5 kilo de riz, 3 tomates » → produits reconnus, offres triées par prix, colis calculés, inconnu signalé', async () => {
    const r = await call('POST', '/api/shopping/parse', { text: '10 kg de piment, 5 kilo de riz et 3 tomates' }, H);
    expect(r.status).toBe(200); expect(r.json.lines).toHaveLength(3);
    const [p, z, t] = r.json.lines;
    expect(p.product.name).toBe('Piment frais'); expect(p.neededQty).toBe(10);
    expect(p.offers.map((o: Json) => o.sellerName)).toEqual(['Tropic Test', 'Marché Dejean']); // 3 €/kg avant 4 €/kg
    expect(p.offers[0]).toMatchObject({ kind: 'vendor', packs: 1, lineTotal: 30 }); expect(p.offers[1]).toMatchObject({ kind: 'supplier', packs: 2, lineTotal: 40 });
    expect(p.selected).toBe(p.offers[0].key); expect(p.savingPct).toBe(25);
    expect(z.product.name).toBe('Riz parfumé'); expect(z.offers[0]).toMatchObject({ packs: 1, packLabel: 'Sac 25 kg' });
    expect(t.product).toBeNull(); expect(r.json.unmatched).toEqual(['3 tomates']);
  });
  it('2 cartons de piment → 2 colis ; 500 g de riz → 0,5 kg', async () => {
    const r = await call('POST', '/api/shopping/parse', { text: '2 cartons piment, 500 g riz' }, H);
    expect(r.json.lines[0].offers[0].packs).toBe(2); expect(r.json.lines[1].neededQty).toBe(0.5);
  });
  it('commande via les routes existantes : plateforme + fournisseur perso', async () => {
    const r = await call('POST', '/api/shopping/parse', { text: '10 kg piment, 25 kg riz' }, H);
    const v = r.json.lines[0].offers[0]; const s = r.json.lines[1].offers[0];
    expect((await call('POST', `/api/marketplace/vendors/${v.sellerId}/orders`, { lines: [{ vendorOfferId: v.offerId, packs: v.packs }], source: 'liste_courses' }, H)).status).toBe(201);
    expect((await call('POST', '/api/orders', { supplierId: s.sellerId, lines: [{ offerId: s.offerId, packs: s.packs }], source: 'liste_courses' }, H)).status).toBe(201);
  });
});
describe('classement des produits', () => {
  it('« riz » préfère un produit Riz (mot exact) plutôt qu’un produit dont un alias ressemble', async () => {
    const { rankProducts } = await import('../routes/shopping.js');
    const prods = [{ id: 'a', name: 'Shito (sauce piment ghanéenne)', aliases: ['shito', 'sauce riz'] }, { id: 'b', name: 'Riz parfumé', aliases: ['riz jasmin'] }, { id: 'c', name: 'Riz brisé', aliases: [] }];
    expect(rankProducts('riz', prods, new Set(), new Set(['b']))[0].id).toBe('b');
    expect(rankProducts('riz', prods, new Set(['c']), new Set())[0].id).toBe('c');
    expect(rankProducts('piment', prods, new Set(), new Set())[0].id).toBe('a');
  });
});
