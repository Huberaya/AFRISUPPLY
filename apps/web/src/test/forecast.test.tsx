// Chantier 5 (audit) — la prévision se raconte et se pilote côté web (Chantier 4) :
// explication visible + déclaration d'une soirée privatisée (coef de fréquentation).
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Forecast from '../pages/Forecast';
import { mockApi } from './helpers';

const pf = {
  productId: 'p1', productName: 'Riz parfumé', unit: 'kg', horizonDays: 7, predictedNeed: 24, currentStock: 10,
  safetyStock: 4, recommendedOrder: 18, daysOfStockLeft: 2, stockoutDay: '2026-09-25', confidence: 0.8,
  explanation: 'Besoin estimé de 24 kg sur 7 jours, calculé à partir de 1 recette et de vos ventes des 4 dernières semaines.',
  perDay: [3, 3, 4, 4, 4, 3, 3],
};

describe('prévision : explication + soirée privatisée', () => {
  it('affiche le détail du calcul et déclare un événement avec son coef', async () => {
    let events: unknown[] = [];
    const { calls } = mockApi({
      'GET /forecast': () => ({ body: { horizonDays: 7, products: [pf], recipes: [{ recipeId: 'r1', name: 'Couscous', total: 20, confidence: 0.8, perDay: [3, 3, 3, 3, 3, 3, 3] }], salesDays: 12, events } }),
      'PUT /forecast/events': (body) => {
        const ev = (body as { events: Array<Record<string, unknown>> }).events[0];
        events = [{ id: 'e1', ...ev }];
        return { body: { saved: 1 } };
      },
      'DELETE /forecast/events/e1': () => { events = []; return { body: { deleted: true } }; },
    });
    render(<MemoryRouter><Forecast /></MemoryRouter>);
    const user = userEvent.setup();

    // chaque chiffre est expliqué : clic sur la ligne produit → l'explication s'affiche
    await user.click(await screen.findByText('Riz parfumé'));
    expect(await screen.findByText(/Besoin estimé de 24 kg sur 7 jours/)).toBeInTheDocument();

    // déclarer une soirée privatisée ×1,5
    fireEvent.change(screen.getByLabelText(/Date/), { target: { value: '2026-10-12' } });
    await user.type(screen.getByLabelText(/Intitulé/), 'Soirée privatisée');
    await user.click(screen.getByRole('button', { name: /Déclarer/ }));

    const put = calls.find((c) => c.method === 'PUT' && c.path === '/forecast/events')!;
    expect(put.body).toEqual({ events: [{ day: '2026-10-12', label: 'Soirée privatisée', multiplier: 1.5 }] });
    // l'événement déclaré s'affiche (intitulé + coef) et peut être retiré
    expect(await screen.findByText(/Soirée privatisée ×1,5/)).toBeInTheDocument();
    await user.click(screen.getByTitle('Supprimer cet événement'));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/forecast/events/e1')).toBe(true));
  });
});
