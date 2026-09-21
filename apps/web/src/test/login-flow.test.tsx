// Chantier 5 (audit S2) — la session circule par cookie HttpOnly : le jeton n'est ni stocké
// ni envoyé par le JavaScript (zéro en-tête Authorization, zéro localStorage).
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { tokenStore } from '../lib/api';
import { mockApi } from './helpers';

describe('connexion : session par cookie seul (S2)', () => {
  it('connecte sans jamais manipuler le jeton côté client', async () => {
    const { calls } = mockApi({
      'POST /auth/login': () => ({ status: 200, body: { token: 'jwt-super-secret', restaurant: { id: 'r1' } } }),
      'GET /auth/me': () => ({ body: { user: { id: 'u1', email: 'awa@chezawa.fr', fullName: 'Awa Diallo' }, restaurants: [{ id: 'r1', name: 'Chez Awa', city: 'Nantes', plan: 'gratuit', trialEndsAt: null, coversPerDay: 50, role: 'owner' }] } }),
      '*': () => ({ body: {} }),
    });
    window.history.pushState({}, '', '/connexion');
    render(<App />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/E-mail/), 'awa@chezawa.fr');
    await user.type(screen.getByLabelText(/Mot de passe/), 'demo1234');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    // session ouverte (indice non secret) + /auth/me appelé pour établir l'utilisateur
    await waitFor(() => expect(tokenStore.authed()).toBe(true));
    await waitFor(() => expect(calls.some((c) => c.method === 'GET' && c.path === '/auth/me')).toBe(true));

    const login = calls.find((c) => c.method === 'POST' && c.path === '/auth/login')!;
    expect(login.body).toEqual({ email: 'awa@chezawa.fr', password: 'demo1234' });
    // S2 : AUCUNE requête n'emporte d'en-tête Authorization (session = cookie HttpOnly)
    expect(calls.every((c) => c.headers.authorization === undefined)).toBe(true);
    // …et le jeton n'est stocké nulle part dans le stockage du navigateur
    expect(JSON.stringify(localStorage)).not.toContain('jwt-super-secret');
    // le choix du restaurant reste un simple repère d'interface
    expect(tokenStore.restaurant()).toBe('r1');
  });
});
