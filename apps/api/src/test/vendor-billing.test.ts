// Chantier 8 de l'audit 2 — moyen de paiement fournisseur (commissions) :
//  • enregistrement d'une carte via Stripe Checkout « mode setup » contre un faux Stripe local ;
//  • état honnête (relevé par e-mail / prélèvement automatique), jamais de bouton qui ne peut pas aboutir ;
//  • facture de commission PDF émise et envoyée, prélèvement automatique si une carte est enregistrée ;
//  • étanchéité entre fournisseurs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { runMigrations, getDb, vendors, commissionInvoices, commissions, orders, restaurants, suppliers } from '@afrisupply/db';
import { app } from '../app.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PGLITE_DIR = 'memory://vendor-billing';
process.env.ADMIN_EMAILS = 'admin@afrisupply.fr';
process.env.APP_URL = 'http://localhost:3000';
process.env.VENDOR_AUTO_APPROVE = 'true';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test8';
process.env.STRIPE_PRICE_PRO = 'price_pro';
const OUTBOX = path.join(os.tmpdir(), `afs-outbox-vendor8-${process.pid}`);
process.env.MAIL_OUTBOX_DIR = OUTBOX;

type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
  let json: Json = {}; try { json = await res.json(); } catch { /* PDF */ }
  return { status: res.status, json, raw: res };
};
const reg = async (email: string, name: string) => {
  const r = await call('POST', '/api/auth/register', { email, password: 'Plantain-Yassa-42', fullName: 'Grossiste Test', restaurantName: name, city: 'Nantes' });
  return { h: { authorization: `Bearer ${r.json.token}` } as Record<string, string>, email };
};
const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', 'whsec_test8').update(`${t}.${body}`).digest('hex')}`;

// ---------- faux Stripe ----------
const fake: { calls: { path: string; body: string; method: string; idempotency?: string }[]; setupIntents: Record<string, Json>; paymentMethods: Record<string, Json> } = { calls: [], setupIntents: {}, paymentMethods: {} };
let server: Server; let base = '';
beforeAll(async () => {
  fake.setupIntents.seti_fake_1 = { id: 'seti_fake_1', object: 'setup_intent', status: 'succeeded', payment_method: 'pm_fake_1' };
  fake.paymentMethods.pm_fake_1 = { id: 'pm_fake_1', object: 'payment_method', card: { brand: 'visa', last4: '4242' } };
  server = createServer((req, res) => {
    let raw = ''; req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url ?? '/', base); const p = url.pathname.replace('/v1', ''); const method = req.method ?? '';
      fake.calls.push({ path: p, method, body: raw, idempotency: req.headers['idempotency-key'] as string | undefined });
      const json = (o: unknown, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (method === 'POST' && p === '/customers') return json({ id: 'cus_vnd_1', object: 'customer' });
      if (method === 'POST' && p === '/checkout/sessions') return json({ id: 'cs_setup_1', object: 'checkout.session', url: 'https://checkout.stripe.faux/cs_setup_1' });
      if (method === 'GET' && p.startsWith('/setup_intents/')) { const si = fake.setupIntents[p.split('/')[2]]; return si ? json(si) : json({ error: { message: 'No such setup intent' } }, 404); }
      if (method === 'GET' && p.startsWith('/payment_methods/')) { const pm = fake.paymentMethods[p.split('/')[2]]; return pm ? json(pm) : json({ error: { message: 'No such payment method' } }, 404); }
      if (method === 'POST' && p.startsWith('/customers/')) return json({ id: p.split('/')[2], object: 'customer' });
      if (method === 'POST' && p === '/invoiceitems') return json({ id: 'ii_1', object: 'invoiceitem' });
      if (method === 'POST' && p === '/invoices') return json({ id: 'in_vnd_1', object: 'invoice' });
      if (method === 'POST' && p.endsWith('/finalize')) return json({ id: 'in_vnd_1', object: 'invoice' });
      return json({ error: { message: `route inconnue ${method} ${p}` } }, 404);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address(); base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/v1`;
  process.env.STRIPE_API_BASE = base;
  await runMigrations();
}, 90_000);
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); await rm(OUTBOX, { recursive: true, force: true }); delete process.env.STRIPE_API_BASE; });

let V: { h: Record<string, string>; email: string }; let W: { h: Record<string, string>; email: string }; let ADMIN: Record<string, string>;
let vid = ''; let vid2 = ''; let invoiceId = '';

describe('chantier 8 — moyen de paiement fournisseur', () => {
  beforeAll(async () => {
    V = await reg('grossiste8@test.fr', 'Chez Gros'); W = await reg('grossiste8-b@test.fr', 'Chez Pareil');
    ADMIN = (await reg('admin@afrisupply.fr', 'Admin')).h;
    const a = await call('POST', '/api/vendor/register', { name: 'Grossiste Huit', city: 'Nantes', deliveryZones: ['Nantes'], acceptCgv: true, contactEmail: 'contact@grossiste8.fr' }, V.h);
    const b = await call('POST', '/api/vendor/register', { name: 'Grossiste Huit Bis', city: 'Rennes', deliveryZones: ['Rennes'], acceptCgv: true }, W.h);
    expect(a.status).toBe(201); expect(b.status).toBe(201);
    const db = await getDb();
    const rows = await db.select().from(vendors).orderBy(vendors.createdAt);
    vid = rows.find((v) => v.name === 'Grossiste Huit')!.id;
    vid2 = rows.find((v) => v.name === 'Grossiste Huit Bis')!.id;
    expect(vid2).toBeTruthy();   // le second grossiste existe bien (isolation)
  });

  it('sans carte : l’état annoncé est « relevé par e-mail », avec l’adresse réellement utilisée', async () => {
    const r = await call('GET', '/api/vendor/billing', undefined, V.h);
    expect(r.status).toBe(200);
    expect(r.json.payment).toMatchObject({ stripe: true, card: null, mode: 'releve_mail' });
    expect(r.json.payment.message).toMatch(/virement/);
    expect(r.json.recipient).toBe('contact@grossiste8.fr');
    expect(r.json.commissionPct).toBeCloseTo(3, 2);
  });

  it('enregistrer une carte : session Stripe « setup » réellement créée (aucun débit à cette étape)', async () => {
    const r = await call('POST', '/api/vendor/billing/setup', {}, V.h);
    expect(r.status).toBe(200); expect(r.json.url).toBe('https://checkout.stripe.faux/cs_setup_1');
    const sess = fake.calls.filter((c) => c.path === '/checkout/sessions').pop()!;
    const params = new URLSearchParams(sess.body);
    expect(params.get('mode')).toBe('setup');
    expect(params.get('metadata[vendorId]')).toBe(vid);
    expect(params.get('customer')).toBe('cus_vnd_1');
    expect(fake.calls.find((c) => c.path === '/customers')?.idempotency).toBe(`vnd-${vid}`);
    const db = await getDb(); const [v] = await db.select().from(vendors).where(eq(vendors.id, vid));
    expect(v.stripeCustomerId).toBe('cus_vnd_1');
  });

  it('le webhook Stripe active le prélèvement (carte par défaut enregistrée côté Stripe)', async () => {
    const evt = { id: 'evt_setup_1', type: 'checkout.session.completed', data: { object: { id: 'cs_setup_1', object: 'checkout.session', mode: 'setup', customer: 'cus_vnd_1', setup_intent: 'seti_fake_1', metadata: { vendorId: vid, usage: 'commission' } } } };
    const r = await call('POST', '/api/billing/webhook', JSON.stringify(evt), { 'stripe-signature': sign(JSON.stringify(evt)) });
    expect(r.status).toBe(200);
    const db = await getDb(); const [v] = await db.select().from(vendors).where(eq(vendors.id, vid));
    expect(v.stripeDefaultPaymentMethod).toBe('pm_fake_1');
    // la carte est aussi déclarée par défaut chez Stripe (les factures suivantes seront prélevées)
    expect(fake.calls.some((c) => c.method === 'POST' && c.path === '/customers/cus_vnd_1' && c.body.includes('default_payment_method'))).toBe(true);
    const b = await call('GET', '/api/vendor/billing', undefined, V.h);
    expect(b.json.payment).toMatchObject({ mode: 'prelevement' });
    expect(b.json.payment.card).toMatchObject({ brand: 'visa', last4: '4242' });
    expect(b.json.payment.message).toMatch(/Prélèvement automatique actif/);
    // rejeu : aucun double traitement
    const dup = await call('POST', '/api/billing/webhook', JSON.stringify(evt), { 'stripe-signature': sign(JSON.stringify(evt)) });
    expect(dup.json.duplicate).toBe(true);
  });

  it('une session inconnue ne permet pas de voler la carte d’un autre fournisseur', async () => {
    fake.calls.push({ path: '/checkout/sessions/cs_setup_autre', method: 'GET', body: '' });
    const r = await call('POST', '/api/vendor/billing/sync', { sessionId: 'cs_setup_1' }, W.h);
    // la session appartient au premier fournisseur : le second est refusé
    expect([403, 502]).toContain(r.status);
  });

  it('facture de commission : prélèvement automatique quand la carte est enregistrée', async () => {
    const db = await getDb();
    // une commande confirmée (base de la commission) + la commission du mois
    const [resto] = await db.select().from(restaurants).limit(1);
    const [sup] = await db.insert(suppliers).values({ restaurantId: resto.id, name: 'Grossiste Huit (plateforme)' }).returning();
    const [o] = await db.insert(orders).values({ restaurantId: resto.id, supplierId: sup.id, reference: `TESTC8-${Date.now()}`, status: 'confirmee', totalEur: '120.00', vendorId: vid, sentAt: new Date() }).returning();
    await db.insert(commissions).values({ vendorId: vid, orderId: o.id, orderTotalEur: '120.00', pct: '3.00', amountEur: '3.60', period: '2026-08' });
    const res = await call('POST', '/api/admin/billing/commissions/invoice', { period: '2026-08' }, ADMIN);
    expect(res.status).toBe(200);
    const mine = res.json.invoices.find((i: Json) => i.vendorId === vid);
    expect(mine).toMatchObject({ via: 'stripe', mode: 'prelevement' });
    expect(mine.recipient).toBe('contact@grossiste8.fr');
    // la facture Stripe est créée en prélèvement automatique (et non en relevé à 15 jours)
    const inv = fake.calls.filter((c) => c.path === '/invoices').pop()!;
    expect(new URLSearchParams(inv.body).get('collection_method')).toBe('charge_automatically');
    const dbInv = await db.select().from(commissionInvoices).where(eq(commissionInvoices.vendorId, vid));
    expect(dbInv).toHaveLength(1); invoiceId = dbInv[0].id;
    expect(dbInv[0].status).toBe('emise');   // payée seulement après encaissement réel (webhook)
    expect(dbInv[0].stripeInvoiceId).toBe('in_vnd_1');
    const files = await readdir(OUTBOX);
    const pdfs = files.filter((f) => f.endsWith('.pdf'));
    const pdfsMonth = await Promise.all(pdfs.map(async (f) => ({ f, txt: await readFile(path.join(OUTBOX, f), 'latin1') })));
    const facture = pdfsMonth.find((x) => x.txt.startsWith('%PDF-1.4') && x.txt.includes('FACTURE DE COMMISSION'));
    expect(facture).toBeTruthy();
    expect(facture!.txt).toContain('Grossiste Huit');
    expect(facture!.txt).toContain('prélèvement automatique');
  });

  it('le fournisseur télécharge sa facture ; un autre fournisseur reçoit 404', async () => {
    const mine = await call('GET', `/api/vendor/billing/invoices/${invoiceId}/pdf`, undefined, V.h);
    expect(mine.status).toBe(200); expect(mine.raw.headers.get('content-type')).toBe('application/pdf');
    const other = await call('GET', `/api/vendor/billing/invoices/${invoiceId}/pdf`, undefined, W.h);
    expect(other.status).toBe(404);
  });

  it('encaissement confirmé par Stripe : la facture passe en « payée »', async () => {
    const evt = { id: 'evt_inv_paid_c8', type: 'invoice.paid', data: { object: { id: 'in_vnd_1', customer: 'cus_vnd_1', total: 432, tax: 72, paid: true } } };
    const r = await call('POST', '/api/billing/webhook', JSON.stringify(evt), { 'stripe-signature': sign(JSON.stringify(evt)) });
    expect(r.status).toBe(200);
    const db = await getDb();
    const [inv] = await db.select().from(commissionInvoices).where(eq(commissionInvoices.id, invoiceId));
    expect(inv.status).toBe('payee');
  });

  it('l’adresse de facturation du fournisseur est modifiable depuis sa fiche', async () => {
    const r = await call('PUT', '/api/vendor/profile', { billingEmail: 'compta@grossiste8.fr' }, V.h);
    expect(r.status).toBe(200);
    const b = await call('GET', '/api/vendor/billing', undefined, V.h);
    expect(b.json.recipient).toBe('compta@grossiste8.fr');
    expect((await call('PUT', '/api/vendor/profile', { billingEmail: 'pas-un-email' }, V.h)).status).toBe(400);
  });

  it('sans Stripe configuré : l’application refuse proprement au lieu d’un bouton inerte', async () => {
    const keep = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
    const r = await call('POST', '/api/vendor/billing/setup', {}, V.h);
    expect(r.status).toBe(503); expect(r.json.error).toMatch(/facturées par e-mail|virement/);
    const b = await call('GET', '/api/vendor/billing', undefined, V.h);
    expect(b.json.payment.stripe).toBe(false);
    expect(b.json.payment.message).toMatch(/indisponible/);
    process.env.STRIPE_SECRET_KEY = keep;
  });
});
