// Chantier 6 — Abonnements (Stripe Checkout / Portal / webhooks) + factures de commission fournisseurs.
import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, sql, desc } from 'drizzle-orm';
import { getDb, restaurants, billingEvents, commissions, commissionInvoices, vendors, vendorMembers, users } from '@afrisupply/db';
import { requireAuth, requireRestaurant, requireMinRole, type Env } from '../lib/auth.js';
import { PLANS, FOUNDER_OFFER } from './public.js';
import { accessState, applySubscription, createCheckout, createPortal, stripe, stripeConfigured, verifyStripeSignature, priceIdFor, billingEnforced, type PlanId } from '../lib/billing.js';
import { sendMail } from '../lib/mailer.js';
import { audit } from '../lib/ops.js';

const isAdmin = (email: string) => (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;

// ---------- Webhook Stripe (public, signé) ----------
export const billingPublicRoutes = new Hono<Env>();
billingPublicRoutes.post('/billing/webhook', async (c) => {
  const raw = await c.req.text();
  if (!verifyStripeSignature(raw, c.req.header('stripe-signature'))) return c.json({ error: 'Signature invalide' }, 400);
  const evt = JSON.parse(raw) as { id: string; type: string; data: { object: Record<string, unknown> } };
  const db = await getDb();
  const [seen] = await db.select({ id: billingEvents.id }).from(billingEvents).where(eq(billingEvents.id, evt.id)); if (seen) return c.json({ received: true, duplicate: true });
  let rid: string | undefined;
  try {
    const o = evt.data.object;
    if (evt.type === 'checkout.session.completed' && o.mode === 'subscription' && typeof o.subscription === 'string') {
      const sub = await stripe<Parameters<typeof applySubscription>[0]>('GET', `/subscriptions/${o.subscription}`); rid = (await applySubscription(sub)).rid;
    } else if (evt.type.startsWith('customer.subscription.')) {
      rid = (await applySubscription(o as unknown as Parameters<typeof applySubscription>[0])).rid;
    } else if (evt.type === 'invoice.payment_failed' && typeof o.customer === 'string') {
      await db.update(restaurants).set({ subscriptionStatus: 'past_due' }).where(eq(restaurants.stripeCustomerId, o.customer));
    } else if (evt.type === 'invoice.paid' && typeof o.customer === 'string' && o.subscription) {
      await db.update(restaurants).set({ subscriptionStatus: 'active' }).where(eq(restaurants.stripeCustomerId, o.customer));
      const [ci] = await db.select().from(commissionInvoices).where(eq(commissionInvoices.stripeInvoiceId, String(o.id))); if (ci) await db.update(commissionInvoices).set({ status: 'payee' }).where(eq(commissionInvoices.id, ci.id));
    } else if (evt.type === 'invoice.paid' && typeof o.id === 'string') {
      await db.update(commissionInvoices).set({ status: 'payee' }).where(eq(commissionInvoices.stripeInvoiceId, o.id));
    }
    await db.insert(billingEvents).values({ id: evt.id, type: evt.type, restaurantId: rid ?? null, payload: { object: (o as { id?: string }).id } });
    return c.json({ received: true });
  } catch (e) { console.error('[stripe webhook]', e); return c.json({ error: 'Traitement échoué' }, 500); }
});

// ---------- Côté restaurant ----------
export const billingRoutes = new Hono<Env>();

// Chantier 2 (audit) — souscrire, payer ou résilier : propriétaire uniquement.
billingRoutes.on(['POST'], '/billing/checkout', requireMinRole('owner'));
billingRoutes.on(['POST'], '/billing/portal', requireMinRole('owner'));
billingRoutes.on(['POST'], '/billing/sync', requireMinRole('owner'));
billingRoutes.use('*', requireAuth, requireRestaurant);

billingRoutes.get('/billing', async (c) => {
  const db = await getDb(); const [r] = await db.select().from(restaurants).where(eq(restaurants.id, c.get('restaurantId')));
  const s = accessState(r);
  return c.json({
    plan: r.plan, founder: r.founder, subscriptionStatus: r.subscriptionStatus, trialEndsAt: r.trialEndsAt, currentPeriodEnd: r.currentPeriodEnd, ...s, enforced: billingEnforced(),
    stripe: stripeConfigured(), hasSubscription: !!r.stripeSubscriptionId,
    plans: PLANS.map((p) => ({ ...p, priceMonthly: p.priceMonthly, founderPrice: Math.round(p.priceMonthly * (1 - FOUNDER_OFFER.discountPct / 100)), available: !!priceIdFor(p.id as PlanId) })), founderOffer: FOUNDER_OFFER,
  });
});

billingRoutes.post('/billing/checkout', async (c) => {
  const { plan } = z.object({ plan: z.enum(['starter', 'pro', 'business']) }).parse(await c.req.json());
  if (!stripeConfigured()) return c.json({ error: 'Paiement en ligne bientôt disponible — écrivez-nous à bonjour@afrisupply.fr pour activer votre formule.' }, 503);
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
  const mrr = rows.filter((r) => r.subscriptionStatus === 'active').reduce((a, r) => a + (({ starter: 39, pro: 89, business: 199 } as Record<string, number>)[r.plan] ?? 0) * (r.founder ? 0.5 : 1), 0);
  const invoices = await db.select().from(commissionInvoices).orderBy(desc(commissionInvoices.createdAt)).limit(50);
  return c.json({ restaurants: rows.map((r) => ({ ...r, ...accessState(r) })), founders, founderSeatsLeft: Math.max(0, FOUNDER_OFFER.seats - founders), mrr, invoices, stripe: stripeConfigured(), enforced: billingEnforced() });
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
  const out: { vendorId: string; vendorName: string; orders: number; base: number; amount: number; via: 'stripe' | 'mail' | 'skip'; stripeInvoiceId?: string }[] = [];
  for (const r of rows) {
    const amount = Number(r.amount); const [v] = await db.select().from(vendors).where(eq(vendors.id, r.vendorId));
    if (!v || amount < 1) { out.push({ vendorId: r.vendorId, vendorName: v?.name ?? '?', orders: Number(r.orders), base: Number(r.base), amount, via: 'skip' }); continue; }
    if (opts.dryRun) { out.push({ vendorId: v.id, vendorName: v.name, orders: Number(r.orders), base: Number(r.base), amount, via: v.stripeCustomerId && stripeConfigured() ? 'stripe' : 'mail' }); continue; }
    const [existing] = await db.select().from(commissionInvoices).where(and(eq(commissionInvoices.vendorId, v.id), eq(commissionInvoices.period, period))); if (existing) continue;
    let stripeInvoiceId: string | undefined; let via: 'stripe' | 'mail' = 'mail';
    if (v.stripeCustomerId && stripeConfigured()) {
      try {
        await stripe('POST', '/invoiceitems', { customer: v.stripeCustomerId, amount: Math.round(amount * 100), currency: 'eur', description: `Commission AFRISUPPLY ${period} — ${r.orders} commande(s), base ${eur(Number(r.base))}` }, { idempotencyKey: `ci-${v.id}-${period}` });
        const inv = await stripe<{ id: string }>('POST', '/invoices', { customer: v.stripeCustomerId, collection_method: 'send_invoice', days_until_due: 15, auto_advance: true, metadata: { vendorId: v.id, period } }, { idempotencyKey: `inv-${v.id}-${period}` });
        await stripe('POST', `/invoices/${inv.id}/finalize`); await stripe('POST', `/invoices/${inv.id}/send`);
        stripeInvoiceId = inv.id; via = 'stripe';
      } catch (e) { console.error('[commissions] stripe', e); }
    }
    if (via === 'mail') {
      const [m] = await db.select({ email: users.email }).from(vendorMembers).innerJoin(users, eq(users.id, vendorMembers.userId)).where(eq(vendorMembers.vendorId, v.id)).limit(1);
      const to = v.contactEmail ?? m?.email;
      if (to) await sendMail({ to, subject: `AFRISUPPLY — relevé de commission ${period} : ${eur(amount)}`, text: `Bonjour,\n\nRelevé de commission ${period} pour ${v.name} :\n- ${r.orders} commande(s) confirmée(s), base ${eur(Number(r.base))}\n- Commission ${Number(v.commissionPct)} % : ${eur(amount)}\n\nRèglement sous 15 jours par virement (RIB dans votre espace) — ou activez le prélèvement automatique dans votre espace fournisseur.\n\nMerci de votre confiance,\nL'équipe AFRISUPPLY`, html: `<p>Bonjour,</p><p>Relevé de commission <b>${period}</b> pour <b>${v.name}</b> :</p><ul><li>${r.orders} commande(s) confirmée(s), base ${eur(Number(r.base))}</li><li>Commission ${Number(v.commissionPct)} % : <b>${eur(amount)}</b></li></ul><p>Règlement sous 15 jours par virement — ou activez le prélèvement automatique dans votre espace fournisseur.</p><p>L'équipe AFRISUPPLY</p>`, tags: { type: 'commission' } });
    }
    await db.insert(commissionInvoices).values({ vendorId: v.id, period, orders: Number(r.orders), baseEur: Number(r.base).toFixed(2), amountEur: amount.toFixed(2), stripeInvoiceId, status: via === 'stripe' ? 'emise' : 'envoyee_par_mail' });
    await db.update(commissions).set({ invoiced: true }).where(and(eq(commissions.vendorId, v.id), eq(commissions.period, period)));
    out.push({ vendorId: v.id, vendorName: v.name, orders: Number(r.orders), base: Number(r.base), amount, via, stripeInvoiceId });
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
