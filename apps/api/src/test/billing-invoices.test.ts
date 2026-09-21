// Chantier 7 de l'audit 2 — encaissement réellement branché :
//  • faux serveur Stripe local (STRIPE_API_BASE) : parcours checkout / portail de bout en bout, sans clé réelle ;
//  • webhook signé durci : événement réclamé avant traitement, rejeu d'échec possible, rejeu de succès sans doublon ;
//  • factures AFRISUPPLY : numérotation, PDF (mentions légales), envoi par e-mail avec pièce jointe ;
//  • bascule manuelle (virement) côté admin et étanchéité entre restaurants.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { runMigrations, getDb, restaurants, subscriptionInvoices, billingEvents, jobRuns } from '@afrisupply/db';
import { app } from '../app.js';
import { billingHealth, nextInvoiceNumber, recordSubscriptionInvoice, billingRecipient } from '../lib/billing.js';
import { invoicePdf, emitterComplete } from '../lib/pdf.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PGLITE_DIR = 'memory://billing7';
process.env.ADMIN_EMAILS = 'admin@afrisupply.fr';
process.env.BILLING_ENFORCE = 'true';
process.env.APP_URL = 'http://localhost:3000';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test7';
process.env.STRIPE_PRICE_STARTER = 'price_starter';
process.env.STRIPE_PRICE_PRO = 'price_pro';
process.env.STRIPE_PRICE_BUSINESS = 'price_business';
process.env.VENDOR_AUTO_APPROVE = 'true';
const OUTBOX = path.join(os.tmpdir(), `afs-outbox-billing7-${process.pid}`);
process.env.MAIL_OUTBOX_DIR = OUTBOX;

type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
  let json: Json = {}; try { json = await res.json(); } catch { /* PDF ou 204 */ }
  return { status: res.status, json, raw: res };
};
const reg = async (email: string, name: string) => {
  const r = await call('POST', '/api/auth/register', { email, password: 'Plantain-Yassa-42', fullName: 'Testeur', restaurantName: name, city: 'Nantes' });
  return { h: { authorization: `Bearer ${r.json.token}` }, rid: r.json.restaurant.id as string, email };
};
const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', 'whsec_test7').update(`${t}.${body}`).digest('hex')}`;
const hook = async (evt: Json) => { const raw = JSON.stringify(evt); return call('POST', '/api/billing/webhook', raw, { 'stripe-signature': sign(raw) }); };

// ---------- Faux Stripe : répond exactement comme l'API v1, et retient ce qui lui a été demandé ----------
const fake: {
  calls: { method: string; path: string; body: string; idempotency?: string }[];
  subs: Record<string, Json>;
} = { calls: [], subs: {} };
let server: Server; let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url ?? '/', base);
      fake.calls.push({ method: req.method ?? '', path: url.pathname.replace('/v1', ''), body: raw, idempotency: req.headers['idempotency-key'] as string | undefined });
      const json = (o: unknown, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const p = url.pathname.replace('/v1', '');
      if (req.method === 'POST' && p === '/customers') return json({ id: 'cus_fake_1', object: 'customer' });
      if (req.method === 'POST' && p === '/checkout/sessions') return json({ id: 'cs_fake_1', url: 'https://checkout.stripe.fake/cs_fake_1', object: 'checkout.session' });
      if (req.method === 'POST' && p === '/billing_portal/sessions') return json({ id: 'bps_fake_1', url: 'https://billing.stripe.fake/bps_fake_1', object: 'billing_portal.session' });
      if (req.method === 'GET' && p.startsWith('/subscriptions/')) {
        const id = p.split('/')[2];
        const sub = fake.subs[id];
        return sub ? json(sub) : json({ error: { message: `No such subscription: ${id}` } }, 404);
      }
      return json({ error: { message: `route inconnue ${req.method} ${p}` } }, 404);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address(); const port = typeof addr === 'object' && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}/v1`;
  process.env.STRIPE_API_BASE = base;
  await runMigrations();
}, 90_000);

afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); await rm(OUTBOX, { recursive: true, force: true }); delete process.env.STRIPE_API_BASE; });

let R: { h: Record<string, string>; rid: string }; let OTHER: { h: Record<string, string>; rid: string }; let ADMIN: Record<string, string>;
let evtInvoiceId = ''; let invoiceId = '';

describe('préparation de l’encaissement', () => {
  it('sans prix configurés, l’état est « incomplet » et le dit sans détour', () => {
    const keep = process.env.STRIPE_PRICE_PRO; delete process.env.STRIPE_PRICE_PRO;
    const h = billingHealth();
    expect(h.ready).toBe(false); expect(h.ok).toBe(false); expect(h.mode).toBe('incomplet');
    expect(h.missing).toContain('STRIPE_PRICE_PRO'); expect(h.message).toMatch(/inachevé/);
    process.env.STRIPE_PRICE_PRO = keep;
  });

  it('avec clé + prix + webhook : opérationnel, et l’URL de webhook est indiquée', () => {
    const h = billingHealth();
    expect(h).toMatchObject({ ready: true, ok: true, mode: 'en_ligne', stripe: true, webhookReady: true });
    expect(h.webhookUrl).toBe('http://localhost:3000/api/billing/webhook');
    expect(h.seats).toMatchObject({ starter: 3, pro: 5, business: null });
    expect(h.publisher.complete).toBe(false); // SIRET/TVA non renseignés dans cet environnement : signalé
    expect(emitterComplete()).toBe(false);
  });
});

describe('souscription réelle (faux Stripe local)', () => {
  beforeAll(async () => { R = await reg('b7-resto@test.fr', 'Chez Awa'); OTHER = await reg('b7-autre@test.fr', 'Chez Kofi'); ADMIN = (await reg('admin@afrisupply.fr', 'Admin AFS')).h; });

  it('checkout : client créé (idempotent), abonnement Pro avec l’essai restant conservé', async () => {
    const r = await call('POST', '/api/billing/checkout', { plan: 'pro' }, R.h);
    expect(r.status).toBe(200); expect(r.json.url).toMatch(/^https:\/\/checkout\.stripe\.fake\//);
    const cus = fake.calls.find((c) => c.path === '/customers');
    expect(cus?.idempotency).toBe(`cus-${R.rid}`);
    const ck = fake.calls.find((c) => c.path === '/checkout/sessions'); expect(ck).toBeTruthy();
    const params = new URLSearchParams(ck!.body);
    expect(params.get('mode')).toBe('subscription');
    expect(params.get('line_items[0][price]')).toBe('price_pro');
    expect(params.get('customer')).toBe('cus_fake_1');
    expect(Number(params.get('subscription_data[trial_period_days]'))).toBeGreaterThan(0);   // essai non écourté
    expect(Number(params.get('subscription_data[trial_period_days]'))).toBeLessThanOrEqual(30);
    expect(params.get('subscription_data[metadata][restaurantId]')).toBe(R.rid);            // le webhook saura quel restaurant
    expect(params.get('success_url')).toContain('/app/abonnement?checkout=ok');
    const db = await getDb(); const [row] = await db.select().from(restaurants).where(eq(restaurants.id, R.rid));
    expect(row.stripeCustomerId).toBe('cus_fake_1');
  });

  it('un second checkout ne recrée pas de client (même identifiant Stripe)', async () => {
    const before = fake.calls.filter((c) => c.path === '/customers').length;
    await call('POST', '/api/billing/checkout', { plan: 'starter' }, R.h);
    expect(fake.calls.filter((c) => c.path === '/customers').length).toBe(before);
  });

  it('portail de facturation : URL obtenue (changement de formule, résiliation)', async () => {
    const r = await call('POST', '/api/billing/portal', undefined, R.h);
    expect(r.status).toBe(200); expect(r.json.url).toMatch(/^https:\/\/billing\.stripe\.fake\//);
  });

  it('GET /billing expose le prix réel, les sièges et l’état du guichet', async () => {
    const b = await call('GET', '/api/billing', undefined, R.h);
    expect(b.status).toBe(200);
    expect(b.json.stripe).toBe(true); expect(b.json.health.ok).toBe(true); expect(b.json.seats).toBe(5);
    expect(b.json.price).toMatchObject({ monthly: 89, list: 89 });
    expect(b.json.plans.find((p: Json) => p.id === 'pro').available).toBe(true);
  });
});

describe('webhook signé : facture encaissée, rejeu sans doublon, échec rejouable', () => {
  it('invoice.paid : abonnement actif + facture AFRISUPPLY enregistrée, PDF envoyé au restaurant', async () => {
    const periodStart = Math.floor(Date.now() / 1000) - 86_400;
    const periodEnd = periodStart + 30 * 86_400;
    evtInvoiceId = 'evt_inv_1';
    const r = await hook({ id: evtInvoiceId, type: 'invoice.paid', data: { object: { id: 'in_fake_1', object: 'invoice', customer: 'cus_fake_1', subscription: 'sub_fake_1', number: 'FAKE-0001', total: 10680, tax: 1780, paid: true, hosted_invoice_url: 'https://invoice.stripe.fake/in_fake_1', period_start: periodStart, period_end: periodEnd, lines: { data: [{ price: { id: 'price_pro' } }] } } } });
    expect(r.status).toBe(200); expect(r.json).toMatchObject({ received: true });
    const db = await getDb();
    const [resto] = await db.select().from(restaurants).where(eq(restaurants.id, R.rid));
    expect(resto.subscriptionStatus).toBe('active');
    expect(resto.plan).toBe('pro');   // la formule payée est appliquée dès l'encaissement
    const invs = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.restaurantId, R.rid));
    expect(invs).toHaveLength(1);
    const inv = invs[0]; invoiceId = inv.id;
    expect(inv.number).toMatch(/^AFR-\d{4}-\d{4}$/);
    expect(Number(inv.amountEur)).toBeCloseTo(89, 2);       // 106,80 € TTC − 17,80 € de TVA
    expect(Number(inv.vatRate)).toBe(20);
    expect(inv.source).toBe('stripe'); expect(inv.status).toBe('payee');
    expect(inv.stripeInvoiceId).toBe('in_fake_1'); expect(inv.hostedUrl).toMatch(/invoice\.stripe\.fake/);
    expect(inv.paidAt).toBeTruthy();
    const [evt] = await db.select().from(billingEvents).where(eq(billingEvents.id, evtInvoiceId));
    expect(evt.status).toBe('traite'); expect(evt.restaurantId).toBe(R.rid);
    const runs = await db.select().from(jobRuns).where(eq(jobRuns.job, 'invoice-mail'));
    expect(runs.length).toBeGreaterThan(0); expect(runs[0].status).toBe('ok');
    const files = await readdir(OUTBOX);
    const pdf = files.find((f) => f.endsWith('.pdf')); expect(pdf).toBeTruthy();
    const content = await readFile(path.join(OUTBOX, pdf!), 'latin1');
    expect(content.startsWith('%PDF-1.4')).toBe(true);
    expect(content).toContain(inv.number);
    expect(content).toContain('FACTURE');
    const mails = await Promise.all(files.filter((f) => f.endsWith('.txt')).map((f) => readFile(path.join(OUTBOX, f), 'utf8')));
    const factureMail = mails.find((m) => m.includes(inv.number));
    expect(factureMail).toBeTruthy();
    expect(factureMail).toMatch(/facture/i);
  });

  it('le même événement rejoué n’émet pas de seconde facture (idempotence)', async () => {
    const before = Date.now();
    const r = await hook({ id: evtInvoiceId, type: 'invoice.paid', data: { object: { id: 'in_fake_1', customer: 'cus_fake_1', subscription: 'sub_fake_1', total: 10680, paid: true } } });
    expect(r.status).toBe(200); expect(r.json.duplicate).toBe(true);
    const db = await getDb();
    const invs = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.restaurantId, R.rid));
    expect(invs).toHaveLength(1);
    expect(Date.now() - before).toBeLessThan(2000); // rejeu traité sans repasser par Stripe
  });

  it('panne Stripe passagère : 500 + « échec » tracé, puis rejeu identique qui aboutit', async () => {
    const evt = { id: 'evt_retry_1', type: 'checkout.session.completed', data: { object: { id: 'cs_fake_2', mode: 'subscription', subscription: 'sub_lent', customer: 'cus_fake_1' } } };
    const ko = await hook(evt);
    expect(ko.status).toBe(500); expect(ko.json.error).toMatch(/réessai/i);
    const db = await getDb();
    let [row] = await db.select().from(billingEvents).where(eq(billingEvents.id, 'evt_retry_1'));
    expect(row.status).toBe('echec'); expect(row.error).toMatch(/404|No such subscription/);
    // Stripe revient : le même événement est représenté et doit être retraité (pas classé « doublon »).
    fake.subs.sub_lent = { id: 'sub_lent', object: 'subscription', customer: 'cus_fake_1', status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400, items: { data: [{ price: { id: 'price_starter' } }] }, metadata: { restaurantId: R.rid, plan: 'starter' } };
    const ok = await hook(evt);
    expect(ok.status).toBe(200); expect(ok.json.duplicate).toBeUndefined();
    [row] = await db.select().from(billingEvents).where(eq(billingEvents.id, 'evt_retry_1'));
    expect(row.status).toBe('traite'); expect(row.error).toBeNull();
    const [resto] = await db.select().from(restaurants).where(eq(restaurants.id, R.rid));
    expect(resto.plan).toBe('starter'); expect(resto.subscriptionStatus).toBe('active');
  });

  it('signature absente ou falsifiée : refusée, rien n’est écrit', async () => {
    const db = await getDb();
    const countBefore = (await db.select().from(billingEvents)).length;
    const raw = JSON.stringify({ id: 'evt_unsigned', type: 'invoice.paid', data: { object: { id: 'in_x', customer: 'cus_fake_1' } } });
    expect((await call('POST', '/api/billing/webhook', raw)).status).toBe(400);
    expect((await call('POST', '/api/billing/webhook', raw, { 'stripe-signature': 't=1,v1=deadbeef' })).status).toBe(400);
    expect((await db.select().from(billingEvents)).length).toBe(countBefore);
  });

  it('échec de paiement : abonnement en retard, sans couper l’accès immédiatement', async () => {
    const r = await hook({ id: 'evt_failed_1', type: 'invoice.payment_failed', data: { object: { id: 'in_fake_2', customer: 'cus_fake_1', subscription: 'sub_lent' } } });
    expect(r.status).toBe(200);
    const db = await getDb(); const [resto] = await db.select().from(restaurants).where(eq(restaurants.id, R.rid));
    expect(resto.subscriptionStatus).toBe('past_due');
  });
});

describe('factures : consultation, PDF, envoi, étanchéité', () => {
  it('le restaurant liste ses factures et télécharge le PDF', async () => {
    const db = await getDb(); await db.update(restaurants).set({ subscriptionStatus: 'active' }).where(eq(restaurants.id, R.rid));
    const l = await call('GET', '/api/billing/invoices', undefined, R.h);
    expect(l.status).toBe(200); expect(l.json.invoices).toHaveLength(1);
    const pdf = await call('GET', `/api/billing/invoices/${invoiceId}/pdf`, undefined, R.h);
    expect(pdf.status).toBe(200);
    expect(pdf.raw.headers.get('content-type')).toBe('application/pdf');
    expect(pdf.raw.headers.get('content-disposition')).toContain('.pdf');
  });

  it('un autre restaurant ne voit ni ne télécharge la facture (404)', async () => {
    const l = await call('GET', '/api/billing/invoices', undefined, OTHER.h);
    expect(l.status).toBe(200); expect(l.json.invoices).toHaveLength(0);
    expect((await call('GET', `/api/billing/invoices/${invoiceId}/pdf`, undefined, OTHER.h)).status).toBe(404);
    expect((await call('POST', `/api/billing/invoices/${invoiceId}/send`, undefined, OTHER.h)).status).toBe(404);
  });

  it('la facture s’envoie à l’adresse de facturation du restaurant (paramètre billingEmail)', async () => {
    // L'adresse de facturation se règle depuis la page Paramètres (PUT /settings), pas par SQL.
    const put = await call('PUT', '/api/settings', { billingEmail: 'compta@chezawa.fr' }, R.h);
    expect(put.status).toBe(200); expect(put.json.settings.billingEmail).toBe('compta@chezawa.fr');
    expect(await billingRecipient(R.rid)).toBe('compta@chezawa.fr');
    expect((await call('PUT', '/api/settings', { billingEmail: 'pas-un-email' }, R.h)).status).toBe(400);
    const sent = await call('POST', `/api/billing/invoices/${invoiceId}/send`, undefined, R.h);
    expect(sent.status).toBe(200); expect(sent.json.sent).toBe(true);
    const files = (await readdir(OUTBOX)).filter((f) => f.endsWith('.txt')).sort();
    const last = await readFile(path.join(OUTBOX, files[files.length - 1]), 'utf8');
    expect(last.split('\n')[0]).toBe('To: compta@chezawa.fr');
  });

  it('numérotation séquentielle continue (AFR-AAAA-NNNN) et idempotence par facture Stripe', async () => {
    const n1 = await nextInvoiceNumber(new Date());
    const n2 = await nextInvoiceNumber(new Date());
    expect(n1).toMatch(/^AFR-\d{4}-\d{4}$/); expect(Number(n2.split('-')[2])).toBe(Number(n1.split('-')[2]) + 1);
    const a = await recordSubscriptionInvoice({ restaurantId: R.rid, plan: 'pro', amountEur: 89, stripeInvoiceId: 'in_double', source: 'stripe' , periodStart: new Date(), periodEnd: new Date() });
    const b = await recordSubscriptionInvoice({ restaurantId: R.rid, plan: 'pro', amountEur: 89, stripeInvoiceId: 'in_double', source: 'stripe', periodStart: new Date(), periodEnd: new Date() });
    expect(a.created).toBe(true); expect(b.created).toBe(false); expect(b.invoice.id).toBe(a.invoice.id);
  });
});

describe('admin : bascule manuelle, encaissement, absence de bouton trompeur', () => {
  it('seul un administrateur peut encaisser ou basculer une formule', async () => {
    expect((await call('POST', `/api/admin/billing/restaurants/${OTHER.rid}/invoice`, {}, R.h)).status).toBe(403);
    expect((await call('PUT', `/api/admin/billing/invoices/${invoiceId}`, { status: 'payee' }, R.h)).status).toBe(403);
  });

  it('facture manuelle (virement) émise, envoyée, puis marquée payée', async () => {
    const r = await call('POST', `/api/admin/billing/restaurants/${OTHER.rid}/invoice`, { months: 1, note: 'virement reçu à réception' }, ADMIN);
    expect(r.status).toBe(201);
    const inv = r.json.invoice;
    expect(inv.number).toMatch(/^AFR-\d{4}-\d{4}$/); expect(inv.source).toBe('manuel'); expect(inv.status).toBe('ouverte'); expect(inv.paidAt).toBeNull();
    expect(Number(inv.amountEur)).toBeCloseTo(39, 2);  // Chez Kofi est en essai → tarif Starter public
    const pdfs = (await readdir(OUTBOX)).filter((f) => f.endsWith('.pdf'));
    expect(pdfs.length).toBeGreaterThanOrEqual(2); // facture Stripe + facture manuelle
    const dernier = await readFile(path.join(OUTBOX, pdfs[pdfs.length - 1]), 'latin1');
    expect(dernier).toContain(inv.number); expect(dernier).toContain('virement');
    const paid = await call('PUT', `/api/admin/billing/invoices/${inv.id}`, { status: 'payee' }, ADMIN);
    expect(paid.status).toBe(200); expect(paid.json.invoice.status).toBe('payee'); expect(paid.json.invoice.paidAt).toBeTruthy();
    const db = await getDb();
    const [row] = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.id, inv.id));
    expect(row.note).toMatch(/virement/);
  });

  it('la synthèse admin donne la MRR réelle, les sièges et l’état du guichet', async () => {
    const d = await call('GET', '/api/admin/billing', undefined, ADMIN);
    expect(d.status).toBe(200);
    expect(d.json.mrr.total).toBeGreaterThan(0); expect(d.json.mrr.subscribers).toBeGreaterThan(0);
    expect(d.json.health.ok).toBe(true); expect(d.json.subscriptions.length).toBeGreaterThan(0);
    expect(d.json.restaurants.every((r: Json) => 'seats' in r)).toBe(true);
  });

  it('/billing/health est consultable sans authentification et ne divulgue pas de données client', async () => {
    const h = await call('GET', '/api/billing/health');
    expect(h.status).toBe(200);
    expect(JSON.stringify(h.json)).not.toMatch(/cus_fake|sk_test|in_fake/);
  });
});
