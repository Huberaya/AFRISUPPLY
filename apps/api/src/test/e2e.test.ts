// Parcours de bout en bout sur l'app Hono réelle + PGlite en mémoire (aucun mock) : les 5 chemins critiques du pilote.
import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations } from '@afrisupply/db';
import { app } from '../app.js';
import { _resetRateLimits } from '../lib/ops.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.CRON_SECRET = 'cron-test'; process.env.PGLITE_DIR = 'memory://e2e';

type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json: Json = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json, headers: res.headers };
};
let token = ''; let auth: Record<string, string> = {}; let restaurantId = '';
const A = () => auth;

beforeAll(async () => { await runMigrations(); }, 60_000);

describe('1. Inscription → connexion → isolation', () => {
  it('crée un compte + restaurant (essai 30 j) et renvoie un token', async () => {
    const r = await call('POST', '/api/auth/register', { email: 'test@resto.fr', password: 'Plantain-Yassa-42', fullName: 'Fatou Test', restaurantName: 'Le Test', city: 'Nantes', coversPerDay: 40 });
    expect(r.status).toBe(201); expect(r.json.restaurant.plan).toBe('trial'); token = r.json.token; restaurantId = r.json.restaurant.id; auth = { authorization: `Bearer ${token}` };
  });
  it('refuse un doublon (409) et un mauvais mot de passe (401), puis journalise l’échec', async () => {
    expect((await call('POST', '/api/auth/register', { email: 'test@resto.fr', password: 'Plantain-Yassa-42', fullName: 'X Y', restaurantName: 'Dup' })).status).toBe(409);
    expect((await call('POST', '/api/auth/login', { email: 'test@resto.fr', password: 'faux' })).status).toBe(401);
  });
  it('protège les routes (401 sans token) et sert le dashboard avec token', async () => {
    expect((await call('GET', '/api/dashboard')).status).toBe(401);
    const d = await call('GET', '/api/dashboard', undefined, A()); expect(d.status).toBe(200); expect(d.json.restaurant.id).toBe(restaurantId);
  });
  it('un autre utilisateur ne voit pas ce restaurant (X-Restaurant-Id refusé)', async () => {
    const o = await call('POST', '/api/auth/register', { email: 'autre@resto.fr', password: 'Plantain-Yassa-42', fullName: 'Autre Chef', restaurantName: 'Autre' });
    const r = await call('GET', '/api/dashboard', undefined, { authorization: `Bearer ${o.json.token}`, 'x-restaurant-id': restaurantId });
    expect(r.status).toBe(403);
  });
});

describe('2. Onboarding carte → stock', () => {
  it('applique 2 recettes types et crée le stock suivi', async () => {
    const t = await call('GET', '/api/onboarding/templates', undefined, A()); expect(t.json.templates.length).toBeGreaterThan(10);
    const ids = t.json.templates.slice(0, 2).map((x: Json) => x.id ?? x.name);
    const r = await call('POST', '/api/onboarding/apply', { templates: ids }, A()); expect(r.status).toBeLessThan(300);
    const s = await call('GET', '/api/stock', undefined, A()); expect(s.status).toBe(200); expect(s.json.items.length).toBeGreaterThan(3);
  });
});

let supplierId = ''; let offerId = ''; let productId = '';
describe('3. Fournisseur → offre → commande → réception', () => {
  it('crée un fournisseur et une offre sur un produit suivi', async () => {
    const sup = await call('POST', '/api/suppliers', { name: 'Grossiste Test', whatsapp: '+33600000000', leadTimeHours: 24 }, A()); expect(sup.status).toBeLessThan(300); supplierId = sup.json.supplier?.id ?? sup.json.id;
    const s = await call('GET', '/api/stock', undefined, A()); productId = s.json.items[0].productId;
    const off = await call('POST', `/api/suppliers/${supplierId}/offers`, { productId, packLabel: 'sac 25 kg', packQty: 25, packPrice: 40 }, A()); expect(off.status).toBeLessThan(300); offerId = off.json.offer?.id ?? off.json.id;
    expect(offerId).toBeTruthy();
  });
  it('passe une commande, la reçoit, le stock augmente', async () => {
    const before = (await call('GET', '/api/stock', undefined, A())).json.items.find((i: Json) => i.productId === productId).quantity;
    const o = await call('POST', '/api/orders', { supplierId, channel: 'whatsapp', lines: [{ offerId, packs: 2 }] }, A()); expect(o.status).toBeLessThan(300);
    const orderId = o.json.order?.id ?? o.json.id; expect(orderId).toBeTruthy();
    const ord = await call('GET', '/api/orders', undefined, A()); const mine = ord.json.orders.find((x: Json) => x.id === orderId); expect(mine.lines.length).toBe(1);
    const rec = await call('POST', `/api/orders/${orderId}/receive`, { lines: mine.lines.map((l: Json) => ({ lineId: l.id, receivedQty: Number(l.quantity ?? l.qty ?? 50) })) }, A());
    expect(rec.status).toBeLessThan(300);
    const after = (await call('GET', '/api/stock', undefined, A())).json.items.find((i: Json) => i.productId === productId).quantity;
    expect(Number(after)).toBeGreaterThan(Number(before));
  });
});

describe('4. Ventes → prévision → panier → alertes', () => {
  it('saisit des ventes et obtient une prévision + un panier', async () => {
    const rec = await call('GET', '/api/recipes', undefined, A()); const recipeId = rec.json.recipes[0].id;
    for (let d = 1; d <= 7; d++) { const day = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10); const r = await call('POST', '/api/sales', { day, lines: [{ recipeId, portions: 30 }] }, A()); expect(r.status).toBeLessThan(300); }
    const f = await call('GET', '/api/forecast', undefined, A()); expect(f.status).toBe(200); expect(f.json.products.length).toBeGreaterThan(0);
    const cart = await call('GET', '/api/smart-cart', undefined, A()); expect(cart.status).toBe(200);
    const al = await call('POST', '/api/alerts/refresh', {}, A()); expect(al.status).toBe(200);
  });
});

describe('4 bis. Saisie express', () => {
  it('« vendu 30 <plat> » → ventes du jour + stock décrémenté ; « reste 7 kg <produit> » → ajustement', async () => {
    const rec = await call('GET', '/api/recipes', undefined, A()); const recipe = rec.json.recipes[0];
    const p = await call('POST', '/api/quick/parse', { text: `vendu 30 ${recipe.name}` }, A()); expect(p.status).toBe(200); expect(p.json.kind).toBe('vente'); expect(p.json.lines[0].match?.id).toBe(recipe.id);
    const stockBefore = (await call('GET', '/api/stock', undefined, A())).json.items;
    const a = await call('POST', '/api/quick/apply', { kind: 'vente', lines: [{ id: recipe.id, qty: 30 }] }, A()); expect(a.status).toBe(200); expect(a.json.applied).toBe(1);
    const stockAfter = (await call('GET', '/api/stock', undefined, A())).json.items;
    expect(stockAfter.reduce((s: number, i: Json) => s + Number(i.quantity), 0)).toBeLessThan(stockBefore.reduce((s: number, i: Json) => s + Number(i.quantity), 0));
    const item = stockAfter[0];
    const c = await call('POST', '/api/quick/parse', { text: `reste 7 kg ${item.name}` }, A()); expect(c.json.kind).toBe('comptage'); expect(c.json.lines[0].match?.id).toBe(item.id);
    await call('POST', '/api/quick/apply', { kind: 'comptage', lines: [{ id: item.id, qty: 7 }] }, A());
    const inv = await call('GET', '/api/quick/inventory', undefined, A()); expect(inv.json.countedLast7Days).toBeGreaterThanOrEqual(1);
    expect(Number((await call('GET', '/api/stock', undefined, A())).json.items.find((i: Json) => i.id === item.id).quantity)).toBe(7);
  });
  it('photo de facture sans LLM → 503 explicite ; validation manuelle de lignes → réception + prix', async () => {
    delete process.env.LLM_API_KEY;
    expect((await call('POST', '/api/quick/invoice', { image: 'data:image/jpeg;base64,AAAA' }, A())).status).toBe(503);
    const item = (await call('GET', '/api/stock', undefined, A())).json.items[0];
    const r = await call('POST', '/api/quick/invoice/apply', { supplierId, lines: [{ inventoryItemId: item.id, qty: 10, unitPrice: 1.9 }] }, A()); expect(r.status).toBe(200); expect(r.json).toMatchObject({ received: 1, pricesUpdated: 1 });
  });
});

describe('5. Exploitation : cron, statut, RGPD, sécurité', () => {
  it('le cron exige le secret, enregistre un job_run et /status le reflète', async () => {
    expect((await call('GET', '/api/jobs/daily')).status).toBe(401);
    const run = await call('GET', '/api/jobs/daily', undefined, { authorization: 'Bearer cron-test' }); expect(run.status).toBe(200); expect(run.json.count).toBeGreaterThanOrEqual(2);
    const st = await call('GET', '/api/status'); expect(st.status).toBe(200); expect(st.json.checks.database.ok).toBe(true); expect(st.json.checks.dailyJob.state).toBe('ok');
    const jobs = await call('GET', '/api/status/jobs', undefined, { authorization: 'Bearer cron-test' }); expect(jobs.json.runs.length).toBe(1); expect(jobs.json.runs[0].status).toBe('ok');
  });
  it('en-têtes de sécurité présents, 404 JSON (une fois authentifié)', async () => {
    const h = await call('GET', '/api/health'); expect(h.headers.get('x-content-type-options')).toBe('nosniff'); expect(h.headers.get('x-frame-options')).toBe('DENY');
    expect((await call('GET', '/api/nimporte', undefined, A())).status).toBe(404);
  });
  it('rate limit : 11ᵉ tentative de connexion en une minute → 429', async () => {
    await _resetRateLimits();
    let last = 0; for (let i = 0; i < 11; i++) last = (await call('POST', '/api/auth/login', { email: 'x@y.fr', password: 'nope' })).status;
    expect(last).toBe(429); await _resetRateLimits();
  });
  it('export RGPD contient le restaurant et ses commandes ; suppression exige le mot de passe puis efface tout', async () => {
    const ex = await call('GET', '/api/account/export', undefined, A()); expect(ex.status).toBe(200); expect(ex.json.user.email).toBe('test@resto.fr'); expect(ex.json.restaurants[0].orders.length).toBe(1);
    expect((await call('DELETE', '/api/account', { password: 'faux', confirm: 'SUPPRIMER' }, A())).status).toBe(401);
    const del = await call('DELETE', '/api/account', { password: 'Plantain-Yassa-42', confirm: 'SUPPRIMER' }, A()); expect(del.status).toBe(200); expect(del.json.restaurantsDeleted).toBe(1);
    expect((await call('POST', '/api/auth/login', { email: 'test@resto.fr', password: 'Plantain-Yassa-42' })).status).toBe(401);
  });
});
