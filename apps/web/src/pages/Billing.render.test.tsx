// Chantier 7 (audit) — la page Abonnement ne doit jamais promettre un paiement qui ne peut pas avoir lieu.
//
// Ce test monte réellement la page avec des réponses d'API réalistes et lit ce que voit le restaurateur :
//   • Stripe non configuré → l'encart « Paiement en ligne pas encore ouvert » s'affiche, aucun bouton
//     « Choisir … » (aucun faux guichet), et la liste des manques de configuration est visible ;
//   • Stripe configuré → les boutons de souscription reviennent et le portail est proposé ;
//   • les factures AFRISUPPLY s'affichent (numéro, période, statut) avec le téléchargement PDF ;
//   • essai expiré → message honnête (lecture seule), pas de blocage silencieux.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ billing: {} as any, invoices: null as any }));

vi.mock('../lib/useApi', () => ({
  useApi: (path: string) => path === '/billing/invoices'
    ? { data: h.invoices, loading: false, error: null, reload: async () => {}, setData: () => {} }
    : { data: h.billing, loading: false, error: null, reload: async () => {}, setData: () => {} },
}));
vi.mock('../lib/api', async (orig) => ({ ...(await orig() as object), api: vi.fn(async () => ({ url: 'https://fake' })) }));

import Billing from './Billing';

const PLANS = [
  { id: 'starter', name: 'Starter', priceMonthly: 39, founderPrice: 20, tagline: 'Fini le cahier.', highlight: false, features: ['Stock'], available: true },
  { id: 'pro', name: 'Pro', priceMonthly: 89, founderPrice: 45, tagline: 'La marge.', highlight: true, features: ['Prévision'], available: true },
  { id: 'business', name: 'Business', priceMonthly: 199, founderPrice: 100, tagline: 'Groupes.', highlight: false, features: ['Achats groupés'], available: true },
];
const health = (over: Record<string, unknown> = {}) => ({
  ready: true, ok: true, mode: 'en_ligne', message: 'Encaissement en ligne opérationnel.', missing: [],
  stripe: true, webhookReady: true, webhookUrl: 'https://app.afrisupply.fr/api/billing/webhook', publisher: { complete: true },
  ...over,
});
const billing = (over: Record<string, unknown> = {}) => ({
  plan: 'trial', founder: false, subscriptionStatus: 'trialing', trialEndsAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
  currentPeriodEnd: null, state: 'trialing', trialDaysLeft: 20, blocked: false, enforced: true, stripe: true, hasSubscription: false,
  plans: PLANS, founderOffer: { discountPct: 50, seats: 20, trialDays: 30 }, health: health(), price: { basis: 'pro', monthly: 89, list: 89 }, seats: 5,
  ...over,
});

const monter = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><Billing /></MemoryRouter>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return container;
};

beforeEach(() => { h.invoices = { invoices: [], billingEmail: 'awa@chezawa.fr', emitterComplete: true, stripe: true }; });
afterEach(() => { document.body.innerHTML = ''; });

describe('chantier 7 — page Abonnement : honnêteté de l’encaissement', () => {
  it('sans Stripe : aucun faux bouton de paiement, la voie manuelle est expliquée', async () => {
    h.billing = billing({ stripe: false, health: health({ ok: false, ready: false, stripe: false, mode: 'manuel', missing: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PRO'], message: 'Encaissement en ligne désactivé.' }) });
    const el = await monter();
    const txt = el.textContent ?? '';
    expect(txt).toContain('Paiement en ligne pas encore ouvert');
    expect(txt).toContain('STRIPE_SECRET_KEY');
    expect(txt).toContain('Demander l’activation — Pro');
    expect(txt).not.toContain('Choisir Pro');
    expect(el.querySelectorAll('a[href^="mailto:bonjour@afrisupply.fr"]').length).toBeGreaterThan(0);
  });

  it('avec Stripe : souscription possible et portail de gestion disponible', async () => {
    h.billing = billing({ hasSubscription: true, state: 'active', plan: 'pro', subscriptionStatus: 'active', currentPeriodEnd: new Date(Date.now() + 25 * 86_400_000).toISOString() });
    const el = await monter();
    const txt = (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
    expect(txt).toContain('Votre formule');
    expect(txt).toContain('Ouvrir mon espace de facturation');
    expect(txt).not.toContain('Paiement en ligne pas encore ouvert');
    expect(txt).toContain('89 € HT / mois');
  });

  it('les factures AFRISUPPLY sont listées avec le PDF et l’adresse d’envoi', async () => {
    h.billing = billing({ state: 'active', plan: 'pro', hasSubscription: true, subscriptionStatus: 'active' });
    h.invoices = {
      invoices: [{ id: 'inv-1', number: 'AFR-2026-0007', plan: 'pro', founder: false, amountEur: 89, vatRate: 20, periodStart: new Date(Date.now() - 30 * 86_400_000).toISOString(), periodEnd: new Date().toISOString(), status: 'payee', source: 'stripe', hostedUrl: 'https://invoice.stripe.com/x', paidAt: new Date().toISOString(), issuedAt: new Date().toISOString() }],
      billingEmail: 'compta@chezawa.fr', emitterComplete: true, stripe: true,
    };
    const el = await monter();
    // Les montants utilisent des espaces insécables (format fr-FR) : on normalise avant de comparer.
    const txt = (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
    expect(txt).toContain('AFR-2026-0007'); expect(txt).toContain('payée'); expect(txt).toContain('compta@chezawa.fr');
    expect(txt).toContain('PDF'); expect(txt).toContain('Recevoir par e-mail');
    expect(txt).toContain('TVA 20 %'); expect(txt).toContain('89,00');
  });

  it('essai terminé : lecture seule annoncée, données conservées', async () => {
    h.billing = billing({ plan: 'trial', state: 'expired', trialDaysLeft: 0, blocked: true, subscriptionStatus: 'expired' });
    const el = await monter();
    const txt = el.textContent ?? '';
    expect(txt).toContain('Votre essai gratuit est terminé');
    expect(txt).toContain('Vos données sont conservées');
    expect(txt).toContain('Reprendre avec Pro');
  });

  it('mentions légales incomplètes : la page le signale au lieu de laisser croire à une facture conforme', async () => {
    h.billing = billing();
    h.invoices = { invoices: [], billingEmail: null, emitterComplete: false, stripe: true };
    const el = await monter();
    expect(el.textContent ?? '').toContain('Mentions légales de l’émetteur à compléter');
  });
});
