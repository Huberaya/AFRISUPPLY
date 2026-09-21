// Chantier 11 (audit UX) — la navigation doit se lire sans formation.
//
// Ce test monte réellement la coquille de l'application (menu latéral, recherche, barre mobile)
// et vérifie ce que voit un restaurateur :
//   • le menu est découpé par tâche (« Aujourd'hui / Commander / Mon stock / Comprendre / Mon compte ») ;
//   • les écrans d'écriture sont masqués pour un employé, visibles pour un responsable ;
//   • la recherche trouve un écran par son nom ou par sa phrase, même sans accents (« equipe ») ;
//   • le téléphone a une barre d'onglets en bas pour les 4 gestes du quotidien ;
//   • la cloche affiche le nombre d'alertes réelles renvoyées par l'API.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  role: 'owner' as 'owner' | 'manager' | 'staff',
  alerts: { alerts: [{ isRead: false }, { isRead: false }, { isRead: true }] } as { alerts: { isRead: boolean }[] },
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'awa@chezawa.fr', fullName: 'Awa Diallo', isAdmin: false },
    restaurant: { id: 'r1', name: 'Chez Awa', plan: 'pro', role: h.role },
    restaurants: [{ id: 'r1', name: 'Chez Awa', role: h.role }],
    logout: async () => {},
    switchRestaurant: () => {},
    accessNotice: null,
    clearAccessNotice: () => {},
    refresh: async () => {},
  }),
}));
vi.mock('../lib/useApi', () => ({ useApi: () => ({ data: h.alerts, loading: false, error: null, reload: async () => {}, setData: () => {} }) }));
vi.mock('../lib/api', () => ({
  api: vi.fn(async () => ({})),
  tokenStore: { get: () => 'jeton', set: () => {}, clear: () => {}, restaurant: () => null, setRestaurant: () => {} },
}));

import { FeedbackProvider } from './Feedback';
import AppLayout from './AppLayout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const monter = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(<MemoryRouter initialEntries={['/app']}><FeedbackProvider><AppLayout /></FeedbackProvider></MemoryRouter>);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return container;
};

/** Saisit une valeur dans un input contrôlé par React (comme un vrai clavier). */
const saisir = async (input: HTMLInputElement, valeur: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(input, valeur); input.dispatchEvent(new Event('input', { bubbles: true })); });
};

const lien = (c: ParentNode, href: string) => c.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);

describe('chantier 11 — menu découpé par tâche', () => {
  beforeEach(() => { h.role = 'owner'; });

  it('affiche les 5 sections et les écrans du parcours d’achat', async () => {
    const c = await monter();
    const menu = c.querySelector('nav')!;
    for (const titre of ['Aujourd’hui', 'Commander', 'Mon stock', 'Comprendre', 'Mon compte']) expect(menu.textContent).toContain(titre);
    for (const href of ['/app/achats', '/app/achats/panier', '/app/stock', '/app/stock/prevision', '/app/analyse', '/app/ia', '/app/equipe', '/app/abonnement']) {
      expect(lien(menu, href), `entrée de menu manquante : ${href}`).toBeTruthy();
    }
  });

  it('explique à quoi sert chaque écran (pas seulement un nom)', async () => {
    const c = await monter();
    const menu = c.querySelector('nav')!;
    expect(menu.textContent).toContain('quoi commander, chez qui, à quel prix');
    expect(menu.textContent).toContain('pourquoi mes coûts augmentent');
  });

  it('masque les écrans d’écriture à un employé, les garde pour un responsable', async () => {
    h.role = 'staff';
    const staff = await monter();
    const navStaff = staff.querySelector('nav')!;
    expect(lien(navStaff, '/app/achats/panier')).toBeNull();
    expect(lien(navStaff, '/app/fournisseurs')).toBeNull();
    expect(lien(navStaff, '/app/parametres')).toBeNull();
    expect(lien(navStaff, '/app/stock')).toBeTruthy();
    staff.remove();

    h.role = 'manager';
    const chef = await monter();
    const navChef = chef.querySelector('nav')!;
    expect(lien(navChef, '/app/achats/panier')).toBeTruthy();
    expect(lien(navChef, '/app/parametres')).toBeTruthy();
  });

  it('trouve un écran par recherche, même sans accents ni majuscules', async () => {
    const c = await monter();
    const champ = c.querySelector<HTMLInputElement>('input[aria-label="Chercher un écran"]')!;
    expect(champ).toBeTruthy();

    await saisir(champ, 'panier');
    let menu = c.querySelector('nav')!;
    expect(lien(menu, '/app/achats/panier')).toBeTruthy();
    expect(lien(menu, '/app/stock')).toBeNull();
    expect(menu.textContent).toContain('Commander');

    await saisir(champ, 'equipe');
    menu = c.querySelector('nav')!;
    expect(lien(menu, '/app/equipe')).toBeTruthy();
    expect(lien(menu, '/app/stock')).toBeNull();

    await saisir(champ, 'zzz introuvable');
    menu = c.querySelector('nav')!;
    expect(menu.textContent).toContain('Aucun écran ne correspond');
    expect(menu.textContent).toContain('Essayez « stock », « panier »');
  });

  it('donne une barre d’onglets sur téléphone et le compteur d’alertes réelles', async () => {
    const c = await monter();
    const barre = c.querySelector('nav[aria-label="Navigation rapide"]')! as HTMLElement;
    expect(barre).toBeTruthy();
    expect(barre.className).toContain('lg:hidden');
    for (const href of ['/app', '/app/stock', '/app/achats', '/app/ia']) expect(lien(barre, href), `onglet manquant : ${href}`).toBeTruthy();
    // 2 alertes non lues sur 3 : la cloche l'annonce aux lecteurs d'écran et affiche « 2 ».
    const cloche = c.querySelector('a[aria-label="2 alerte(s) non lue(s)"]');
    expect(cloche).toBeTruthy();
    expect(cloche!.textContent).toContain('2');
  });
});
