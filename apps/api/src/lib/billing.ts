// Chantier 6 — Facturation : abonnements restaurants (Stripe Checkout + Portal + webhooks) et factures de commission
// des fournisseurs plateforme. Client Stripe minimal en fetch (pas de SDK : bundle Vercel léger, API stable).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb, restaurants, restaurantMembers, subscriptionInvoices, users, vendors, vendorMembers, commissionInvoices } from '@afrisupply/db';
import { isUniqueViolation } from './orders.js';
import { syncSequenceToMax } from './reference.js';

export type PlanId = 'starter' | 'pro' | 'business';
export const PLAN_RANK: Record<string, number> = { trial: 2, starter: 1, pro: 2, business: 3 }; // l'essai donne les fonctions Pro
export const PLAN_PRICES: Record<PlanId, number> = { starter: 39, pro: 89, business: 199 };

export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;

/**
 * Chantier 7 de l'audit 2 — base d'API Stripe paramétrable : elle permet de pointer les tests vers un
 * faux Stripe local (parcours de bout en bout reproductible sans clé réelle) tout en restant
 * https://api.stripe.com/v1 en production.
 */
export const stripeApiBase = () => (process.env.STRIPE_API_BASE ?? 'https://api.stripe.com/v1').replace(/\/$/, '');

/** Nombre de sièges (utilisateurs) inclus par formule. `null` = illimité. */
export const PLAN_SEATS: Record<string, number | null> = { trial: 5, starter: 3, pro: 5, business: null };
export const seatsFor = (plan: string) => (plan in PLAN_SEATS ? PLAN_SEATS[plan] : null);
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
  const url = `${stripeApiBase()}${path}${method === 'GET' && body.size ? `?${body}` : ''}`;
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

// ---------- Factures d'abonnement AFRISUPPLY (chantier 7 de l'audit 2) ----------

/**
 * Rattrapage de la séquence des FACTURES — même classe de bug que les références de commande, mais
 * aux conséquences comptables : une base qui contient déjà des factures AFR-AAAA-NNNN (restauration
 * d'une sauvegarde, migration, réimport) voyait la séquence repartir de 1 et le numéro suivant
 * entrait en collision — or un numéro de facture ne doit JAMAIS être réutilisé.
 * On aligne la séquence sur le plus grand numéro réellement émis (jamais en arrière).
 */
/** Factures d'abonnement `AFR-AAAA-NNNN` : même rattrapage que les références de commande. */
export const syncInvoiceSequence = () =>
  syncSequenceToMax({ sequence: 'subscription_invoice_seq', table: 'subscription_invoices', column: 'number', digitsFrom: 10, pattern: '^AFR-[0-9]{4}-[0-9]+$' });

/** Numéro de facture séquentiel : AFR-AAAA-NNNN (même mécanisme que les références de commande). */
export async function nextInvoiceNumber(now = new Date()): Promise<string> {
  const db = await getDb();
  await syncInvoiceSequence();
  const res = await db.execute(sql`select nextval('subscription_invoice_seq') as v`);
  const rows = (res as unknown as { rows?: { v: string | number }[] }).rows ?? (res as unknown as { v: string | number }[]);
  const v = Number((Array.isArray(rows) ? rows[0] : rows).v);
  return `AFR-${now.getFullYear()}-${String(v).padStart(4, '0')}`;
}

export interface InvoiceInput {
  restaurantId: string; plan: string; founder?: boolean; amountEur: number; vatRate?: number;
  periodStart: Date; periodEnd: Date; source?: 'stripe' | 'manuel'; stripeInvoiceId?: string | null;
  hostedUrl?: string | null; paidAt?: Date | null; status?: 'payee' | 'ouverte' | 'annulee'; createdBy?: string | null;
  note?: string | null;
}

/**
 * Enregistre une facture (une seule fois par facture Stripe : l'unicité de `stripe_invoice_id` protège
 * d'un rejeu de webhook). Renvoie `{ created: false }` si elle existait déjà.
 */
export async function recordSubscriptionInvoice(input: InvoiceInput) {
  const db = await getDb();
  if (input.stripeInvoiceId) {
    const [seen] = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.stripeInvoiceId, input.stripeInvoiceId));
    if (seen) return { created: false as const, invoice: seen };
  }
  // Un numéro de facture ne peut pas être réutilisé : si la séquence est en retard sur l'existant
  // (base restaurée), on réaligne et on retente — on n'échoue pas, et on ne duplique jamais un numéro.
  let row: typeof subscriptionInvoices.$inferSelect | undefined;
  for (let essai = 0; essai < 4 && !row; essai += 1) {
    const number = await nextInvoiceNumber(input.periodStart);
    try {
      [row] = await db.insert(subscriptionInvoices).values({
        restaurantId: input.restaurantId, number, plan: input.plan, founder: !!input.founder,
        amountEur: input.amountEur.toFixed(2), vatRate: (input.vatRate ?? 20).toFixed(2),
        periodStart: input.periodStart, periodEnd: input.periodEnd, source: input.source ?? 'stripe',
        status: input.status ?? 'payee', stripeInvoiceId: input.stripeInvoiceId ?? null, hostedUrl: input.hostedUrl ?? null,
        paidAt: input.paidAt ?? (input.status && input.status !== 'payee' ? null : new Date()), createdBy: input.createdBy ?? null, note: input.note ?? null,
      }).returning();
    } catch (e) {
      if (!isUniqueViolation(e, 'number')) throw e;
      await syncInvoiceSequence();
    }
  }
  if (!row) throw new Error('Numéro de facture introuvable après plusieurs essais : vérifiez la séquence subscription_invoice_seq.');
  return { created: true as const, invoice: row };
}

/** Destinataire des factures : réglage du restaurant, sinon le propriétaire. */
export async function billingRecipient(rid: string): Promise<string | null> {
  const db = await getDb();
  const [r] = await db.select({ settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, rid));
  if (r?.settings?.billingEmail) return r.settings.billingEmail;
  const [owner] = await db.select({ email: users.email }).from(restaurantMembers).innerJoin(users, eq(users.id, restaurantMembers.userId))
    .where(and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.role, 'owner'))).limit(1);
  return owner?.email ?? null;
}

/** Tarif mensuel HT d'une formule (prix public, hors remise fondateur). */
export const planPrice = (plan: string) => PLAN_PRICES[plan as PlanId] ?? 0;
export const effectivePrice = (plan: string, founder: boolean) => Math.round(planPrice(plan) * (founder ? 0.5 : 1) * 100) / 100;

/**
 * État de préparation de l'encaissement, sans complaisance : ce qui est configuré, ce qui manque,
 * et l'URL de webhook à déclarer dans Stripe.
 */
export function billingHealth() {
  const missing: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
  if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push('STRIPE_WEBHOOK_SECRET');
  const prices: Record<string, { id: string | null; ok: boolean }> = {};
  for (const p of ['starter', 'pro', 'business'] as PlanId[]) {
    const id = priceIdFor(p);
    prices[p] = { id, ok: !!id && id.startsWith('price_') };
    if (!prices[p].ok) missing.push(`STRIPE_PRICE_${p.toUpperCase()}`);
  }
  const founderCoupon = process.env.STRIPE_COUPON_FOUNDER ?? null;
  // Chantier 7 de l'audit 2 : état lisible par un humain, sous-titre honnête (jamais « tout va bien » à tort).
  const mode = !process.env.STRIPE_SECRET_KEY ? 'manuel' : missing.length ? 'incomplet' : 'en_ligne';
  const message = mode === 'en_ligne'
    ? 'Encaissement en ligne opérationnel : carte bancaire, factures PDF automatiques, résiliation en un clic.'
    : mode === 'incomplet'
      ? `Encaissement en ligne inachevé : il manque ${missing.join(', ')}. Les clients ne peuvent pas payer par carte ; facturez à la main (virement) en attendant.`
      : 'Encaissement en ligne désactivé (pas de clé Stripe sur cet environnement) : les formules s’activent à la main, facture AFRISUPPLY par e-mail ou virement.';
  const publisher = { complete: !!(process.env.INVOICE_SIRET && process.env.INVOICE_VAT), company: process.env.INVOICE_COMPANY ?? null, siret: !!process.env.INVOICE_SIRET, vat: !!process.env.INVOICE_VAT };
  return {
    ready: missing.length === 0,
    ok: missing.length === 0,
    mode,
    message,
    missing,
    publisher,
    stripe: stripeConfigured(),
    webhook: { path: '/api/billing/webhook', url: `${APP()}/api/billing/webhook`, signatureRequired: !!process.env.STRIPE_WEBHOOK_SECRET },
    webhookReady: !!process.env.STRIPE_WEBHOOK_SECRET,
    webhookUrl: `${APP()}/api/billing/webhook`,
    prices,
    founderCoupon,
    enforced: billingEnforced(),
    apiBase: stripeApiBase(),
    seats: PLAN_SEATS,
  };
}

/** MRR estimé (somme des abonnements actifs, remise fondateur appliquée) — admin. */
export async function mrr() {
  const db = await getDb();
  const rows = await db.select({ plan: restaurants.plan, founder: restaurants.founder }).from(restaurants).where(eq(restaurants.subscriptionStatus, 'active'));
  return { total: Math.round(rows.reduce((a, r) => a + effectivePrice(r.plan, r.founder), 0) * 100) / 100, subscribers: rows.length };
}

/** Dernières factures émises (admin) — contrôle rapide de ce qui a été encaissé. */
export async function recentInvoices(limit = 30) {
  const db = await getDb();
  return db.select().from(subscriptionInvoices).orderBy(desc(subscriptionInvoices.issuedAt)).limit(limit);
}

// ---------------------------------------------------------------- Fournisseurs (chantier 8)
// Les fournisseurs paient une commission à AFRISUPPLY (3 % par défaut). Jusqu'ici, le chemin
// « prélèvement automatique » de `invoiceCommissions` ne pouvait jamais s'activer : aucun
// identifiant client Stripe n'était créé. Ces fonctions le rendent réel et vérifiable.

/** Adresse à qui envoyer les factures de commission (facturation, sinon contact, sinon propriétaire du compte). */
export async function vendorBillingRecipient(v: { billingEmail?: string | null; contactEmail?: string | null; id: string }): Promise<string | null> {
  if (v.billingEmail) return v.billingEmail;
  if (v.contactEmail) return v.contactEmail;
  const db = await getDb();
  const [owner] = await db.select({ email: users.email }).from(vendorMembers).innerJoin(users, eq(users.id, vendorMembers.userId))
    .where(eq(vendorMembers.vendorId, v.id)).limit(1);
  return owner?.email ?? null;
}

/** Client Stripe du fournisseur (créé au besoin, idempotent). */
export async function ensureVendorCustomer(vid: string, email: string) {
  const db = await getDb();
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vid));
  if (!v) throw new Error('Fournisseur introuvable');
  if (v.stripeCustomerId) return v.stripeCustomerId;
  const cus = await stripe<{ id: string }>('POST', '/customers', { email, name: v.name, metadata: { vendorId: vid } }, { idempotencyKey: `vnd-${vid}` });
  await db.update(vendors).set({ stripeCustomerId: cus.id }).where(eq(vendors.id, vid));
  return cus.id;
}

/** Session Checkout « enregistrer une carte » (mode setup) — aucun débit à cette étape. */
export async function createVendorSetupSession(vid: string, email: string) {
  const customer = await ensureVendorCustomer(vid, email);
  return stripe<{ id: string; url: string }>('POST', '/checkout/sessions', {
    mode: 'setup', customer, locale: 'fr', currency: 'eur',
    payment_method_types: ['card'],
    setup_intent_data: { metadata: { vendorId: vid } },
    success_url: `${APP()}/fournisseur?paiement=ok&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP()}/fournisseur?paiement=annule`,
    metadata: { vendorId: vid, usage: 'commission' },
  });
}

/**
 * Applique le retour d'une session « enregistrer une carte » : le fournisseur garde un moyen de
 * paiement par défaut, ce qui autorise le prélèvement automatique des commissions.
 */
export async function applyVendorSetup(session: { id?: string; customer?: string; mode?: string; setup_intent?: string; metadata?: Record<string, string> }) {
  const vid = session.metadata?.vendorId;
  if (!vid) return { applied: false as const, reason: 'metadata.vendorId absente' };
  const db = await getDb();
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vid));
  if (!v) return { applied: false as const, reason: 'fournisseur inconnu' };
  if (session.customer && v.stripeCustomerId !== session.customer) await db.update(vendors).set({ stripeCustomerId: session.customer }).where(eq(vendors.id, vid));
  let pmId: string | undefined;
  if (session.setup_intent) {
    const si = await stripe<{ payment_method?: string; status?: string }>('GET', `/setup_intents/${session.setup_intent}`);
    pmId = si.payment_method ?? undefined;
    if (pmId && session.customer) await stripe('POST', `/customers/${session.customer}`, { invoice_settings: { default_payment_method: pmId } });
  }
  if (pmId) await db.update(vendors).set({ stripeDefaultPaymentMethod: pmId }).where(eq(vendors.id, vid));
  return { applied: true as const, vendorId: vid, paymentMethod: pmId ?? null };
}

export type VendorPaymentState = {
  stripe: boolean;
  customer: string | null;
  card: { id: string; brand: string | null; last4: string | null } | null;
  mode: 'prelevement' | 'releve_mail';
  message: string;
};

/** État réel du moyen de paiement d'un fournisseur — jamais une intention. */
export async function vendorPaymentState(vid: string): Promise<VendorPaymentState> {
  const db = await getDb();
  const [v] = await db.select().from(vendors).where(eq(vendors.id, vid));
  const stripeOn = stripeConfigured();
  let card: VendorPaymentState['card'] = null;
  if (v?.stripeCustomerId && v.stripeDefaultPaymentMethod && stripeOn) {
    try {
      const pm = await stripe<{ id: string; card?: { brand?: string; last4?: string } }>('GET', `/payment_methods/${v.stripeDefaultPaymentMethod}`);
      card = { id: pm.id, brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null };
    } catch { card = null; } // la carte a pu être supprimée côté Stripe : on ne prétend rien
  }
  const mode: VendorPaymentState['mode'] = card ? 'prelevement' : 'releve_mail';
  return {
    stripe: stripeOn,
    customer: v?.stripeCustomerId ?? null,
    card,
    mode,
    message: !stripeOn
      ? 'Prélèvement automatique indisponible sur cette installation : vos commissions sont facturées par e-mail, à régler par virement (15 jours).'
      : card
        ? `Prélèvement automatique actif sur votre carte ${card.brand ?? ''} •••• ${card.last4 ?? '????'} : la facture de commission est réglée automatiquement chaque mois.`
        : 'Aucun moyen de paiement enregistré : vous recevez chaque mois une facture de commission par e-mail, à régler par virement (15 jours). Enregistrez une carte pour basculer en prélèvement automatique.',
  };
}

/** Factures de commission émises pour un fournisseur (chantier 8 : visibles et téléchargeables par lui). */
export async function vendorCommissionInvoices(vid: string, limit = 36) {
  const db = await getDb();
  return db.select().from(commissionInvoices).where(eq(commissionInvoices.vendorId, vid)).orderBy(desc(commissionInvoices.period)).limit(limit);
}
