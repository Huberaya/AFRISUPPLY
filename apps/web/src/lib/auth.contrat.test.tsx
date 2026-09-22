// Contrat du contexte d'authentification — ajouté après l'incident de fusion du 22 septembre 2026.
//
// Ce qui s'est passé : lors d'une fusion, `lib/auth.tsx` a été repris d'une autre version alors que
// `components/AppLayout.tsx` restait la nôtre. Le type `User` avait perdu `emailVerified` et le contexte
// `accessNotice` — or `AppLayout` commence par `if (!user || user.emailVerified !== false) return null;`.
// Avec la propriété absente, la condition était toujours vraie : **écran blanc pour tout le monde**.
// Les tests existants montaient les écrans en se moquant de `useAuth` (donc ils ne voyaient rien), et la
// suite de bout en bout interroge l'API sans exécuter la coquille de l'application.
//
// Ce test-ci monte le VRAI `AuthProvider` (aucune moquerie du contexte) et lit les trois informations
// dont dépend l'affichage : l'adresse confirmée ou non, la date de confirmation, et le bandeau d'accès.
// Si l'une d'elles disparaît du contexte, ce fichier ne compile plus — donc `npm run typecheck`, l'étape
// « Types » de la CI, échoue avant la mise en ligne.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const reponse = {
  user: {
    id: 'u1', email: 'awa@chezawa.fr', fullName: 'Awa Diallo',
    emailVerified: true, emailVerifiedAt: '2026-09-20T10:00:00.000Z',
  },
  restaurants: [{ id: 'r1', name: 'Chez Awa', city: 'Nantes', plan: 'pro', trialEndsAt: null, coversPerDay: 120, role: 'owner' }],
};

vi.mock('./api', () => ({
  api: vi.fn(async () => reponse),
  tokenStore: {
    authed: () => true,
    setAuthed: () => {},
    clear: () => {},
    restaurant: () => 'r1',
    setRestaurant: () => {},
    clearRestaurant: () => {},
  },
}));

import { AuthProvider, useAuth } from './auth';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Sonde : affiche exactement ce que l'application lit du contexte (aucune valeur inventée). */
function Sonde() {
  const { user, restaurant, accessNotice, clearAccessNotice } = useAuth();
  return (
    <div>
      <p data-testid="adresse">
        {user ? (user.emailVerified ? `confirmée le ${user.emailVerifiedAt}` : 'non confirmée') : 'pas connecté'}
      </p>
      <p data-testid="etablissement">{restaurant ? `${restaurant.name} (${restaurant.role})` : 'aucun'}</p>
      <p data-testid="bandeau">{accessNotice ?? 'aucun bandeau'}</p>
      <button onClick={clearAccessNotice}>fermer</button>
    </div>
  );
}

const monter = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<AuthProvider><Sonde /></AuthProvider>); });
  await act(async () => { await Promise.resolve(); });
  return { container, root };
};

const lire = (container: HTMLElement, cle: string) => container.querySelector(`[data-testid="${cle}"]`)?.textContent ?? '';

describe('contexte d’authentification — le contrat lu par la coquille de l’application', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('expose l’état de l’adresse e-mail (indispensable : AppLayout masque tout si elle est absente)', async () => {
    const { container, root } = await monter();
    expect(lire(container, 'adresse')).toBe('confirmée le 2026-09-20T10:00:00.000Z');
    expect(lire(container, 'etablissement')).toBe('Chez Awa (owner)');
    await act(async () => { root.unmount(); });
  });

  it('affiche un bandeau quand le serveur signale que l’établissement n’est plus accessible, et sait le fermer', async () => {
    const { container, root } = await monter();
    expect(lire(container, 'bandeau')).toBe('aucun bandeau');

    await act(async () => {
      window.dispatchEvent(new CustomEvent('afs:access', { detail: { error: 'Accès refusé à cet établissement' } }));
    });
    expect(lire(container, 'bandeau')).toContain('Accès refusé à cet établissement');

    const bouton = container.querySelector('button') as HTMLButtonElement;
    await act(async () => { bouton.click(); });
    expect(lire(container, 'bandeau')).toBe('aucun bandeau');

    await act(async () => { root.unmount(); });
  });
});
