// Navigation (passe « améliorer la navigation ») : menu groupé par intention, entrées qui
// manquaient (écarts & réclamations, mon abonnement), admin conditionnel, 404 utile, menu site.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { mockApi } from './helpers';

const me = (isAdmin = false) => ({
  user: { id: 'u1', email: 'test@ci.fr', fullName: 'Test CI', isAdmin },
  restaurants: [{ id: 'r1', name: 'Chez Test', city: 'Nantes', plan: 'trial', trialEndsAt: '2030-01-01', coversPerDay: 40, role: 'owner' }],
});

beforeEach(() => localStorage.clear());

describe('navigation', () => {
  it('première visite : / ouvre bien la page des produits (vitrine) — et le logo y mène', async () => {
    mockApi({
      'GET /public/catalog': () => ({ body: { items: [], total: 324, categories: {}, withPrice: 0 } }),
      'GET /public/vendors': () => ({ body: { vendors: [] } }),
      '*': () => ({ body: {} }),
    });
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByText(/Tous vos produits africains/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Rechercher un produit/)).toBeInTheDocument();
  });

  it('menu de l’app : sections lisibles + écarts & réclamations + mon abonnement', async () => {
    localStorage.setItem('afs_authed', '1');
    mockApi({
      'GET /auth/me': () => ({ body: me(false) }),
      'GET /alerts': () => ({ body: { alerts: [] } }),
      '*': () => ({ body: {} }),
    });
    window.history.pushState({}, '', '/app/import');
    render(<App />);
    expect(await screen.findByText('Commander')).toBeInTheDocument();
    expect(screen.getAllByText(/Écarts & réclamations/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Abonnement').length).toBeGreaterThan(0);
    // Le logo ramène TOUJOURS à la page d’accueil, quel que soit l’écran
    const logos = await screen.findAllByRole('link', { name: /afri/i });
    logos.forEach((l) => expect(l).toHaveAttribute('href', '/'));
    // Et il y a un bouton explicite « Retour à l’accueil » → la vitrine /
    const homeBtn = screen.getByRole('link', { name: /retour à l.accueil/i });
    expect(homeBtn).toHaveAttribute('href', '/');
    expect(screen.queryByText('Admin AFRISUPPLY')).not.toBeInTheDocument();
  });

  it('bloc admin visible uniquement pour l’admin', async () => {
    localStorage.setItem('afs_authed', '1');
    mockApi({
      'GET /auth/me': () => ({ body: me(true) }),
      'GET /alerts': () => ({ body: { alerts: [] } }),
      '*': () => ({ body: {} }),
    });
    window.history.pushState({}, '', '/app/import');
    render(<App />);
    expect(await screen.findByText('Admin AFRISUPPLY')).toBeInTheDocument();
    expect(screen.getAllByText('Cockpit pilotes').length).toBeGreaterThan(0);
  });

  it('inconnu dans l’app : 404 utile (pas de redirection muette)', async () => {
    localStorage.setItem('afs_authed', '1');
    mockApi({
      'GET /auth/me': () => ({ body: me(false) }),
      'GET /alerts': () => ({ body: { alerts: [] } }),
      '*': () => ({ body: {} }),
    });
    window.history.pushState({}, '', '/app/page-qui-nexiste-pas');
    render(<App />);
    expect(await screen.findByText('Page introuvable')).toBeInTheDocument();
  });

  it('site : FAQ dans l’en-tête, « Mon espace » pour un visiteur connecté', async () => {
    localStorage.setItem('afs_authed', '1');
    mockApi({
      'GET /auth/me': () => ({ body: me(false) }),
      'GET /public/proof': () => ({ body: { testimonials: [], metrics: { referenceProducts: 324, recipeTemplates: 31, nps: null, npsResponses: 0, founderSeats: 20 } } }),
      '*': () => ({ body: {} }),
    });
    window.history.pushState({}, '', '/tarifs');
    render(<App />);
    expect(await screen.findAllByRole('link', { name: 'FAQ' })).toHaveLength(2); // en-tête + pied de page
    expect(screen.getAllByRole('link', { name: 'Mon espace' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument();
    // Bouton « Retour à l’accueil » dans l’en-tête du site (desktop + mobile) → /
    const homeBtns = screen.getAllByRole('link', { name: /retour à l.accueil/i });
    expect(homeBtns.length).toBeGreaterThan(0);
    homeBtns.forEach((l) => expect(l).toHaveAttribute('href', '/'));
  });
});
