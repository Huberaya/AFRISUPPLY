// Chantier 5 (audit) — le client web raconte la vérité des coûts (Chantier 3) :
// coût total = colis + livraison (+ minimum), justification honnête.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Compare from '../pages/Compare';
import { mockApi } from './helpers';

const offer = (over: Record<string, unknown>) => ({
  offerId: 'o1', supplierId: 's1', supplierName: 'Fournisseur', packLabel: 'Sac 10 kg', packQty: 10,
  packPrice: 20, unitPrice: 2, inStock: true, leadTimeHours: 24, deliveryFee: 0, reliabilityPct: 90,
  score: 0.9, packs: 1, goodsEur: 20, totalCostEur: 20, underMin: false, strengths: [], weaknesses: [], ...over,
});

describe('comparateur : coût total honnête (B8)', () => {
  it('recommande le vrai moins cher, livraison incluse, et l\'explique', async () => {
    const cherOfferte = offer({ offerId: 'o1', supplierName: 'Cher Offerte', packPrice: 20, totalCostEur: 20, strengths: ['Livraison offerte'] });
    const pasCherPayante = offer({ offerId: 'o2', supplierName: 'PasCher Payante', packPrice: 15, totalCostEur: 21, deliveryFee: 6, strengths: [], weaknesses: ['Livraison payante : 6 €'] });
    mockApi({
      'GET /compare/p1': () => ({ body: {
        product: { name: 'Riz parfumé', baseUnit: 'kg' },
        stock: { quantity: 4, daysLeft: 2, status: 'critique', targetLevel: 20 },
        neededQty: 10,
        ranked: [cherOfferte, pasCherPayante],
        recommended: cherOfferte,
        headline: 'Le meilleur coût total pour 10 kg',
        justification: ['Coût total 20,00 € — le plus bas malgré un prix de colis plus élevé.', 'Livraison offerte.'],
      } }),
    });
    render(
      <MemoryRouter initialEntries={['/achats/comparer/p1']}>
        <Routes><Route path="/achats/comparer/:productId" element={<Compare />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Comparer : Riz parfumé')).toBeInTheDocument();
    // la recommandation honnête = « Cher Offerte » (20 € livrés devant 15 + 6 = 21 €)
    expect(screen.getByRole('button', { name: /Commander chez Cher Offerte/ })).toBeInTheDocument();
    expect(screen.getByText(/Coût total 20,00 €/)).toBeInTheDocument();
    // le détail des coûts est affiché : livraison offerte ET « dont 6,00 € de livraison »
    expect(screen.getByText(/livraison offerte/)).toBeInTheDocument();
    expect(screen.getByText(/dont 6,00/)).toBeInTheDocument();
    expect(screen.getByText(/de livraison/)).toBeInTheDocument();
    // l'explication du calcul est au pied du tableau
    expect(screen.getByText(/Coût total = pour 10 kg : colis \+ livraison/)).toBeInTheDocument();
  });
});
