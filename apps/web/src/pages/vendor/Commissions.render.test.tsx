// Chantier 8 (audit) — onglet Commissions fournisseur : ce que le grossiste voit quand il doit payer.
// Aucun bouton mensonger : prélèvement proposé seulement si Stripe est là, sinon relevé/virement annoncé.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ data: null as any, api: vi.fn() }));
vi.mock('../../lib/api', () => ({
  api: (...args: unknown[]) => h.api(...args),
  openPdf: vi.fn(async () => {}),
  tokenStore: { get: () => 'jeton', set: () => {}, clear: () => {}, restaurant: () => null, setRestaurant: () => {} },
}));

import { Commissions } from './CommissionsPanel';

const base = (over: Record<string, unknown> = {}) => ({
  commissionPct: 3,
  billingEmail: null,
  contactEmail: 'contact@grossiste.fr',
  recipient: 'contact@grossiste.fr',
  payment: { stripe: true, customer: 'cus_1', card: null, mode: 'releve_mail' as const, message: 'Aucun moyen de paiement enregistré : vous recevez chaque mois une facture de commission par e-mail, à régler par virement (15 jours).' },
  periods: [] as unknown[],
  invoices: [] as unknown[],
  ...over,
});

const monter = async (data: unknown) => {
  h.data = data;
  h.api.mockImplementation(async (path: string) => (path === '/vendor/billing' ? h.data : {}));
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><Commissions /></MemoryRouter>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return container;
};

beforeEach(() => { h.api.mockReset(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('chantier 8 — Commissions fournisseur', () => {
  it('sans carte : relevé par e-mail annoncé et bouton d’activation du prélèvement proposé', async () => {
    const el = await monter(base());
    const txt = (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
    expect(txt).toContain('Règlement des commissions');
    expect(txt).toContain('virement');
    expect(txt).toContain('Activer le prélèvement automatique');
    expect(txt).toContain('contact@grossiste.fr');
    expect(txt).toContain('3,00 %');
  });

  it('carte enregistrée : prélèvement actif annoncé avec les 4 derniers chiffres', async () => {
    const el = await monter(base({
      payment: { stripe: true, customer: 'cus_1', card: { id: 'pm_1', brand: 'visa', last4: '4242' }, mode: 'prelevement', message: 'Prélèvement automatique actif sur votre carte visa •••• 4242 : la facture de commission est réglée automatiquement chaque mois.' },
    }));
    const txt = el.textContent ?? '';
    expect(txt).toContain('Prélèvement automatique actif');
    expect(txt).toContain('4242');
    expect(txt).toContain('Remplacer ma carte');
    expect(txt).not.toContain('Activer le prélèvement automatique');
  });

  it('sans Stripe sur l’installation : aucun bouton de carte, la voie virement est expliquée', async () => {
    const el = await monter(base({
      payment: { stripe: false, customer: null, card: null, mode: 'releve_mail', message: 'Prélèvement automatique indisponible sur cette installation : vos commissions sont facturées par e-mail, à régler par virement (15 jours).' },
    }));
    const txt = el.textContent ?? '';
    expect(txt).toContain('indisponible sur cette installation');
    expect(txt).not.toContain('Activer le prélèvement automatique');
    expect(el.querySelectorAll('a[href^="mailto:bonjour@afrisupply.fr"]').length).toBe(1);
  });

  it('les factures de commission sont listées avec leur statut et le téléchargement PDF', async () => {
    const el = await monter(base({
      invoices: [{ id: 'inv-1', period: '2026-08', orders: 12, baseEur: 1840.5, amountEur: 55.22, status: 'emise', stripeInvoiceId: 'in_1', createdAt: new Date().toISOString() }],
      periods: [{ period: '2026-08', orders: 12, base: 1840.5, amount: 55.22, invoiced: true }],
    }));
    const txt = (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
    expect(txt).toContain('2026-08');
    expect(txt).toContain('55,22 €');
    expect(txt).toContain('à régler');
    expect(txt).toContain('Télécharger');
    expect(txt).toContain('1840,50 €');
  });

  it('aucune commission : message clair (on ne paie que sur ce qu’on vend)', async () => {
    const el = await monter(base());
    expect(el.textContent ?? '').toContain('Vous ne payez que sur ce que vous vendez');
  });
});
