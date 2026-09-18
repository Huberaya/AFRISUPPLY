// Chantier 6 : états d'accès, blocage 402, webhook Stripe signé (idempotent), factures de commission, admin fondateur.
import { describe, it, expect, beforeAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { runMigrations, getDb, restaurants, commissions, vendors } from '@afrisupply/db';
import { accessState, verifyStripeSignature, sweepTrials } from '../lib/billing.js';
import { app } from '../app.js';

process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-secret'; process.env.PGLITE_DIR = 'memory://billing'; process.env.ADMIN_EMAILS = 'admin@afrisupply.fr';
process.env.BILLING_ENFORCE = 'true'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'; delete process.env.STRIPE_SECRET_KEY; process.env.VENDOR_AUTO_APPROVE = 'true';
type Json = Record<string, any>;
const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
  let json: Json = {}; try { json = await res.json(); } catch { /* */ } return { status: res.status, json };
};
const reg = async (email: string, restaurantName: string) => { const r = await call('POST', '/api/auth/register', { email, password: 'motdepasse1', fullName: 'Test', restaurantName, city: 'Nantes' }); return { h: { authorization: `Bearer ${r.json.token}` }, rid: r.json.restaurant.id as string }; };
const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex')}`;

let R: { h: Record<string, string>; rid: string }; let ADM: Record<string, string>;
beforeAll(async () => { await runMigrations(); R = await reg('r@resto.fr', 'Resto'); ADM = (await reg('admin@afrisupply.fr', 'Admin')).h; }, 60_000);

describe('accessState', () => {
  const d = (n: number) => new Date(Date.now() + n * 86_400_000);
  it('essai en cours / expiré / abonné / retard de paiement', () => {
    expect(accessState({ plan: 'trial', trialEndsAt: d(10), subscriptionStatus: 'trialing', currentPeriodEnd: null })).toMatchObject({ state: 'trialing', blocked: false, trialDaysLeft: 10 });
    expect(accessState({ plan: 'trial', trialEndsAt: d(-1), subscriptionStatus: 'trialing', currentPeriodEnd: null })).toMatchObject({ state: 'expired', blocked: true });
    expect(accessState({ plan: 'pro', trialEndsAt: d(-40), subscriptionStatus: 'active', currentPeriodEnd: d(20) })).toMatchObject({ state: 'active', blocked: false });
    expect(accessState({ plan: 'pro', trialEndsAt: null, subscriptionStatus: 'past_due', currentPeriodEnd: d(-3) })).toMatchObject({ state: 'past_due', blocked: false }); // 14 j de grâce
    expect(accessState({ plan: 'pro', trialEndsAt: null, subscriptionStatus: 'past_due', currentPeriodEnd: d(-20) })).toMatchObject({ state: 'past_due', blocked: true });
  });
  it('signature Stripe : valide, altérée, trop vieille', () => {
    expect(verifyStripeSignature('{"a":1}', sign('{"a":1}'))).toBe(true);
    expect(verifyStripeSignature('{"a":2}', sign('{"a":1}'))).toBe(false);
    expect(verifyStripeSignature('{"a":1}', sign('{"a":1}', Math.floor(Date.now() / 1000) - 1000))).toBe(false);
    expect(verifyStripeSignature('{"a":1}', undefined)).toBe(false);
  });
});

describe('abonnement (API)', () => {
  it('GET /billing : essai 30 j, formules, Stripe non configuré → checkout 503 avec message humain', async () => {
    const b = await call('GET', '/api/billing', undefined, R.h); expect(b.status).toBe(200); expect(b.json).toMatchObject({ plan: 'trial', state: 'trialing', enforced: true, stripe: false }); expect(b.json.trialDaysLeft).toBeGreaterThanOrEqual(29); expect(b.json.plans).toHaveLength(3);
    const ck = await call('POST', '/api/billing/checkout', { plan: 'pro' }, R.h); expect(ck.status).toBe(503); expect(ck.json.error).toMatch(/bonjour@afrisupply.fr/);
  });
  it('en essai : tout le Pro est accessible ; en Starter payant : prévision → 402 plan_required', async () => {
    expect((await call('GET', '/api/forecast', undefined, R.h)).status).toBe(200);
    const db = await getDb(); await db.update(restaurants).set({ plan: 'starter', subscriptionStatus: 'active' }).where(eq(restaurants.id, R.rid));
    const f = await call('GET', '/api/forecast', undefined, R.h); expect(f.status).toBe(402); expect(f.json).toMatchObject({ code: 'plan_required', plan: 'pro' });
    expect((await call('GET', '/api/stock', undefined, R.h)).status).toBe(200); // Starter garde le stock
    expect((await call('GET', '/api/marketplace/group-buys', undefined, R.h)).json.plan).toBe('business');
  });
  it('essai expiré : lecture OK, écriture 402 subscription_required, /billing reste accessible', async () => {
    const db = await getDb(); await db.update(restaurants).set({ plan: 'trial', subscriptionStatus: 'trialing', trialEndsAt: new Date(Date.now() - 86_400_000) }).where(eq(restaurants.id, R.rid));
    expect((await call('GET', '/api/stock', undefined, R.h)).status).toBe(200);
    const w = await call('POST', '/api/sales', { lines: [] }, R.h); expect(w.status).toBe(402); expect(w.json.code).toBe('subscription_required');
    expect((await call('GET', '/api/billing', undefined, R.h)).json.state).toBe('expired');
    const sw = await sweepTrials(); expect(sw.expired).toContain(R.rid);
    expect((await db.select().from(restaurants).where(eq(restaurants.id, R.rid)))[0].subscriptionStatus).toBe('expired');
  });
  it('webhook : signature requise, subscription.updated active le plan Pro, événement rejoué ignoré, résiliation → trial/expiré', async () => {
    process.env.STRIPE_PRICE_PRO = 'price_pro_test';
    const db = await getDb(); await db.update(restaurants).set({ stripeCustomerId: 'cus_test' }).where(eq(restaurants.id, R.rid));
    const evt = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_test', status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400, items: { data: [{ price: { id: 'price_pro_test' } }] }, metadata: { restaurantId: R.rid } } } });
    expect((await call('POST', '/api/billing/webhook', evt, { 'stripe-signature': 't=1,v1=bad' })).status).toBe(400);
    expect((await call('POST', '/api/billing/webhook', evt, { 'stripe-signature': sign(evt) })).json).toEqual({ received: true });
    let b = await call('GET', '/api/billing', undefined, R.h); expect(b.json).toMatchObject({ plan: 'pro', state: 'active', hasSubscription: true });
    expect((await call('POST', '/api/sales', { lines: [] }, R.h)).status).not.toBe(402);
    expect((await call('POST', '/api/billing/webhook', evt, { 'stripe-signature': sign(evt) })).json.duplicate).toBe(true);
    const fail = JSON.stringify({ id: 'evt_2', type: 'invoice.payment_failed', data: { object: { id: 'in_1', customer: 'cus_test' } } });
    await call('POST', '/api/billing/webhook', fail, { 'stripe-signature': sign(fail) }); expect((await call('GET', '/api/billing', undefined, R.h)).json.state).toBe('past_due');
    const del = JSON.stringify({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_test', status: 'canceled', metadata: { restaurantId: R.rid } } } });
    await call('POST', '/api/billing/webhook', del, { 'stripe-signature': sign(del) }); b = await call('GET', '/api/billing', undefined, R.h); expect(b.json).toMatchObject({ plan: 'trial', state: 'expired', blocked: true });
  });
  it('admin : fondateur + prolongation d’essai réactive le compte ; MRR', async () => {
    expect((await call('GET', '/api/admin/billing', undefined, R.h)).status).toBe(403);
    const u = await call('PUT', `/api/admin/billing/restaurants/${R.rid}`, { founder: true, extendTrialDays: 30, subscriptionStatus: 'trialing' }, ADM); expect(u.json.restaurant.founder).toBe(true);
    const b = await call('GET', '/api/billing', undefined, R.h); expect(b.json).toMatchObject({ state: 'trialing', founder: true }); expect(b.json.trialDaysLeft).toBeGreaterThanOrEqual(29);
    const a = await call('GET', '/api/admin/billing', undefined, ADM); expect(a.json.founders).toBe(1); expect(a.json.founderSeatsLeft).toBe(19);
  });
});

describe('factures de commission', () => {
  it('agrège les commissions du mois par fournisseur, envoie un relevé par e-mail (sans Stripe), marque invoiced, idempotent', async () => {
    const db = await getDb();
    const V = (await reg('gros@sahel.fr', 'Grossiste')).h;
    const v = (await call('POST', '/api/vendor/register', { name: 'Sahel', deliveryZones: ['France'], categories: ['epicerie'], contactEmail: 'compta@sahel.fr' }, V)).json.vendor;
    expect(v.status).toBe('actif');
    // deux vraies commandes plateforme confirmées (commission 3 %) puis période forcée à 2026-08
    const t0 = await call('GET', '/api/onboarding/templates', undefined, R.h); await call('POST', '/api/onboarding/apply', { templates: t0.json.templates.slice(0, 1).map((x: Json) => x.id ?? x.name) }, R.h);
    const productId = (await call('GET', '/api/stock', undefined, R.h)).json.items[0].productId;
    const offer = (await call('POST', '/api/vendor/offers', { productId, packLabel: 'sac', packQty: 10, packPrice: 50 }, V)).json.offer;
    for (const packs of [2, 1]) { const o = await call('POST', `/api/marketplace/vendors/${v.id}/orders`, { lines: [{ vendorOfferId: offer.id, packs }] }, R.h); expect(o.status).toBe(201); expect((await call('POST', `/api/vendor/orders/${o.json.order.id}/confirm`, {}, V)).status).toBe(200); }
    await db.update(commissions).set({ period: '2026-08' }).where(eq(commissions.vendorId, v.id));
    const dry = await call('POST', '/api/admin/billing/commissions/invoice', { period: '2026-08', dryRun: true }, ADM);
    expect(dry.json.invoices.length).toBe(1);
    expect(dry.json.invoices[0]).toMatchObject({ vendorName: 'Sahel', orders: 2, base: 150, amount: 4.5, via: 'mail' });
    const real = await call('POST', '/api/admin/billing/commissions/invoice', { period: '2026-08' }, ADM); expect(real.json.invoices[0].via).toBe('mail');
    const again = await call('POST', '/api/admin/billing/commissions/invoice', { period: '2026-08' }, ADM); expect(again.json.invoices).toHaveLength(0);
    expect((await call('GET', '/api/admin/billing', undefined, ADM)).json.invoices[0]).toMatchObject({ period: '2026-08', status: 'envoyee_par_mail' });
    void vendors;
  });
});
