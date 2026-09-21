// Chantier 5 (audit) — la page ouverte depuis le lien reçu par e-mail.
//
// Ce test n'utilise AUCUN mock du client API : il laisse le vrai client `api()` travailler
// (en-têtes, lecture du corps, construction de l'erreur) et simule seulement le réseau via
// `fetch`. Ce que la personne voit à l'écran est donc ce que l'application affiche vraiment.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => ({ refresh: vi.fn(async () => {}), user: null as unknown }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: h.user, refresh: h.refresh }) }));

import VerifyEmail from './VerifyEmail';

const reponse = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const monter = async (url: string) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/verifier-email" element={<VerifyEmail />} /></Routes></MemoryRouter>);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return container;
};

describe('Page /verifier-email', () => {
  beforeEach(() => { h.refresh.mockClear(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('confirme l’adresse et le dit', async () => {
    (globalThis.fetch as any).mockImplementation(() => reponse(200, { ok: true, email: 'awa@chezawa.fr', alreadyVerified: false, message: 'Adresse e-mail confirmée. Vous recevrez désormais les alertes de rupture.' }));
    const c = await monter('/verifier-email?token=jeton-valide-1234567890');
    expect(c.textContent).toContain('Adresse e-mail confirmée');
    expect(c.textContent).toContain('awa@chezawa.fr');
    expect(c.textContent).toContain('Se connecter');
    const [, init] = (globalThis.fetch as any).mock.calls[0];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ token: 'jeton-valide-1234567890' });
  });

  it('explique un lien expiré sans jargon (message du serveur, tel quel)', async () => {
    (globalThis.fetch as any).mockImplementation(() => reponse(400, { error: 'Ce lien de confirmation a expiré (48 heures). Demandez-en un nouveau depuis vos paramètres.', code: 'verify_expired' }));
    const c = await monter('/verifier-email?token=jeton-expire-1234567890');
    expect(c.textContent).toContain('a expiré');
    expect(c.textContent).toContain('48 heures');
    expect(c.textContent).not.toContain('Adresse confirmée');
  });

  it('dit simplement quand l’adresse était déjà confirmée', async () => {
    (globalThis.fetch as any).mockImplementation(() => reponse(200, { ok: true, email: 'awa@chezawa.fr', alreadyVerified: true, message: 'Cette adresse est déjà confirmée : rien à faire.' }));
    const c = await monter('/verifier-email?token=jeton-deja-utilise-1234567890');
    expect(c.textContent).toContain('déjà confirmée');
  });

  it('signale un lien incomplet (copié à la main, sans jeton)', async () => {
    const c = await monter('/verifier-email');
    expect(c.textContent).toContain('lien est incomplet');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
