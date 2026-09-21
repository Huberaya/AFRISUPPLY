// Chantier 5 (audit) — inventaire de stock : le comptage en lot parle le vrai contrat d'API
// (POST /stock/inventory {counts: [{itemId, quantity}]} — jamais newQuantity, jamais d'invention).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Stock from '../pages/Stock';
import { mockApi } from './helpers';

describe('stock : inventaire en lot', () => {
  it('compte les articles et envoie le contrat exact attendu par l\'API', async () => {
    const { calls } = mockApi({
      'GET /stock': () => ({ body: { items: [{ id: 'i1', productId: 'p1', name: 'Riz parfumé', category: 'feculents', unit: 'kg', quantity: 12, criticalLevel: 5, targetLevel: 20, avgDailyUse: 2, daysLeft: 6, status: 'ok', preferredSupplier: null, preferredSupplierId: null, lastCountedAt: null }] } }),
      'GET /suppliers': () => ({ body: { suppliers: [] } }),
      'POST /stock/inventory': () => ({ body: { counted: 1, adjusted: 1, totalDelta: -5 } }),
    });
    render(<MemoryRouter><Stock /></MemoryRouter>);
    const user = userEvent.setup();
    expect(await screen.findByText('Riz parfumé')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Inventaire/ }));
    const input = await screen.findByPlaceholderText('12');
    await user.type(input, '7');
    await user.click(screen.getByRole('button', { name: /Valider/ }));

    const post = calls.find((c) => c.method === 'POST' && c.path === '/stock/inventory')!;
    expect(post.body).toEqual({ counts: [{ itemId: 'i1', quantity: 7 }], note: 'Inventaire' });
    // le résultat du comptage est affiché au restaurateur
    expect(await screen.findByText(/1 article compté/)).toBeInTheDocument();
  });
});
