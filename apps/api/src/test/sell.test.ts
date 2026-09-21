// Chantier 6 (audit) — « Prêt à vendre » : une offre → paiement (coupon fondateur appliqué dans la
// session), mails du parcours payant (welcome / activation), preuve publique HONNÊTE (aucun témoignage
// inventé, jamais d'avis non publié), et contrat PLANS web ↔ api (garde anti-dérive, chantier 3).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { feedback, getDb, restaurantMembers, restaurants, runMigrations, users } from '@afrisupply/db';
import { app } from '../app.js';
import { hashPassword, signToken } from '../lib/auth';
import { PLAN_PRICES } from '../lib/billing';
import { FOUNDER_OFFER, PLANS } from '../routes/public';
import { PLANS as WEB_PLANS, FOUNDER as WEB_FOUNDER } from '../../../web/src/lib/plans';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PGLITE_DIR = 'memory://sell';
process.env.BILLING_ENFORCE = 'true';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_PRICE_STARTER = 'price_starter';
process.env.STRIPE_PRICE_PRO = 'price_pro';
process.env.STRIPE_PRICE_BUSINESS = 'price_business';
process.env.STRIPE_COUPON_FOUNDER = 'coupon_founder';

let dir: string;
let token: string;
let rid: string;
let ownerEmail: string;

beforeAll(async () => {
  await runMigrations();
  dir = await mkdtemp(path.join(tmpdir(), 'sell-'));
  process.env.EMAIL_MODE = 'outbox';
  process.env.MAIL_OUTBOX_DIR = dir;
  const db = await getDb();
  const [u] = await db.insert(users).values({ email: 'sell@test.ci', passwordHash: await hashPassword('MotDePasse!123'), fullName: 'Awa Vendeuse' }).returning();
  // Restaurant « fondateur » (invité pilote) : c'est lui qui reçoit le coupon −50 % dans sa session.
  const [r] = await db.insert(restaurants).values({ name: 'Maquis Sell', slug: 'maquis-sell', plan: 'trial', founder: true, trialEndsAt: new Date(Date.now() + 30 * 86_400_000) }).returning();
  await db.insert(restaurantMembers).values({ restaurantId: r.id, userId: u.id, role: 'owner' });
  rid = r.id;
  ownerEmail = u.email;
  token = await signToken({ id: u.id, email: u.email, fullName: u.fullName, tokenVersion: 0 });
});

const outboxTexts = async () => {
  const files = await readdir(dir);
  return Promise.all(files.filter((f) => f.endsWith('.txt')).map((f) => readFile(path.join(dir, f), 'utf8')));
};

describe('Contrat PLANS web ↔ api (anti-dérive)', () => {
  it('mêmes offres 39/89/199 et même offre fondateur des deux côtés', () => {
    expect(WEB_PLANS.map((p) => p.id)).toEqual(PLANS.map((p) => p.id));
    expect(WEB_PLANS.map((p) => p.priceMonthly)).toEqual(PLANS.map((p) => p.priceMonthly));
    expect(WEB_FOUNDER.discountPct).toBe(FOUNDER_OFFER.discountPct);
    expect(WEB_FOUNDER.seats).toBe(FOUNDER_OFFER.seats);
    expect(WEB_FOUNDER.trialDays).toBe(FOUNDER_OFFER.trialDays);
    // 3ᵉ source (facturation) : mêmes prix que la carte publique
    expect(Object.fromEntries(PLANS.map((p) => [p.id, p.priceMonthly]))).toEqual(PLAN_PRICES);
  });
});

describe('Self-service : une offre → un checkout Stripe', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: `cs_${calls.length}`, url: `https://stripe.test/${calls.length}`, customer: `cus_${calls.length}` }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
  });
  afterAll(() => vi.unstubAllGlobals());

  for (const plan of ['starter', 'pro', 'business'] as const) {
    it(`checkout ${plan} : prix, coupon fondateur, report d'essai, retour Abonnement`, async () => {
      const res = await app.request('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      expect(res.status).toBe(200);
      const { url } = (await res.json()) as { url: string };
      expect(url).toContain('stripe.test');
      const last = calls.at(-1)!;
      expect(String(last.url)).toContain('checkout/sessions');
      const form = new URLSearchParams(String(last.init.body));
      expect(form.get('mode')).toBe('subscription');
      expect(form.get('line_items[0][price]')).toBe(`price_${plan}`);
      expect(form.get('line_items[0][quantity]')).toBe('1');
      expect(form.get('subscription_data[metadata][restaurantId]')).toBe(rid);
      expect(form.get('subscription_data[metadata][plan]')).toBe(plan);
      // Offre pilote fondateur : coupon −50 % appliqué DANS la session (pas un code à retaper).
      // allow_promotion_codes est retiré : Stripe interdit les deux ensemble.
      expect(form.get('discounts[0][coupon]')).toBe('coupon_founder');
      expect(form.get('allow_promotion_codes')).toBeNull();
      // L'essai en cours (30 j) est reporté sur l'abonnement — jamais de double période gratuite.
      expect(Number(form.get('subscription_data[trial_period_days]'))).toBe(30);
      expect(form.get('success_url')).toContain('/app/abonnement');
    });
  }

  it('non-fondateur : pas de coupon imposé, codes promo autorisés', async () => {
    const db = await getDb();
    const [u2] = await db.insert(users).values({ email: 'nofounder@test.ci', passwordHash: await hashPassword('MotDePasse!123'), fullName: 'Kofi Client' }).returning();
    const [r2] = await db.insert(restaurants).values({ name: 'Chez Kofi', slug: 'chez-kofi', plan: 'trial', trialEndsAt: new Date(Date.now() + 10 * 86_400_000) }).returning();
    await db.insert(restaurantMembers).values({ restaurantId: r2.id, userId: u2.id, role: 'owner' });
    const t2 = await signToken({ id: u2.id, email: u2.email, fullName: u2.fullName, tokenVersion: 0 });
    const res = await app.request('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${t2}` },
      body: JSON.stringify({ plan: 'pro' }),
    });
    expect(res.status).toBe(200);
    const form = new URLSearchParams(String(calls.at(-1)!.init.body));
    expect(form.get('allow_promotion_codes')).toBe('true');
    expect(form.get('discounts[0][coupon]')).toBeNull();
    // essai restant reporté (10 j ici)
    expect(Number(form.get('subscription_data[trial_period_days]'))).toBe(10);
  });

  it('plan inconnu : 400', async () => {
    const res = await app.request('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan: 'premium' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('Mails du parcours payant', () => {
  it("welcome à l'inscription : lien /app/demarrer, cap 20 minutes", async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'welcome@test.ci', password: 'MotDePasse!123', fullName: 'Fatou Démo', restaurantName: 'Chez Fatou', city: 'Nantes', coversPerDay: 40 }),
    });
    expect(res.status).toBe(201);
    const mail = (await outboxTexts()).find((t) => t.includes('welcome@test.ci') && t.includes('bienvenue'));
    expect(mail).toBeDefined();
    expect(mail).toContain('/app/demarrer');
    expect(mail).toContain('20 minutes');
  });

  it('subscription_active à la transition active du webhook (pas à chaque renouvellement)', async () => {
    const body = JSON.stringify({
      id: 'evt_act_1', type: 'customer.subscription.updated',
      data: { object: { id: 'sub_act_1', customer: 'cus_act_1', status: 'active', cancel_at_period_end: false, current_period_end: Math.floor((Date.now() + 30 * 86400_000) / 1000), items: { data: [{ price: { id: 'price_pro' } }] }, metadata: { restaurantId: rid, plan: 'pro' } } },
    });
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac('sha256', 'whsec_test').update(`${t}.${body}`).digest('hex');
    const res = await app.request('/api/billing/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${t},v1=${v1}` },
      body,
    });
    expect(res.status).toBe(200);
    const mail = (await outboxTexts()).find((m) => m.includes(ownerEmail) && m.includes('abonnement pro est actif'));
    expect(mail).toBeDefined();
    expect(mail).toContain('Maquis Sell');
  });
});

describe('GET /public/proof — preuve honnête', () => {
  it('départ : aucun témoignage inventé, metrics réelles', async () => {
    const res = await app.request('/api/public/proof');
    expect(res.status).toBe(200);
    const d = (await res.json()) as { testimonials: unknown[]; metrics: { referenceProducts: number; recipeTemplates: number; nps: number | null; npsResponses: number; founderSeats: number } };
    expect(d.testimonials).toEqual([]);
    expect(d.metrics.referenceProducts).toBe(324);
    expect(d.metrics.recipeTemplates).toBe(31);
    expect(d.metrics.nps).toBeNull();
    expect(d.metrics.npsResponses).toBe(0);
    expect(d.metrics.founderSeats).toBe(FOUNDER_OFFER.seats);
  });

  it('un avis publié apparaît ; un avis non publié ne fuite jamais ; NPS = moyenne avec n', async () => {
    const db = await getDb();
    await db.insert(feedback).values({ restaurantId: rid, kind: 'nps', score: 9, message: 'Excellent comparateur, la facture riz a baissé.', published: true });
    await db.insert(feedback).values({ restaurantId: rid, kind: 'nps', score: 10, message: 'AVIS NON PUBLIE secret', published: false });
    const res = await app.request('/api/public/proof');
    const raw = await res.text();
    expect(raw).not.toContain('secret');
    const d = JSON.parse(raw) as { testimonials: { quote: string }[]; metrics: { nps: number | null; npsResponses: number } };
    expect(d.testimonials).toHaveLength(1);
    expect(d.testimonials[0].quote).toContain('comparateur');
    expect(d.metrics.npsResponses).toBe(2);
    expect(d.metrics.nps).toBe(9.5);
    // nettoyage pour l'idempotence des runs
    await db.delete(feedback).where(eq(feedback.restaurantId, rid));
  });
});
