// Chantier 6 — Abonnements (Stripe Checkout / Portal / webhooks) + factures de commission fournisseurs.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, sql, desc } from 'drizzle-orm';
import { getDb, restaurants, billingEvents, subscriptionInvoices, commissions, commissionInvoices, vendors, orders } from '@afrisupply/db';
import { requireAuth, requireRestaurant, requireMinRole, type Env } from '../lib/auth.js';
import { applyOrderPayment, createOrderCheckout, paymentAvailability } from '../lib/payments.js';
import { PLANS, FOUNDER_OFFER } from './public.js';
import { SUPPORT } from '../lib/ops-health.js';
import {
  accessState, applySubscription, createCheckout, createPortal, stripe, stripeConfigured, verifyStripeSignature,
  priceIdFor, billingEnforced, billingHealth, seatsFor, planPrice, billingRecipient, effectivePrice, mrr, recentInvoices,
  recordSubscriptionInvoice, applyVendorSetup, vendorBillingRecipient, type PlanId,
} from '../lib/billing.js';
import { commissionPdf } from '../lib/pdf.js';
import { invoicePdf, emitterComplete } from '../lib/pdf.js';
import { recordJobRun } from '../lib/job-runs.js';
import { sendMail } from '../lib/mailer.js';
import { audit } from '../lib/ops.js';

const isAdmin = (email: string) => (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

// ---------- Webhook Stripe (public, signé) ----------
// Chantier 7 de l'audit 2 : l'événement est RÉCLAMÉ avant traitement (clé primaire = id Stripe).
//  • déjà traité → { received, duplicate: true } sans effet ;
//  • en échec → retraité au prochain envoi de Stripe (tous les traitements sont idempotents) ;
//  • signature invalide → 400.
interface StripeInvoice {
  id: string; customer?: string; subscription?: string; number?: string | null; hosted_invoice_url?: string | null;
  total?: number; tax?: number; subtotal?: number; amount_paid?: number; currency?: string; status?: string;
  period_start?: number; period_end?: number; paid?: boolean; lines?: { data?: { price?: { id?: string }; period?: { start?: number; end?: number } }[] };
  metadata?: Record<string, string>;
}

async function handleStripeInvoicePaid(db: Awaited<ReturnType<typeof getDb>>, inv: StripeInvoice) {
  // 1. l'abonnement passe actif
  if (typeof inv.customer === 'string') await db.update(restaurants).set({ subscriptionStatus: 'active' }).where(eq(restaurants.stripeCustomerId, inv.customer));
  // Le restaurant peut être connu par son abonnement OU par son client Stripe : on tente les deux
  // (le premier paiement arrive parfois avant que l'identifiant d'abonnement soit enregistré).
  let [r] = inv.subscription ? await db.select().from(restaurants).where(eq(restaurants.stripeSubscriptionId, inv.subscription)) : [];
  if (!r && inv.customer) [r] = await db.select().from(restaurants).where(eq(restaurants.stripeCustomerId, inv.customer));
  if (!r) return { recorded: false as const, reason: 'restaurant inconnu pour ce client Stripe' };
  // On retient l'identifiant d'abonnement : indispensable pour le portail et la résiliation.
  if (inv.subscription && !r.stripeSubscriptionId) { await db.update(restaurants).set({ stripeSubscriptionId: inv.subscription }).where(eq(restaurants.id, r.id)); r = { ...r, stripeSubscriptionId: inv.subscription }; }
  // La formule payée est appliquée sans attendre : le prix de la ligne identifie la formule.
  const planFromLine = (['starter', 'pro', 'business'] as PlanId[]).find((p) => priceIdFor(p) === inv.lines?.data?.[0]?.price?.id);
  if (planFromLine && r.plan !== planFromLine) { await db.update(restaurants).set({ plan: planFromLine }).where(eq(restaurants.id, r.id)); r = { ...r, plan: planFromLine }; }
  else if (!planFromLine && inv.subscription) {
    // À défaut, on interroge l'abonnement — sans jamais faire échouer l'encaissement si Stripe ne répond pas.
    try { await applySubscription(await stripe<Parameters<typeof applySubscription>[0]>('GET', `/subscriptions/${inv.subscription}`)); const [fresh] = await db.select().from(restaurants).where(eq(restaurants.id, r.id)); if (fresh) r = fresh; } catch { /* l'événement customer.subscription.* fera le travail */ }
  }
  // 2. la facture AFRISUPPLY est enregistrée (HT = total − TVA ; à défaut on retire 20 %)
  const totalCents = inv.total ?? inv.amount_paid ?? 0;
  const taxCents = inv.tax ?? 0;
  const ht = taxCents ? (totalCents - taxCents) / 100 : Math.round((totalCents / 1.2)) / 100;
  const vatRate = ht > 0 && taxCents ? Math.round((taxCents / 100 / ht) * 10000) / 100 : 20;
  const start = inv.period_start ?? inv.lines?.data?.[0]?.period?.start ?? Math.floor(Date.now() / 1000);
  const end = inv.period_end ?? inv.lines?.data?.[0]?.period?.end ?? start + 30 * 86_400;
  const res = await recordSubscriptionInvoice({
    restaurantId: r.id, plan: r.plan, founder: r.founder, amountEur: ht, vatRate,
    periodStart: new Date(start * 1000), periodEnd: new Date(end * 1000),
    source: 'stripe', stripeInvoiceId: inv.id, hostedUrl: inv.hosted_invoice_url ?? null,
    paidAt: inv.paid === false ? null : new Date(), status: inv.paid === false ? 'ouverte' : 'payee',
  });
  if (res.created) await mailInvoice(res.invoice, r.name);
  return { recorded: res.created, number: res.invoice.number };
}

/** Envoie la facture au restaurant (PDF joint) — et trace l'envoi comme tout autre message. */
async function mailInvoice(invoice: typeof subscriptionInvoices.$inferSelect, restaurantName: string) {
  const startedAt = new Date();
  const to = await billingRecipient(invoice.restaurantId);
  const ttc = Math.round(Number(invoice.amountEur) * (1 + Number(invoice.vatRate) / 100) * 100) / 100;
  const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;
  if (!to) { await recordJobRun({ job: 'invoice-mail', startedAt, status: 'error', summary: { invoice: invoice.number }, error: 'aucun destinataire de facturation' }); return { sent: false, reason: 'aucun destinataire' }; }
  const pdf = invoicePdf({
    number: invoice.number, issuedAt: invoice.issuedAt, paidAt: invoice.paidAt, status: invoice.status as 'payee' | 'ouverte' | 'annulee',
    restaurant: { name: restaurantName }, plan: invoice.plan, founder: invoice.founder,
    periodStart: invoice.periodStart, periodEnd: invoice.periodEnd, amountHt: Number(invoice.amountEur), vatRate: Number(invoice.vatRate),
    source: invoice.source as 'stripe' | 'manuel',
  });
  const res = await sendMail({
    to, subject: `Votre facture AFRISUPPLY ${invoice.number} — ${eur(ttc)} TTC`,
    text: `Bonjour,\n\nVoici votre facture ${invoice.number} pour ${restaurantName} :\n• Formule ${invoice.plan}${invoice.founder ? ' (tarif pilote fondateur −50 %)' : ''}\n• Période : du ${invoice.periodStart.toLocaleDateString('fr-FR')} au ${invoice.periodEnd.toLocaleDateString('fr-FR')}\n• Montant : ${eur(Number(invoice.amountEur))} HT — ${eur(ttc)} TTC\n\nLa facture est jointe à ce message (PDF) et reste disponible dans votre espace, rubrique Abonnement.\n\nMerci de votre confiance,\nL'équipe AFRISUPPLY`,
    html: `<p>Bonjour,</p><p>Voici votre facture <b>${invoice.number}</b> pour <b>${restaurantName}</b> :</p><ul><li>Formule ${invoice.plan}${invoice.founder ? ' (tarif pilote fondateur −50 %)' : ''}</li><li>Période : du ${invoice.periodStart.toLocaleDateString('fr-FR')} au ${invoice.periodEnd.toLocaleDateString('fr-FR')}</li><li>Montant : ${eur(Number(invoice.amountEur))} HT — <b>${eur(ttc)} TTC</b></li></ul><p>La facture est jointe à ce message (PDF) et reste disponible dans votre espace, rubrique Abonnement.</p><p>Merci de votre confiance,<br>L'équipe AFRISUPPLY</p>`,
    tags: { type: 'subscription_invoice', restaurant: invoice.restaurantId }, attachments: [{ filename: `${invoice.number}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
  await recordJobRun({
    job: 'invoice-mail', startedAt, status: res.ok && res.delivered ? 'ok' : 'error',
    summary: { invoice: invoice.number, to, transport: res.transport, delivered: res.delivered },
    error: res.ok ? null : res.error,
  });
  return { sent: res.ok && res.delivered, reason: res.ok ? undefined : res.error };
}

export const billingPublicRoutes = new Hono<Env>();

/** Diagnostic public de l'état d'encaissement : aucune donnée client, aucun secret (supervision, page Statut). */
billingPublicRoutes.get('/billing/health', async (c) => c.json(await billingHealth()));

billingPublicRoutes.post('/billing/webhook', async (c) => {
  const raw = await c.req.text();
  if (!verifyStripeSignature(raw, c.req.header('stripe-signature'))) return c.json({ error: 'Signature invalide' }, 400);
  let evt: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try { evt = JSON.parse(raw); } catch { return c.json({ error: 'Charge utile illisible' }, 400); }
  if (!evt.id || !evt.type) return c.json({ error: 'Événement incomplet' }, 400);
  const db = await getDb();
  const [known] = await db.select().from(billingEvents).where(eq(billingEvents.id, evt.id));
  if (known?.status === 'traite') return c.json({ received: true, duplicate: true, type: known.type });
  if (!known) await db.insert(billingEvents).values({ id: evt.id, type: evt.type, payload: { object: (evt.data?.object as { id?: string } | undefined)?.id } }).onConflictDoNothing();

  const o = (evt.data?.object ?? {}) as Record<string, unknown>;
  let rid: string | undefined;
  try {
    if ((evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') && o.mode === 'payment' && (o.metadata as Record<string, string> | undefined)?.kind === 'order_payment') {
      await applyOrderPayment(o as Parameters<typeof applyOrderPayment>[0]); rid = (o.metadata as Record<string, string>).restaurantId; // chantier 25
    } else if (evt.type === 'checkout.session.completed' && o.mode === 'subscription' && typeof o.subscription === 'string') {
      const sub = await stripe<Parameters<typeof applySubscription>[0]>('GET', `/subscriptions/${o.subscription}`); rid = (await applySubscription(sub)).rid;
    } else if (evt.type === 'checkout.session.completed' && o.mode === 'setup') {
      // Chantier 8 : un fournisseur vient d'enregistrer sa carte pour les commissions.
      const res = await applyVendorSetup(o as { customer?: string; mode?: string; setup_intent?: string; metadata?: Record<string, string> });
      if (!res.applied) throw new Error(`Session « enregistrer une carte » non appliquée : ${res.reason}`);
    } else if (evt.type.startsWith('customer.subscription.')) {
      rid = (await applySubscription(o as unknown as Parameters<typeof applySubscription>[0])).rid;
    } else if ((evt.type === 'invoice.paid' || evt.type === 'invoice.payment_succeeded') && o.id) {
      const res = await handleStripeInvoicePaid(db, o as unknown as StripeInvoice);
      if (typeof o.customer === 'string') { const [rr] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.stripeCustomerId, o.customer)); rid = rr?.id; }
      await db.update(commissionInvoices).set({ status: 'payee' }).where(eq(commissionInvoices.stripeInvoiceId, String(o.id)));
      void res;
    } else if (evt.type === 'invoice.payment_failed' && typeof o.customer === 'string') {
      await db.update(restaurants).set({ subscriptionStatus: 'past_due' }).where(eq(restaurants.stripeCustomerId, o.customer));
    } else if (evt.type === 'invoice.paid' && typeof o.id === 'string') {
      await db.update(commissionInvoices).set({ status: 'payee' }).where(eq(commissionInvoices.stripeInvoiceId, o.id));
    }
    await db.update(billingEvents).set({ status: 'traite', restaurantId: rid ?? null, error: null }).where(eq(billingEvents.id, evt.id));
    return c.json({ received: true, type: evt.type });
  } catch (e) {
    const message = (e as Error).message.slice(0, 400);
    await db.update(billingEvents).set({ status: 'echec', error: message }).where(eq(billingEvents.id, evt.id));
    console.error('[stripe webhook]', message);
    // 500 → Stripe réessaiera ; le rejeu retraitera l'événement (statut « echec »), sans doublon.
    return c.json({ error: 'Traitement échoué, réessai attendu', detail: message }, 500);
  }
});

// ---------- Côté restaurant ----------
export const billingRoutes = new Hono<Env>();

billingRoutes.on(['POST'], '/billing/checkout', requireMinRole('owner'));
billingRoutes.on(['POST'], '/billing/portal', requireMinRole('owner'));
billingRoutes.on(['POST'], '/billing/sync', requireMinRole('owner'));
billingRoutes.use('*', requireAuth, requireRestaurant);

// Chantier 25 : payer une commande marketplace en ligne (CB / SEPA) — responsable ou propriétaire.
billingRoutes.on(['POST'], '/orders/:id/pay', requireMinRole('manager'));
billingRoutes.post('/orders/:id/pay', async (c) => {
  try { const r = await createOrderCheckout(c.req.param('id'), c.get('restaurantId'), c.get('user').email); return c.json(r); }
  catch (e) { const err = e as Error & { status?: number }; return c.json({ error: err.message }, (err.status ?? 500) as 400); }
});
billingRoutes.get('/orders/:id/payment', async (c) => {
  const db = await getDb(); const [o] = await db.select().from(orders).where(and(eq(orders.id, c.req.param('id')), eq(orders.restaurantId, c.get('restaurantId')))); if (!o?.vendorId) return c.json({ error: 'Introuvable' }, 404);
  const [v] = await db.select({ stripeAccountId: vendors.stripeAccountId, stripePayoutsEnabled: vendors.stripePayoutsEnabled }).from(vendors).where(eq(vendors.id, o.vendorId));
  const av = await paymentAvailability(o, v); const total = Number(o.totalEur) + Number(o.deliveryFeeEur);
  return c.json({ ...av, totalEur: Math.round(total * 100) / 100, paidAmountEur: Number(o.paidAmountEur ?? 0), remainingEur: Math.max(0, Math.round((total - Number(o.paidAmountEur ?? 0)) * 100) / 100), paidAt: o.paidAt, paymentMethod: o.paymentMethod, dueAt: o.dueAt });
});

// Chantier 2 (audit) — souscrire, payer ou résilier : propriétaire uniquement.

billingRoutes.get('/billing', async (c) => {
  const db = await getDb(); const [r] = await db.select().from(restaurants).where(eq(restaurants.id, c.get('restaurantId')));
  const s = accessState(r);
  return c.json({
    plan: r.plan, founder: r.founder, subscriptionStatus: r.subscriptionStatus, trialEndsAt: r.trialEndsAt, currentPeriodEnd: r.currentPeriodEnd, ...s, enforced: billingEnforced(),
    stripe: stripeConfigured(), hasSubscription: !!r.stripeSubscriptionId,
    // Chantier 7 de l'audit 2 : état réel et lisible du guichet (clé, webhook, prix, expéditeur).
    health: await billingHealth(),
    // Pendant l'essai, la formule de référence est Pro (celle qu'on offre) : le prix affiché n'est jamais 0 € par accident.
    price: (() => { const basis = r.plan === 'trial' ? 'pro' : r.plan; return { basis, monthly: effectivePrice(basis, r.founder), list: planPrice(basis) }; })(),
    seats: seatsFor(r.plan),
    plans: PLANS.map((p) => ({ ...p, priceMonthly: p.priceMonthly, founderPrice: Math.round(p.priceMonthly * (1 - FOUNDER_OFFER.discountPct / 100)), available: !!priceIdFor(p.id as PlanId) })), founderOffer: FOUNDER_OFFER,
  });
});

/** Factures d'abonnement AFRISUPPLY du restaurant (Stripe ou saisie manuelle). */
billingRoutes.get('/billing/invoices', async (c) => {
  const db = await getDb();
  const rows = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.restaurantId, c.get('restaurantId'))).orderBy(desc(subscriptionInvoices.issuedAt));
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, c.get('restaurantId')));
  return c.json({
    invoices: rows.map((i) => ({ id: i.id, number: i.number, plan: i.plan, founder: i.founder, amountEur: Number(i.amountEur), vatRate: Number(i.vatRate), periodStart: i.periodStart, periodEnd: i.periodEnd, status: i.status, source: i.source, hostedUrl: i.hostedUrl, paidAt: i.paidAt, issuedAt: i.issuedAt })),
    billingEmail: r?.settings?.billingEmail ?? c.get('user').email,
    emitterComplete: emitterComplete(),
    stripe: stripeConfigured(),
  });
});

/** Téléchargement de la facture PDF (propriétaire de la facture uniquement). */
billingRoutes.get('/billing/invoices/:id/pdf', async (c) => {
  const db = await getDb();
  const [i] = await db.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.id, c.req.param('id')), eq(subscriptionInvoices.restaurantId, c.get('restaurantId'))));
  if (!i) return c.json({ error: 'Facture introuvable' }, 404);
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, i.restaurantId));
  const pdf = invoicePdf({
    number: i.number, issuedAt: i.issuedAt, paidAt: i.paidAt, status: i.status as 'payee' | 'ouverte' | 'annulee',
    restaurant: { name: r?.name ?? 'Restaurant', city: r?.city, address: r?.address, email: r?.settings?.billingEmail ?? null },
    plan: i.plan, founder: i.founder, periodStart: i.periodStart, periodEnd: i.periodEnd,
    amountHt: Number(i.amountEur), vatRate: Number(i.vatRate), source: i.source as 'stripe' | 'manuel',
  });
  return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${i.number}.pdf"` } });
});

/** Renvoie la facture par e-mail (au destinataire de facturation du restaurant). */
billingRoutes.post('/billing/invoices/:id/send', async (c) => {
  const db = await getDb();
  const [i] = await db.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.id, c.req.param('id')), eq(subscriptionInvoices.restaurantId, c.get('restaurantId'))));
  if (!i) return c.json({ error: 'Facture introuvable' }, 404);
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, i.restaurantId));
  const res = await mailInvoice(i, r?.name ?? 'Restaurant');
  return c.json(res, res.sent ? 200 : 424);
});

// (déplacé dans billingPublicRoutes : l'état du guichet est utile à la supervision, sans authentification)

billingRoutes.post('/billing/checkout', async (c) => {
  const { plan } = z.object({ plan: z.enum(['starter', 'pro', 'business']) }).parse(await c.req.json());
  if (!stripeConfigured()) return c.json({ error: `Paiement en ligne bientôt disponible — écrivez-nous à ${SUPPORT.email()} pour activer votre formule.` }, 503);
  try { const s = await createCheckout(c.get('restaurantId'), c.get('user').email, plan); await audit('billing.checkout', { actorEmail: c.get('user').email, target: c.get('restaurantId'), meta: { plan } }); return c.json({ url: s.url }); }
  catch (e) { return c.json({ error: (e as Error).message }, 502); }
});

billingRoutes.post('/billing/portal', async (c) => {
  if (!stripeConfigured()) return c.json({ error: 'Portail de facturation indisponible' }, 503);
  try { return c.json({ url: (await createPortal(c.get('restaurantId'), c.get('user').email)).url }); } catch (e) { return c.json({ error: (e as Error).message }, 502); }
});

/** Après retour de Checkout : on resynchronise sans attendre le webhook. */
billingRoutes.post('/billing/sync', async (c) => {
  const { sessionId } = z.object({ sessionId: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const db = await getDb(); const [r] = await db.select().from(restaurants).where(eq(restaurants.id, c.get('restaurantId')));
  if (!stripeConfigured()) return c.json({ synced: false });
  let subId = r.stripeSubscriptionId;
  if (sessionId) { const s = await stripe<{ subscription?: string; metadata?: { restaurantId?: string } }>('GET', `/checkout/sessions/${sessionId}`); if (s.metadata?.restaurantId === r.id && s.subscription) subId = s.subscription; }
  if (!subId) return c.json({ synced: false });
  const res = await applySubscription(await stripe('GET', `/subscriptions/${subId}`));
  return c.json({ synced: true, ...res });
});

// ---------- Admin : offre fondateur, factures de commission ----------
export const billingAdminRoutes = new Hono<Env>();
billingAdminRoutes.use('/admin/billing/*', requireAuth);
billingAdminRoutes.use('/admin/billing', requireAuth);

billingAdminRoutes.get('/admin/billing', async (c) => {
  if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403);
  const db = await getDb();
  const rows = await db.select({ id: restaurants.id, name: restaurants.name, city: restaurants.city, plan: restaurants.plan, founder: restaurants.founder, subscriptionStatus: restaurants.subscriptionStatus, trialEndsAt: restaurants.trialEndsAt, currentPeriodEnd: restaurants.currentPeriodEnd, createdAt: restaurants.createdAt }).from(restaurants).orderBy(desc(restaurants.createdAt));
  const founders = rows.filter((r) => r.founder).length;
  const legacyMrr = rows.filter((r) => r.subscriptionStatus === 'active').reduce((a, r) => a + (({ starter: 39, pro: 89, business: 199 } as Record<string, number>)[r.plan] ?? 0) * (r.founder ? 0.5 : 1), 0);
  const invoices = await db.select().from(commissionInvoices).orderBy(desc(commissionInvoices.createdAt)).limit(50);
  const [subs, health] = [await recentInvoices(50), await billingHealth()];
  return c.json({
    restaurants: rows.map((r) => ({ ...r, ...accessState(r), seats: seatsFor(r.plan) })), founders, founderSeatsLeft: Math.max(0, FOUNDER_OFFER.seats - founders),
    // MRR calculée sur les abonnements actifs (source unique : lib/billing.ts) ; les commissions fournisseurs restent à part.
    mrr: await mrr(), legacyMrr, subscriptions: subs, commissions: invoices, invoices, stripe: stripeConfigured(), enforced: billingEnforced(), health,
  });
});

/** Émet une facture d'abonnement à la main (paiement par virement, geste commercial) et l'envoie. */
billingAdminRoutes.post('/admin/billing/restaurants/:id/invoice', async (c) => {
  if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403);
  const b = z.object({ amountEur: z.number().positive().max(100000).optional(), vatRate: z.number().min(0).max(20).optional(), months: z.number().int().min(1).max(12).default(1), send: z.boolean().default(true), note: z.string().max(300).optional() }).parse(await c.req.json().catch(() => ({})));
  const db = await getDb(); const [r] = await db.select().from(restaurants).where(eq(restaurants.id, c.req.param('id')));
  if (!r) return c.json({ error: 'Restaurant introuvable' }, 404);
  const start = new Date(); const end = new Date(start.getTime() + b.months * 30 * 86_400_000);
  const amount = b.amountEur ?? Math.round(effectivePrice(r.plan === 'trial' ? 'starter' : r.plan, r.founder) * b.months * 100) / 100;
  const { invoice } = await recordSubscriptionInvoice({
    restaurantId: r.id, plan: r.plan, founder: r.founder, amountEur: amount, vatRate: b.vatRate ?? 20,
    periodStart: start, periodEnd: end, source: 'manuel', createdBy: c.get('user').id, note: b.note ?? null,
    status: 'ouverte',
  });
  const mail = b.send ? await mailInvoice(invoice, r.name) : { sent: false, reason: 'envoi non demandé' };
  await audit('billing.admin.invoice', { actorEmail: c.get('user').email, target: r.id, meta: { number: invoice.number, amount, mail: mail.sent } });
  return c.json({ invoice, mail }, 201);
});

/** Marque une facture d'abonnement payée (virement reçu) ou annulée. */
billingAdminRoutes.put('/admin/billing/invoices/:id', async (c) => {
  if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403);
  const b = z.object({ status: z.enum(['payee', 'ouverte', 'annulee']) }).parse(await c.req.json());
  const db = await getDb();
  const [upd] = await db.update(subscriptionInvoices).set({ status: b.status, paidAt: b.status === 'payee' ? new Date() : null }).where(eq(subscriptionInvoices.id, c.req.param('id'))).returning();
  if (!upd) return c.json({ error: 'Facture introuvable' }, 404);
  await audit('billing.admin.invoice.status', { actorEmail: c.get('user').email, target: upd.id, meta: { status: b.status } });
  return c.json({ invoice: upd });
});

/** Marque un restaurant « pilote fondateur » (−50 % à vie), prolonge l'essai si demandé. */
billingAdminRoutes.put('/admin/billing/restaurants/:id', async (c) => {
  if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403);
  const b = z.object({ founder: z.boolean().optional(), extendTrialDays: z.number().int().min(1).max(180).optional(), plan: z.enum(['trial', 'starter', 'pro', 'business']).optional(), subscriptionStatus: z.enum(['trialing', 'active', 'past_due', 'canceled', 'expired']).optional() }).parse(await c.req.json());
  const db = await getDb(); const [r] = await db.select().from(restaurants).where(eq(restaurants.id, c.req.param('id'))); if (!r) return c.json({ error: 'Restaurant introuvable' }, 404);
  const patch: Partial<typeof restaurants.$inferInsert> = {};
  if (b.founder !== undefined) patch.founder = b.founder;
  if (b.plan) patch.plan = b.plan;
  if (b.subscriptionStatus) patch.subscriptionStatus = b.subscriptionStatus;
  if (b.extendTrialDays) { const base = r.trialEndsAt && r.trialEndsAt > new Date() ? r.trialEndsAt : new Date(); patch.trialEndsAt = new Date(base.getTime() + b.extendTrialDays * 86_400_000); if (r.subscriptionStatus === 'expired') patch.subscriptionStatus = 'trialing'; }
  const [upd] = await db.update(restaurants).set(patch).where(eq(restaurants.id, r.id)).returning();
  await audit('billing.admin.update', { actorEmail: c.get('user').email, target: r.id, meta: b });
  return c.json({ restaurant: upd });
});

/** Génère les factures de commission d'une période (AAAA-MM) pour tous les fournisseurs : Stripe si client connu, sinon e-mail récapitulatif. */
export async function invoiceCommissions(period: string, opts: { dryRun?: boolean } = {}) {
  const db = await getDb();
  const rows = await db.select({ vendorId: commissions.vendorId, orders: sql<number>`count(*)`, base: sql<number>`sum(${commissions.orderTotalEur})`, amount: sql<number>`sum(${commissions.amountEur})` })
    .from(commissions).where(and(eq(commissions.period, period), eq(commissions.invoiced, false))).groupBy(commissions.vendorId);
  const out: { vendorId: string; vendorName: string; orders: number; base: number; amount: number; via: 'stripe' | 'mail' | 'skip'; stripeInvoiceId?: string; mode?: string; recipient?: string | null }[] = [];
  for (const r of rows) {
    const amount = Number(r.amount); const [v] = await db.select().from(vendors).where(eq(vendors.id, r.vendorId));
    if (!v || amount < 1) { out.push({ vendorId: r.vendorId, vendorName: v?.name ?? '?', orders: Number(r.orders), base: Number(r.base), amount, via: 'skip' }); continue; }
    const chargeable = !!(v.stripeCustomerId && v.stripeDefaultPaymentMethod && stripeConfigured());
    if (opts.dryRun) { out.push({ vendorId: v.id, vendorName: v.name, orders: Number(r.orders), base: Number(r.base), amount, via: chargeable ? 'stripe' : 'mail', mode: chargeable ? 'prelevement' : 'releve' }); continue; }
    const [existing] = await db.select().from(commissionInvoices).where(and(eq(commissionInvoices.vendorId, v.id), eq(commissionInvoices.period, period))); if (existing) continue;
    let stripeInvoiceId: string | undefined; let via: 'stripe' | 'mail' = 'mail'; let mode: 'prelevement' | 'releve' = 'releve';
    if (v.stripeCustomerId && stripeConfigured()) {
      try {
        await stripe('POST', '/invoiceitems', { customer: v.stripeCustomerId, amount: Math.round(amount * 100), currency: 'eur', description: `Commission AFRISUPPLY ${period} — ${r.orders} commande(s), base ${eur(Number(r.base))}` }, { idempotencyKey: `ci-${v.id}-${period}` });
        // Carte enregistrée → prélèvement automatique ; sinon relevé à régler sous 15 jours (inchangé).
        const prelevement = !!v.stripeDefaultPaymentMethod;
        const inv = await stripe<{ id: string }>('POST', '/invoices', prelevement
          ? { customer: v.stripeCustomerId, collection_method: 'charge_automatically', auto_advance: true, metadata: { vendorId: v.id, period } }
          : { customer: v.stripeCustomerId, collection_method: 'send_invoice', days_until_due: 15, auto_advance: true, metadata: { vendorId: v.id, period } }, { idempotencyKey: `inv-${v.id}-${period}` });
        await stripe('POST', `/invoices/${inv.id}/finalize`);
        if (!prelevement) await stripe('POST', `/invoices/${inv.id}/send`);
        stripeInvoiceId = inv.id; via = 'stripe'; mode = prelevement ? 'prelevement' : 'releve';
      } catch (e) { console.error('[commissions] stripe', e); }
    }
    // Dans tous les cas, le fournisseur reçoit une vraie facture PDF (même quand Stripe l'a envoyée).
    const to = await vendorBillingRecipient({ id: v.id, billingEmail: v.billingEmail, contactEmail: v.contactEmail });
    const monthLabel = new Date(`${period}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const ttc = Math.round(amount * 1.2 * 100) / 100;
    const pdf = commissionPdf({
      number: `FC-${period}`, periodLabel: monthLabel, issuedAt: new Date(), dueAt: new Date(Date.now() + 15 * 86_400_000),
      vendor: { name: v.name, city: v.city, email: to }, orders: Number(r.orders), baseEur: Number(r.base),
      pct: Number(v.commissionPct), amountHt: amount, vatRate: 20,
      payment: { mode: mode === 'prelevement' ? 'prelevement' : 'virement' },
    });
    if (to) await sendMail({
      to,
      subject: mode === 'prelevement' ? `AFRISUPPLY — commission ${period} : ${eur(amount)} HT (prélevée sur votre carte)` : `AFRISUPPLY — facture de commission ${period} : ${eur(amount)} HT (${eur(ttc)} TTC)`,
      text: `Bonjour,\n\nFacture de commission ${period} pour ${v.name} :\n- ${r.orders} commande(s) confirmée(s), base ${eur(Number(r.base))}\n- Commission ${Number(v.commissionPct).toFixed(2).replace('.', ',')} % : ${eur(amount)} HT — ${eur(ttc)} TTC\n\n${mode === 'prelevement' ? 'Prélèvement automatique sur la carte enregistrée dans votre espace fournisseur : aucune action de votre part.' : "Règlement sous 15 jours par virement (ou activez le prélèvement automatique dans votre espace fournisseur)."}\n\nLa facture est jointe à ce message (PDF).\n\nMerci de votre confiance,\nL'équipe AFRISUPPLY`,
      html: `<p>Bonjour,</p><p>Facture de commission <b>${period}</b> pour <b>${v.name}</b> :</p><ul><li>${r.orders} commande(s) confirmée(s), base ${eur(Number(r.base))}</li><li>Commission ${Number(v.commissionPct)} % : <b>${eur(amount)} HT</b> — ${eur(ttc)} TTC</li></ul><p>${mode === 'prelevement' ? 'Prélèvement automatique sur la carte enregistrée : aucune action de votre part.' : 'Règlement sous 15 jours par virement, ou activez le prélèvement automatique dans votre espace fournisseur.'}</p><p>La facture est jointe à ce message (PDF).</p><p>L'équipe AFRISUPPLY</p>`,
      tags: { type: 'commission', vendor: v.id }, attachments: [{ filename: `commission-${period}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
    await db.insert(commissionInvoices).values({ vendorId: v.id, period, orders: Number(r.orders), baseEur: Number(r.base).toFixed(2), amountEur: amount.toFixed(2), stripeInvoiceId, // « emise » tant que Stripe n'a pas confirmé l'encaissement (le webhook invoice.paid passe en « payee ») :
    // on ne prétend jamais qu'une commission est réglée avant l'encaissement réel.
    status: via === 'stripe' ? 'emise' : 'envoyee_par_mail' });
    await db.update(commissions).set({ invoiced: true }).where(and(eq(commissions.vendorId, v.id), eq(commissions.period, period)));
    out.push({ vendorId: v.id, vendorName: v.name, orders: Number(r.orders), base: Number(r.base), amount, via, mode, stripeInvoiceId, recipient: to });
  }
  return { period, invoices: out, dryRun: !!opts.dryRun };
}

billingAdminRoutes.post('/admin/billing/commissions/invoice', async (c) => {
  if (!isAdmin(c.get('user').email)) return c.json({ error: 'Accès réservé' }, 403);
  const b = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional(), dryRun: z.boolean().optional() }).parse(await c.req.json().catch(() => ({})));
  const prev = new Date(); prev.setUTCDate(0); // dernier jour du mois précédent
  const res = await invoiceCommissions(b.period ?? prev.toISOString().slice(0, 7), { dryRun: b.dryRun });
  await audit('billing.commissions.invoice', { actorEmail: c.get('user').email, meta: { period: res.period, count: res.invoices.length, dryRun: !!b.dryRun } });
  return c.json(res);
});
