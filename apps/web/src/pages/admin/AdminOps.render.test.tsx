// Chantier 12 (audit) — Exploitation : l'écran qui empêche « le cron ne tourne plus depuis trois
// semaines » de rester invisible. Les tests montent le vrai composant avec des charges utiles réelles.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ ops: null as any, files: null as any, audit: null as any }));
vi.mock('../../lib/useApi', () => ({
  useApi: (path: string) => {
    if (path === '/admin/ops') return { data: h.ops, loading: false, error: null, reload: async () => {}, setData: () => {} };
    if (path === '/admin/backups') return { data: h.files, loading: false, error: null, reload: async () => {}, setData: () => {} };
    return { data: h.audit, loading: false, error: null, reload: async () => {}, setData: () => {} };
  },
}));

import AdminOps from './AdminOps';
import { FeedbackProvider } from '../../components/Feedback';

const job = (over: Record<string, unknown> = {}) => {
  const base = { status: 'ok', finishedAt: new Date().toISOString(), hoursAgo: 1.2, error: null, summary: { sent: 3 } };
  const lastRun = 'lastRun' in over ? (over.lastRun as Record<string, unknown> | null) : base;
  return { state: 'ok', maxHours: 3, ...over, lastRun: lastRun ? { ...base, ...lastRun } : null };
};
const ops = (over: Record<string, unknown> = {}) => ({
  jobs: { daily: job({ maxHours: 30, lastRun: { hoursAgo: 5 } }), reminders: job(), 'alerts-notify': job(), backup: job({ maxHours: 30 }) },
  backup: { dir: '/var/backups', files: 12, bytes: 4_190_000, keep: 14, restaurants: 3, version: 1, last: { name: 'afs-aaaa-20260920T0300-admin.json.gz', createdAt: new Date().toISOString(), restaurantName: 'Chez Awa', rows: 421 } },
  support: { email: 'bonjour@afrisupply.fr', hours: 'du lundi au samedi, 8 h – 20 h (heure de Paris)', responseTime: 'réponse sous 4 h ouvrées', phone: null },
  ...over,
});
const fichiers = { backups: [{ name: 'afs-aaaa-20260920T0300-admin.json.gz', sizeBytes: 190_000, createdAt: '2026-09-20T03:00:00.000Z', restaurantId: 'r1', restaurantName: 'Chez Awa', rows: 421, tables: 31, checksum: 'sha256:abc', mode: 'admin' }] };
const journal = { rows: [{ at: '2026-09-20T03:00:10.000Z', actorEmail: 'admin@afrisupply.fr', action: 'backup.run_manual', target: 'r1', meta: { written: 3 } }], total: 1 };

const monter = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><FeedbackProvider><AdminOps /></FeedbackProvider></MemoryRouter>); });
  return container;
};
const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
/** Saisie « comme un humain » : React n'écoute pas une valeur posée directement sur le nœud. */
const saisir = (node: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(node, value);
  node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};

const fetchMock = vi.fn();
beforeEach(() => {
  h.ops = ops(); h.files = fichiers; h.audit = journal;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, tookMs: 1500, inserted: { orders: 12 }, relu: { restaurants: 1, rows: 421 }, accountsToReset: [] }), blob: async () => new Blob(['{}']), headers: new Headers() });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined });
});
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('chantier 12 — Exploitation : tâches, sauvegardes, reprise, audit', () => {
  it('montre la santé des quatre tâches planifiées, avec le délai attendu et le dernier passage', async () => {
    const el = await monter();
    const t = texte(el);
    expect(t).toContain('Digest du matin');
    expect(t).toContain('Relances grossistes');
    expect(t).toContain('Alertes urgentes');
    expect(t).toContain('Sauvegardes');
    expect(t).toContain('il y a 5 h');
    expect(t).toContain('≤ 30 h');
    expect(t).toContain('Sauvegarder maintenant');
  });

  it('signale en clair une tâche jamais exécutée ou en retard (l’inverse de « tout va bien »)', async () => {
    h.ops = ops({ jobs: { daily: job({ maxHours: 30 }), reminders: job({ state: 'never', lastRun: null }), 'alerts-notify': job(), backup: job({ state: 'stale', lastRun: { status: 'ok', finishedAt: '2026-09-15T00:00:00.000Z', hoursAgo: 150, error: null, summary: {} } }) } });
    const el = await monter();
    const t = texte(el);
    expect(t).toContain('Tâches à surveiller');
    expect(t).toContain('jamais exécutée');
    expect(t).toContain('en retard');
    expect(t).toContain('CRON_SECRET');
  });

  it('liste les sauvegardes réelles et sait TESTER une restauration (base neuve, sans rien écrire)', async () => {
    const el = await monter();
    expect(texte(el)).toContain('afs-aaaa-20260920T0300-admin.json.gz');
    const tester = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Tester') as HTMLButtonElement;
    expect(tester).toBeTruthy();
    await act(async () => { tester.click(); });
    const post = fetchMock.mock.calls.find(([url, init]) => String(url) === '/api/admin/backups/drill' && (init as RequestInit)?.method === 'POST');
    expect(post).toBeTruthy();
    await act(async () => { await Promise.resolve(); });
    expect(texte(el)).toContain('Essai de restauration');
    expect(texte(el)).toContain('base neuve');
  });

  it('exige la confirmation écrite « RESTAURER » et n’arme la restauration qu’alors', async () => {
    const el = await monter();
    const bouton = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Restaurer cette sauvegarde')) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    const champ = el.querySelector('input[placeholder="RESTAURER"]') as HTMLInputElement;
    const select = el.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      saisir(select, 'afs-aaaa-20260920T0300-admin.json.gz');
      saisir(champ, 'RESTAURER');
    });
    const apres = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Restaurer cette sauvegarde')) as HTMLButtonElement;
    expect(apres.disabled).toBe(false);
    expect(texte(el)).toContain('Reprise après sinistre');
    expect(texte(el)).toContain('refuse d’écraser des données existantes');
  });

  it('affiche le journal d’audit et sait l’exporter en CSV, sans dialogue natif', async () => {
    const conf = vi.spyOn(window, 'confirm');
    const el = await monter();
    expect(texte(el)).toContain('backup.run_manual');
    expect(texte(el)).toContain('admin@afrisupply.fr');
    const csv = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Exporter en CSV')) as HTMLButtonElement;
    await act(async () => { csv.click(); });
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/admin/audit?format=csv')).toBe(true);
    expect(conf).not.toHaveBeenCalled();
  });
});
