// Chantier 25 — Paiement en ligne des commandes marketplace (Stripe Connect Express + Checkout, commission prélevée à la source).
// Aucun SDK : on réutilise le client fetch de lib/billing.ts. Sans STRIPE_SECRET_KEY, tout répond « non disponible » proprement.
import { and, eq } from 'drizzle-orm';
import { getDb, orders, vendors, restaurants } from '@afrisupply/db';
import { stripe, stripeConfigured } from './billing.js';
import { logOrderEvent } from './order-events.js';

const APP = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const n = (v: string | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
export const cents = (eur: number) => Math.round(eur * 100);

export type PaymentAvailability = { available: boolean; reason?: 'stripe_off' | 'vendor_not_onboarded' | 'already_paid' | 'not_payable' };

/** Le paiement en ligne est-il possible pour cette commande ? (Stripe actif, grossiste onboardé, reste dû > 0) */
export async function paymentAvailability(o: typeof orders.$inferSelect, v: Pick<typeof vendors.$inferSelect, 'stripeAccountId' | 'stripePayoutsEnabled'>): Promise<PaymentAvailability> {
  if (o.paidAt) return { available: false, reason: 'already_paid' };
  if (['brouillon', 'preparee', 'annulee'].includes(o.status)) return { available: false, reason: 'not_payable' };
  if (!stripeConfigured()) return { available: false, reason: 'stripe_off' };
  if (!v.stripeAccountId || !v.stripePayoutsEnabled) return { available: false, reason: 'vendor_not_onboarded' };
  return { available: true };
}

export const remainingEur = (o: typeof orders.$inferSelect) => Math.max(0, Math.round((n(o.totalEur) + n(o.deliveryFeeEur) - n(o.paidAmountEur)) * 100) / 100);

/** Onboarding Stripe Connect Express du grossiste : crée le compte si besoin, renvoie le lien d'onboarding. */
export async function connectOnboardingLink(vendorId: string, email: string | null): Promise<{ url: string; accountId: string }> {
  const db = await getDb(); const [v] = await db.select().from(vendors).where(eq(vendors.id, vendorId)); if (!v) throw new Error('Fournisseur introuvable');
  let acct = v.stripeAccountId;
  if (!acct) {
    const a = await stripe<{ id: string }>('POST', '/accounts', { type: 'express', country: 'FR', email: email ?? undefined, business_type: 'company', business_profile: { name: v.name, product_description: 'Vente en gros de produits alimentaires (AFRISUPPLY)' }, capabilities: { card_payments: { requested: true }, transfers: { requested: true }, sepa_debit_payments: { requested: true } }, metadata: { vendorId } }, { idempotencyKey: `acct-${vendorId}` });
    acct = a.id; await db.update(vendors).set({ stripeAccountId: acct }).where(eq(vendors.id, vendorId));
  }
  const link = await stripe<{ url: string }>('POST', '/account_links', { account: acct, type: 'account_onboarding', refresh_url: `${APP()}/vendor?tab=payments&stripe=refresh`, return_url: `${APP()}/vendor?tab=payments&stripe=return` });
  return { url: link.url, accountId: acct };
}

/** Relit l'état du compte Connect (payouts activés ?) et le mémorise. */
export async function syncConnectAccount(vendorId: string): Promise<{ accountId: string | null; payoutsEnabled: boolean; chargesEnabled: boolean; requirements: string[] }> {
  const db = await getDb(); const [v] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
  if (!v?.stripeAccountId) return { accountId: null, payoutsEnabled: false, chargesEnabled: false, requirements: [] };
  const a = await stripe<{ payouts_enabled: boolean; charges_enabled: boolean; requirements?: { currently_due?: string[] } }>('GET', `/accounts/${v.stripeAccountId}`);
  await db.update(vendors).set({ stripePayoutsEnabled: !!a.payouts_enabled && !!a.charges_enabled }).where(eq(vendors.id, vendorId));
  return { accountId: v.stripeAccountId, payoutsEnabled: !!a.payouts_enabled, chargesEnabled: !!a.charges_enabled, requirements: a.requirements?.currently_due ?? [] };
}

/** Session Checkout pour régler le reste dû d'une commande ; la commission plateforme est prélevée via application_fee_amount. */
export async function createOrderCheckout(orderId: string, restaurantId: string, userEmail: string): Promise<{ url: string; amountEur: number }> {
  const db = await getDb();
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId))); if (!o?.vendorId) throw Object.assign(new Error('Commande plateforme introuvable'), { status: 404 });
  const [v] = await db.select().from(vendors).where(eq(vendors.id, o.vendorId)); const [r] = await db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, restaurantId));
  const av = await paymentAvailability(o, v); if (!av.available) throw Object.assign(new Error(av.reason === 'vendor_not_onboarded' ? `${v.name} n'accepte pas encore le paiement en ligne` : av.reason === 'already_paid' ? 'Commande déjà réglée' : av.reason === 'stripe_off' ? 'Paiement en ligne non configuré' : 'Commande non payable'), { status: 400 });
  const amount = remainingEur(o); if (amount <= 0) throw Object.assign(new Error('Rien à régler'), { status: 400 });
  const fee = Math.round(cents(amount) * n(v.commissionPct) / 100);
  const s = await stripe<{ id: string; url: string; payment_intent?: string }>('POST', '/checkout/sessions', {
    mode: 'payment', locale: 'fr', customer_email: userEmail, client_reference_id: o.id,
    payment_method_types: ['card', 'sepa_debit'],
    line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: cents(amount), product_data: { name: `Commande ${o.reference} — ${v.name}`, description: `Règlement ${r?.name ?? ''} → ${v.name} via AFRISUPPLY` } } }],
    payment_intent_data: { application_fee_amount: fee, transfer_data: { destination: v.stripeAccountId }, description: `AFRISUPPLY ${o.reference}`, metadata: { orderId: o.id, vendorId: v.id, restaurantId } },
    metadata: { orderId: o.id, vendorId: v.id, restaurantId, kind: 'order_payment' },
    success_url: `${APP()}/app/achats?paid=${o.id}`, cancel_url: `${APP()}/app/achats?pay_cancel=${o.id}`,
  }, { idempotencyKey: `chk-${o.id}-${cents(amount)}-${n(o.paidAmountEur)}` });
  await db.update(orders).set({ stripeCheckoutId: s.id }).where(eq(orders.id, o.id));
  return { url: s.url, amountEur: amount };
}

/** Marque la commande payée à partir d'un événement Stripe (checkout.session.completed / async_payment_succeeded). */
export async function applyOrderPayment(session: { id: string; payment_intent?: string | null; amount_total?: number | null; payment_status?: string; metadata?: Record<string, string> }): Promise<string | null> {
  const orderId = session.metadata?.orderId; if (!orderId) return null;
  if (session.payment_status && session.payment_status !== 'paid') return orderId; // SEPA : en attente → on attend async_payment_succeeded
  const db = await getDb(); const [o] = await db.select().from(orders).where(eq(orders.id, orderId)); if (!o || o.paidAt) return orderId;
  const paidNow = (session.amount_total ?? 0) / 100; const total = Math.round((n(o.totalEur) + n(o.deliveryFeeEur)) * 100) / 100; const newPaid = Math.min(total, Math.round((n(o.paidAmountEur) + paidNow) * 100) / 100);
  await db.update(orders).set({ paidAmountEur: newPaid.toFixed(2), paidAt: newPaid >= total - 0.005 ? new Date() : null, paymentMethod: 'en_ligne', stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : o.stripePaymentIntentId }).where(eq(orders.id, o.id));
  void logOrderEvent(o.id, 'note', `💳 Paiement en ligne reçu : ${paidNow.toFixed(2)} € (Stripe)`, 'restaurant');
  return orderId;
}
