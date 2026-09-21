// Chantier 12 (audit) — page publique « État de la plateforme » : elle doit refléter la MÊME
// vérité que le back-office (une seule règle de « tâche en retard »), et publier le support.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

import Status from './Status';

const charge = (over: Record<string, unknown> = {}) => ({
  ok: true, version: '0.1.0', commit: 'local', env: 'production', checkedAt: new Date().toISOString(),
  checks: {
    database: { ok: true, latencyMs: 12 },
    jobs: {
      daily: { state: 'ok', maxHours: 30, lastRun: { status: 'ok', finishedAt: new Date().toISOString(), hoursAgo: 3 } },
      reminders: { state: 'ok', maxHours: 3, lastRun: { status: 'ok', finishedAt: new Date().toISOString(), hoursAgo: 0.4 } },
      'alerts-notify': { state: 'degraded', maxHours: 3, lastRun: { status: 'partial', finishedAt: new Date().toISOString(), hoursAgo: 2 } },
      backup: { state: 'never', maxHours: 30, lastRun: null },
    },
    dailyJob: { state: 'ok', maxHours: 30, lastRun: { status: 'ok', finishedAt: new Date().toISOString(), hoursAgo: 3 } },
    mail: { transport: 'resend', configured: true, delivered: true, stats: { sent: 41, failed: 0 } },
    sms: { configured: false, delivered: false, stats: { sent: 0 } },
    errorTracking: { configured: true },
    cron: { configured: true, jobs: ['/api/jobs/daily', '/api/jobs/reminders'] },
    backups: { files: 12, lastAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), ageHours: 3, retentionDays: 14, ok: true },
  },
  support: { email: 'bonjour@afrisupply.fr', hours: 'du lundi au samedi, 8 h – 20 h (heure de Paris)', responseTime: 'réponse sous 4 h ouvrées', phone: null },
  ...over,
});

const monter = async (payload: unknown) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><Status /></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
  return container;
};
const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('chantier 12 — page publique d’état : la même vérité que l’exploitation', () => {
  it('affiche chaque tâche planifiée avec son délai maximum, jamais un chiffre inventé', async () => {
    const el = await monter(charge());
    const t = texte(el);
    expect(t).toContain('E-mail du matin');
    expect(t).toContain('Relances grossistes');
    expect(t).toContain('Alertes urgentes');
    expect(t).toContain('Sauvegardes');
    expect(t).toContain('maximum accepté : 30 h');
    expect(t).toContain('il y a 3 h');
  });

  it('une tâche en échec = incident affiché, et la ligne fautive est nommée (aucun « tout va bien » de complaisance)', async () => {
    const enPanne = charge({ ok: false, checks: { ...charge().checks, jobs: { ...charge().checks.jobs, daily: { state: 'degraded', maxHours: 30, lastRun: { status: 'error', finishedAt: new Date().toISOString(), hoursAgo: 1 } } } } });
    const el = await monter(enPanne);
    expect(texte(el)).toContain('Un système nécessite notre attention');
    expect(texte(el)).toContain('E-mail du matin');
    expect(texte(el)).toContain('dernier passage error il y a 1 h');
    const sain = await monter(charge({ ok: true, checks: { ...charge().checks, jobs: { daily: { state: 'ok', maxHours: 30, lastRun: { status: 'ok', finishedAt: new Date().toISOString(), hoursAgo: 1 } } } } }));
    expect(texte(sain)).toContain('Tous les systèmes fonctionnent');
  });

  it('dit l’état réel des sauvegardes et des tâches branchées', async () => {
    const el = await monter(charge());
    const t = texte(el);
    expect(t).toContain('Sauvegardes des restaurants');
    expect(t).toContain('12 fichier(s)');
    expect(t).toContain('conservation 14 jours');
    expect(t).toContain('/api/jobs/daily');
    expect(t).toContain('41 envoyé(s), 0 échec(s)');
  });

  it('donne le contact du support et renvoie vers « Mes données » pour un restaurateur', async () => {
    const el = await monter(charge());
    const t = texte(el);
    expect(t).toContain('bonjour@afrisupply.fr');
    expect(t).toContain('8 h – 20 h');
    expect(t).toContain('4 h ouvrées');
    expect(el.querySelector('a[href^="mailto:bonjour@afrisupply.fr"]')).toBeTruthy();
    expect([...el.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/app/mes-donnees')).toBe(true);
  });
});
