// Chantier 12 (audit) — « Mes données » : l'écran doit prouver au restaurant que ses données sont
// récupérables et que ses sauvegardes existent, sans jargon et sans chiffre inventé.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ data: null as any }));
vi.mock('../lib/useApi', () => ({ useApi: () => ({ data: h.data, loading: false, error: null, reload: async () => {}, setData: () => {} }) }));

import MesDonnees from './MesDonnees';

const statut = (over: Record<string, unknown> = {}) => ({
  lastBackupAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), lastBackupAgeHours: 2, copies: 14,
  retentionDays: 14, sizeBytes: 812_345, exportUrl: '/api/backup/export',
  note: 'Les sauvegardes sont faites automatiquement chaque jour par la plateforme ; vous pouvez à tout moment télécharger la vôtre.',
  ...over,
});

const monter = async (payload: unknown) => {
  h.data = payload;
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><MesDonnees /></MemoryRouter>); });
  return container;
};
const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['{}']), headers: new Headers() });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:test', revokeObjectURL: () => undefined });
});
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('chantier 12 — Mes données : export réel et sauvegardes visibles', () => {
  it('affiche l’état réel des sauvegardes (nombre, âge, conservation, taille)', async () => {
    const el = await monter(statut());
    const t = texte(el);
    expect(t).toContain('Sauvegardes de mon restaurant');
    expect(t).toContain('14');
    expect(t).toContain('il y a 2 h');
    expect(t).toContain('14 jours');
    expect(t).toContain('793 Ko');   // 812 345 octets ≈ 793 Ko
    expect(t).toContain('Ce qui se passe chaque nuit');
  });

  it('télécharge un fichier réel de l’API (pas un lien décoratif) et dit ce qu’il contient', async () => {
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const el = await monter(statut());
    const bouton = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Télécharger mes données')) as HTMLButtonElement;
    expect(bouton).toBeTruthy();
    await act(async () => { bouton.click(); });
    const appels = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(appels.some((u) => u === '/api/backup/export')).toBe(true);   // vraie requête à l'API
    expect(clic).toHaveBeenCalled();                                     // vrai téléchargement déclenché
    expect(texte(el)).toContain('produits, fournisseurs, offres et prix pratiqués');
  });

  it('dit clairement ce que le fichier ne contient PAS (mots de passe d’équipe)', async () => {
    const el = await monter(statut());
    const t = texte(el);
    expect(t).toContain('ne contient jamais les données d’un autre restaurant');
    expect(t).toContain('pas');
    expect(t).toContain('mots de passe');
    expect(t).toContain('empreinte SHA-256');
  });

  it('donne le support avec des horaires et un délai annoncés, et rappelle les droits RGPD', async () => {
    const el = await monter(statut());
    const t = texte(el);
    expect(t).toContain('bonjour@afrisupply.fr');
    expect(t).toContain('8 h – 20 h');
    expect(t).toContain('4 h ouvrées');
    expect(t).toContain('Zone dangereuse');
    expect(el.querySelector('a[href^="mailto:bonjour@afrisupply.fr"]')).toBeTruthy();
  });

  it('n’utilise aucun dialogue natif du navigateur pour un geste destructeur ou d’export', async () => {
    const conf = vi.spyOn(window, 'confirm');
    const alerte = vi.spyOn(window, 'alert');
    const el = await monter(statut());
    const bouton = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Télécharger')) as HTMLButtonElement;
    await act(async () => { bouton.click(); });
    expect(conf).not.toHaveBeenCalled();
    expect(alerte).not.toHaveBeenCalled();
  });
});
