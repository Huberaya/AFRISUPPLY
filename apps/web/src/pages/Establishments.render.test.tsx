// Chantier 8 (audit) — « Mes établissements » : un utilisateur qui appartient à plusieurs
// restaurants doit voir où il a le droit d'agir (rôle) et changer d'établissement sans se perdre.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ restaurants: [] as any[], current: null as string | null, switchRestaurant: vi.fn() }));
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ restaurants: h.restaurants, restaurant: h.restaurants.find((r) => r.id === h.current) ?? null, switchRestaurant: h.switchRestaurant, loading: false }),
}));

import Establishments from './Establishments';

const resto = (id: string, name: string, role: string, plan = 'pro') => ({ id, name, city: 'Nantes', plan, trialEndsAt: null, coversPerDay: 100, role });

const monter = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><Establishments /></MemoryRouter>); });
  return container;
};

afterEach(() => { document.body.innerHTML = ''; h.switchRestaurant.mockReset(); });

describe('chantier 8 — mes établissements', () => {
  it('liste les établissements avec rôle et formule, et marque celui qui est ouvert', async () => {
    h.restaurants = [resto('r1', 'Chez Awa', 'owner'), resto('r2', 'Chez Kofi', 'staff', 'starter')];
    h.current = 'r1';
    const el = await monter();
    const txt = el.textContent ?? '';
    expect(txt).toContain('Chez Awa'); expect(txt).toContain('Chez Kofi');
    expect(txt).toContain('Propriétaire'); expect(txt).toContain('Employé');
    expect(txt).toContain('Établissement ouvert');
    expect(txt).toContain('Starter');
    expect(txt).toContain('Employé : achats, stock et réception');
  });

  it('propose d’ouvrir un autre établissement et le fait vraiment', async () => {
    h.restaurants = [resto('r1', 'Chez Awa', 'owner'), resto('r2', 'Chez Kofi', 'manager')];
    h.current = 'r1';
    const el = await monter();
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Ouvrir cet établissement'))!;
    expect(btn).toBeTruthy();
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(h.switchRestaurant).toHaveBeenCalledWith('r2');
  });

  it('un seul établissement : aucun bouton inutile', async () => {
    h.restaurants = [resto('r1', 'Chez Awa', 'owner')];
    h.current = 'r1';
    const el = await monter();
    const txt = el.textContent ?? '';
    expect(txt).toContain('Établissement ouvert');
    expect(txt).not.toContain('Ouvrir cet établissement');
    expect(txt).toContain('rien n’est mélangé entre deux restaurants');
  });

  it('aucun établissement (invitation non acceptée) : message utile', async () => {
    h.restaurants = []; h.current = null;
    const el = await monter();
    expect(el.textContent ?? '').toContain('Aucun établissement associé');
  });
});
