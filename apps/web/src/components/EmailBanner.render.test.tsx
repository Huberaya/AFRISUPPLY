// Chantier 5 (audit) — ce que voit la personne à qui l'on demande de confirmer son adresse.
// Test d'interaction réel (jsdom) : on clique, on lit la réponse affichée. Aucun message rassurant gratuit.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'awa@chezawa.fr', fullName: 'Awa Diallo', emailVerified: false as boolean | undefined },
  refresh: vi.fn(async () => {}),
  api: vi.fn(),
}));

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: h.user, refresh: h.refresh }) }));
vi.mock('../lib/api', () => ({
  api: (...args: unknown[]) => h.api(...args),
  tokenStore: { get: () => 'jeton', set: () => {}, clear: () => {}, restaurant: () => null, setRestaurant: () => {} },
}));

import { EmailVerifyBanner } from '../components/AppLayout';

const monter = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><EmailVerifyBanner /></MemoryRouter>); });
  return container;
};
const cliquerRenvoyer = async (container: HTMLElement) => {
  const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Renvoyer le lien'))!;
  await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
};

describe('Bandeau « confirmez votre e-mail »', () => {
  beforeEach(() => { h.user = { id: 'u1', email: 'awa@chezawa.fr', fullName: 'Awa Diallo', emailVerified: false }; h.api.mockReset(); });

  it('ne s’affiche pas quand l’adresse est confirmée', async () => {
    h.user = { ...h.user, emailVerified: true };
    expect((await monter()).textContent).toBe('');
  });

  it('explique la conséquence réelle et propose de renvoyer le lien', async () => {
    const html = (await monter()).textContent!;
    expect(html).toContain('Confirmez votre adresse e-mail');
    expect(html).toContain('awa@chezawa.fr');
    expect(html).toContain('alertes de rupture');
    expect(html).toContain('Renvoyer le lien');
  });

  it('après clic, affiche la réponse du serveur et le lien généré', async () => {
    h.api.mockResolvedValue({ message: 'Nouveau lien envoyé à awa@chezawa.fr (valable 48 heures).', devLink: 'http://localhost:3000/verifier-email?token=abc123' });
    const c = await monter();
    await cliquerRenvoyer(c);
    expect(h.api).toHaveBeenCalledWith('/auth/resend-verification', { method: 'POST' });
    expect(c.textContent).toContain('Nouveau lien envoyé');
    expect(c.textContent).toContain('verifier-email?token=abc123');
  });

  it('quand aucun e-mail ne peut partir, ne prétend pas le contraire', async () => {
    h.api.mockResolvedValue({ message: "L'e-mail n'a pas pu être envoyé : l'envoi d'e-mails n'est pas configuré sur ce serveur." });
    const c = await monter();
    await cliquerRenvoyer(c);
    expect(c.textContent).toContain('pas pu être envoyé');
    expect(c.textContent).not.toContain('Nouveau lien envoyé');
  });
});
