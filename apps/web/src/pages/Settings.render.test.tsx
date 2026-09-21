// Chantier 6 (audit) — les réglages ne doivent jamais promettre un envoi qui n'a pas eu lieu.
//
// Ce test monte réellement la page Paramètres (racine React + effets) avec des réponses d'API
// réalistes et lit ce que la personne voit :
//   • mode développement (transport « fichier ») → « Mode dev » et la phrase qui dit que rien ne part réellement ;
//   • envoi actif (Resend) → « Actif » et l'adresse d'expédition ;
//   • WhatsApp/SMS non configuré → l'interface le dit (jamais « message envoyé ») ;
//   • le test d'e-mail et l'option d'alerte immédiate sont présents, avec l'état renvoyé par le serveur.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ state: { data: null as any, loading: false, error: null as string | null } }));
vi.mock('../lib/useApi', () => ({ useApi: () => ({ ...h.state, reload: async () => {}, setData: () => {} }) }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { email: 'awa@chezawa.fr', fullName: 'Awa Diop', emailVerified: true, emailVerifiedAt: '2026-09-01T10:00:00.000Z' }, refresh: async () => {} }) }));

import Settings from './Settings';

const base = (over: Record<string, unknown> = {}) => ({
  restaurant: { name: 'Chez Awa', city: 'Nantes', coversPerDay: 120, plan: 'essentiel', trialEndsAt: null },
  settings: {
    priceIncreaseAlertPct: 8, forecastHorizonDays: 7, autoReorderEnabled: true, dailyDigestEnabled: true,
    immediateAlertEmails: true, digestRecipients: [], closedWeekdays: [], notifyPhone: '+33698765432',
  },
  mail: { transport: 'file', from: 'AFRISUPPLY <bonjour@afrisupply.fr>', configured: false, delivered: true },
  sms: { configured: false, whatsapp: false, delivered: false },
  ...over,
});

const monter = async (data: unknown) => {
  h.state.data = data;
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><Settings /></MemoryRouter>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return container;
};

describe('chantier 6 — page Paramètres : ce qui est dit sur les canaux', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

  it('en développement, la page annonce « Mode dev » et avertit que rien ne part vraiment', async () => {
    const text = (await monter(base())).textContent ?? '';
    expect(text).toContain('Mode dev');
    expect(text).toContain("Aucun service d'envoi réel n'est configuré");   // pas de promesse fausse
    expect(text).toContain('M’envoyer un e-mail de test');   // apostrophe typographique de l'interface                  // test de bout en bout disponible
  });

  it('avec Resend configuré, la page annonce « Actif » et l’adresse d’expédition', async () => {
    const text = (await monter(base({ mail: { transport: 'resend', from: 'AFRISUPPLY <bonjour@afrisupply.fr>', configured: true, delivered: true } }))).textContent ?? '';
    expect(text).toContain('Actif');
    expect(text).toContain('Envoi actif (resend)');
  });

  it('sans service d’envoi, l’état affiché est « Non configuré » (pas « Dév. »)', async () => {
    const text = (await monter(base({ mail: { transport: 'log', from: 'AFRISUPPLY <bonjour@afrisupply.fr>', configured: false, delivered: false } }))).textContent ?? '';
    expect(text).toContain('Non configuré');
    expect(text).toContain('Les e-mails ne partent pas encore');
  });

  it('WhatsApp/SMS non configuré : l’interface ne prétend pas envoyer de message', async () => {
    const text = (await monter(base())).textContent ?? '';
    expect(text).toContain('les envois démarrent dès que le canal WhatsApp/SMS est activé');
    expect(text).not.toContain('Message test envoyé');
  });

  it('l’option d’alerte immédiate reflète le réglage du serveur', async () => {
    const on = await monter(base());
    expect(on.textContent).toContain('tout de suite');
    const boxes = [...on.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(boxes.every((b) => b.checked)).toBe(true);                       // tous les réglages serveur sont actifs
    const off = await monter(base({ settings: { ...base().settings, immediateAlertEmails: false } }));
    const boxesOff = [...off.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
    expect(boxesOff.filter((b) => !b.checked).length).toBe(1);              // une seule option décochée : la bonne
  });
});
