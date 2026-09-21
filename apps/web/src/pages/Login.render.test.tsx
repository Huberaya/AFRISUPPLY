// Chantier 8 (audit) — connexion : un restaurateur qui se trompe de mot de passe doit comprendre quoi faire.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ login: h.login }) }));

import Login from './Login';

const monter = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><Login /></MemoryRouter>); });
  return container;
};
const ecrire = async (el: HTMLElement, value: string, index: number) => {
  const inputs = el.querySelectorAll('input');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(inputs[index], value);
    inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const valider = async (el: HTMLElement) => {
  await act(async () => { el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
};

beforeEach(() => { h.login.mockReset(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('chantier 8 — erreurs de connexion exploitables', () => {
  it('mot de passe erroné : message du serveur + aide concrète (casse, mot de passe oublié)', async () => {
    h.login.mockRejectedValue(Object.assign(new Error('E-mail ou mot de passe incorrect.'), { status: 401 }));
    const el = await monter();
    await ecrire(el, 'awa@chezawa.fr', 0); await ecrire(el, 'mauvais', 1);
    await valider(el);
    const txt = (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
    expect(txt).toContain('E-mail ou mot de passe incorrect.');
    expect(txt).toContain('Vérifiez la casse de votre adresse e-mail');
    expect(txt).toContain('recevoir un lien par e-mail');
  });

  it('trop de tentatives : délai annoncé et bouton désactivé pendant l’attente', async () => {
    h.login.mockRejectedValue(Object.assign(new Error('Trop de tentatives. Réessayez dans un instant.'), { status: 429, retryAfterSec: 42 }));
    const el = await monter();
    await ecrire(el, 'awa@chezawa.fr', 0); await ecrire(el, 'mauvais', 1);
    await valider(el);
    const txt = (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
    expect(txt).toContain('Trop de tentatives depuis cet appareil');
    expect(txt).toContain('42 secondes');
    const btn = el.querySelector('button[type="submit"], .btn-primary') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('Patientez 42 s');
  });

  it('serveur injoignable : l’erreur réseau est affichée, pas un écran blanc', async () => {
    h.login.mockRejectedValue(Object.assign(new Error('Serveur injoignable. Vérifiez votre connexion internet.'), { status: 0 }));
    const el = await monter();
    await ecrire(el, 'awa@chezawa.fr', 0); await ecrire(el, 'demo1234', 1);
    await valider(el);
    expect(el.textContent ?? '').toContain('Serveur injoignable');
  });
});
