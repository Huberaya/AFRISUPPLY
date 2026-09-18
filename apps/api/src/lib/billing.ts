// Chantier 6 — Facturation : abonnements restaurants (Stripe Checkout + Portal + webhooks) et factures de commission
// des fournisseurs plateforme. Client Stripe minimal en fetch (pas de SDK : bundle Vercel léger, API stable).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, restaurants } from '@afrisupply/db';

export type PlanId = 'starter' | 'pro' | 'business';
export const PLAN_RANK: Record<string, number> = { trial: 2, starter: 1, pro: 2, business: 3 }; // l'essai donne les fonctions Pro
export const PLAN_PRICES: Record<PlanId, number> = { starter: 39, pro: 89, business: 199 };

export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
export const billingEnforced = () => process.env.BILLING_ENFORCE === 'true' || (stripeConfigured() && process.env.BILLING_ENFORCE !== 'false');
export const priceIdFor = (plan: PlanId) => process.env[`STRIPE_PRICE_${plan.toUpperCase()}`] ?? null;
const APP = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Appel Stripe form-encoded (comme le SDK). */
export async function stripe<T = Record<string, unknown>>(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, unknown> = {}, opts: { idempotencyKey?: string } = {}): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY; if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  const body = new URLSearchParams(); const enc = (prefix: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => enc(`${prefix}[${i}]`, x));
    else if (typeof v === 'object') Object.entries(v as Record<string, unknown>).forEach(([k, x]) => enc(`${prefix}[${k}]`, x));
    else body.append(prefix, String(v));
  };
  Object.entries(params).forEach(([k, v]) => enc(k, v));
  const url = `https://api.stripe.com/v1${path}${method === 'GET' && body.size ? `?${body}` : ''}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, 'Stripe-Version': '2024-06-20' };
  if (method !== 'GET') headers['content-type'] = 'application/x-www-form-urlencoded';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  const res = await fetch(url, { method, headers, body: method === 'GET' ? undefined : body });
  const json = await res.json() as T & { error?: { message: string } };
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${json.error?.message ?? 'erreur'}`);
  return json;
}

/** Vérifie la signature d'un webhook Stripe (header Stripe-Signature, schéma v1). */
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret = process.env.STRIPE_WEBHOOK_SECRET, toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t); const v1 = parts.v1; if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(v1)); } catch { return false; }
}

/** Client Stripe du restaurant (créé au besoin). */
export async function ensureCustomer(rid: string, email: string) {
  const db = await getDb();
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  if (r.stripeCustomerId) return r.stripeCustomerId;
  const cus = await stripe<{ id: string }>('POST', '/customers', { email, name: r.name, metadata: { restaurantId: rid } }, { idempotencyKey: `cus-${rid}` });
  await db.update(restaurants).set({ stripeCustomerId: cus.id }).where(eq(restaurants.id, rid));
  return cus.id;
}

export async function createCheckout(rid: string, email: string, plan: PlanId) {
  const price = priceIdFor(plan); if (!price) throw new Error(`Prix Stripe non configuré pour ${plan} (STRIPE_PRICE_${plan.toUpperCase()})`);
  const db = await getDb(); const [r] = await db.select().from(restaurants).where(eq(restaurants.id, rid));
  const customer = await ensureCustomer(rid, email);
  const trialLeft = r.trialEndsAt ? Math.ceil((new Date(r.trialEndsAt).getTime() - Date.now()) / 86_400_000) : 0;
  const params: Record<string, unknown> = {
    mode: 'subscription', customer, line_items: [{ price, quantity: 1 }], locale: 'fr', allow_promotion_codes: true,
    success_url: `${APP()}/app/abonnement?checkout=ok&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${APP()}/app/abonnement?checkout=annule`,
    subscription_data: { metadata: { restaurantId: rid, plan }, ...(trialLeft > 1 ? { trial_period_days: Math.min(trialLeft, 30) } : {}) }, // l'essai en cours est conservé
    metadata: { restaurantId: rid, plan }, customer_update: { address: 'auto', name: 'auto' }, tax_id_collection: { enabled: true }, billing_address_collection: 'required',
  };
  if (r.founder && process.env.STRIPE_COUPON_FOUNDER) params.discounts = [{ coupon: process.env.STRIPE_COUPON_FOUNDER }];
  if (params.discounts) delete params.allow_promotion_codes; // Stripe refuse les deux à la fois
  return stripe<{ id: string; url: string }>('POST', '/checkout/sessions', params);
}

export async function createPortal(rid: string, email: string) {
  const customer = await ensureCustomer(rid, email);
  return stripe<{ url: string }>('POST', '/billing_portal/sessions', { customer, locale: 'fr', return_url: `${APP()}/app/abonnement` });
}

const STATUS_MAP: Record<string, string> = { trialing: 'trialing', active: 'active', past_due: 'past_due', unpaid: 'past_due', canceled: 'canceled', incomplete: 'trialing', incomplete_expired: 'canceled', paused: 'canceled' };

/** Applique un abonnement Stripe (objet subscription) au restaurant. */
export async function applySubscription(sub: { id: string; customer: string; status: string; current_period_end?: number; items?: { data: { price: { id: string } }[] }; metadata?: Record<string, string>; cancel_at_period_end?: boolean }) {
  const db = await getDb();
  const rid = sub.metadata?.restaurantId; const priceId = sub.items?.data?.[0]?.price?.id;
  const plan = (['starter', 'pro', 'business'] as PlanId[]).find((p) => priceIdFor(p) === priceId) ?? (sub.metadata?.plan as PlanId | undefined);
  const where = rid ? eq(restaurants.id, rid) : eq(restaurants.stripeCustomerId, sub.customer);
  const status = STATUS_MAP[sub.status] ?? sub.status;
  const patch: Partial<typeof restaurants.$inferInsert> = { stripeSubscriptionId: sub.id, subscriptionStatus: status, currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null };
  if (plan && status !== 'canceled') patch.plan = plan;
  if (status === 'canceled') patch.plan = 'trial'; // retour en lecture seule (essai expiré) après résiliation
  await db.update(restaurants).set(patch).where(where);
  return { rid, plan, status };
}

/** Situation d'accès d'un restaurant : essai actif, abonné, en retard, expiré. */
export function accessState(r: { plan: string; trialEndsAt: Date | null; subscriptionStatus: string; currentPeriodEnd: Date | null }, now = new Date()) {
  const trialDaysLeft = r.trialEndsAt ? Math.ceil((r.trialEndsAt.getTime() - now.getTime()) / 86_400_000) : null;
  if (r.subscriptionStatus === 'active') return { state: 'active' as const, trialDaysLeft, blocked: false };
  if (r.subscriptionStatus === 'past_due') { const grace = r.currentPeriodEnd ? (now.getTime() - r.currentPeriodEnd.getTime()) / 86_400_000 : 0; return { state: 'past_due' as const, trialDaysLeft, blocked: grace > 14 }; }
  if (r.subscriptionStatus === 'canceled' || r.subscriptionStatus === 'expired') return { state: 'expired' as const, trialDaysLeft, blocked: true };
  if (trialDaysLeft !== null && trialDaysLeft <= 0) return { state: 'expired' as const, trialDaysLeft, blocked: true };
  return { state: 'trialing' as const, trialDaysLeft, blocked: false };
}

/** Passe en « expired » les essais terminés sans abonnement (job quotidien) ; renvoie ceux à relancer (J-7, J-3, J-1). */
export async function sweepTrials(now = new Date()) {
  const db = await getDb();
  const rows = await db.select().from(restaurants).where(and(eq(restaurants.subscriptionStatus, 'trialing'), isNull(restaurants.stripeSubscriptionId)));
  const expired: string[] = []; const reminders: { id: string; name: string; daysLeft: number }[] = [];
  for (const r of rows) {
    const s = accessState(r, now);
    if (s.state === 'expired') { await db.update(restaurants).set({ subscriptionStatus: 'expired' }).where(eq(restaurants.id, r.id)); expired.push(r.id); }
    else if (s.trialDaysLeft !== null && [7, 3, 1].includes(s.trialDaysLeft)) reminders.push({ id: r.id, name: r.name, daysLeft: s.trialDaysLeft });
  }
  return { expired, reminders };
}
