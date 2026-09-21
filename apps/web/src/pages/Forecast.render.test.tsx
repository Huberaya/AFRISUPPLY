// Chantier 9 (audit 2) — « la prévision se vide en dix jours ». L'écran doit dire d'où viennent
// les chiffres et ce qui manque pour les améliorer, au lieu d'afficher des nombres muets.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ data: null as any }));
vi.mock('../lib/useApi', () => ({ useApi: () => ({ data: h.data, loading: false, error: null, reload: async () => {}, setData: () => {} }) }));

import Forecast from './Forecast';

const produit = (over: Record<string, unknown> = {}) => ({
  productId: 'p1', productName: 'Riz parfumé', unit: 'kg', horizonDays: 7, predictedNeed: 10.5, currentStock: 2, safetyStock: 3,
  recommendedOrder: 11.5, daysOfStockLeft: 1.3, stockoutDay: '2026-09-22', confidence: 0.85, perDay: [1, 2, 0, 1.5, 1.5, 2, 2.5],
  explanation: 'Besoin estimé de 10,5 kg sur 7 jours, calculé à partir de 2 recettes et de vos ventes des 4 dernières semaines (pic samedi). Stock actuel 2 kg → rupture prévue mardi. Commande recommandée : 11,5 kg (inclut 2 j de sécurité).',
  basis: 'ventes_28j', seasonCoef: 1, ...over,
});

const data = (over: Record<string, unknown> = {}) => ({
  horizonDays: 7, salesDays: 20,
  products: [produit()],
  recipes: [{ recipeId: 'r1', name: 'Mafé bœuf', total: 42, confidence: 0.85, perDay: [6, 6, 0, 6, 8, 8, 8], basis: 'ventes_28j' }],
  dataQuality: {
    salesDays: 20, lastSaleDay: '2026-09-17', daysSinceLastSale: 4, coversPerDay: 120, closedWeekdays: [1], peakMonths: [9], sources: { ventes_28j: 1, ventes_7j: 0, couverts: 0, seuils: 0 },
  },
  ...over,
});

const monter = async (payload: unknown) => {
  h.data = payload;
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { createRoot(container).render(<MemoryRouter><Forecast /></MemoryRouter>); });
  return container;
};

afterEach(() => { document.body.innerHTML = ''; });

describe('chantier 9 — écran Prévision : la source est toujours visible', () => {
  it('prévision calculée sur les ventes : étiquette « Vos ventes » et dernière saisie affichée', async () => {
    const el = await monter(data());
    const txt = (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
    expect(txt).toContain('Riz parfumé');
    expect(txt).toContain('Vos ventes (4 sem.)');
    expect(txt).toContain('17/09');
    expect(txt).toContain('il y a 4 jour(s)');
    expect(txt).toContain('Source');
    expect(txt).toContain('mar. 22/09');           // jour de rupture prévu
  });

  it('produits estimés faute de ventes : bandeau explicite + lien pour saisir les ventes', async () => {
    const el = await monter(data({
      salesDays: 3,
      products: [produit({ basis: 'couverts', confidence: 0.3, explanation: 'Estimation de repli à partir de vos couverts : saisissez vos ventes pour l’affiner jour par jour.', seasonCoef: 1 })],
      dataQuality: { ...data().dataQuality, salesDays: 3, sources: { ventes_28j: 0, ventes_7j: 0, couverts: 1, seuils: 0 } },
    }));
    const txt = (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
    expect(txt).toContain('D’où viennent ces chiffres ?');
    expect(txt).toContain('Estimé (couverts)');
    expect(txt).toContain('1 produit(s)');
    expect(txt).toContain('saisir les ventes du jour');
    expect(txt).toContain('Jours de fermeture exclus');           // ce que la prévision applique déjà
    expect(txt).toContain('pleine activité');
    expect(el.querySelectorAll('a[href="/app/ventes"]').length).toBeGreaterThan(0);
  });

  it('aucune donnée : la page le dit au lieu de faire croire à une mesure', async () => {
    const el = await monter(data({
      salesDays: 0,
      products: [produit({ basis: 'seuils', confidence: 0.15, predictedNeed: 0, recommendedOrder: 2, stockoutDay: null, perDay: [0, 0, 0, 0, 0, 0, 0], seasonCoef: 1, explanation: 'Besoin estimé de 0 kg sur 7 jours… Aucune vente ni couvert renseigné : la commande recommandée vient uniquement de votre seuil critique.' })],
      dataQuality: { salesDays: 0, lastSaleDay: null, daysSinceLastSale: null, coversPerDay: null, closedWeekdays: [], peakMonths: [], sources: { ventes_28j: 0, ventes_7j: 0, couverts: 0, seuils: 1 } },
    }));
    const txt = (el.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
    expect(txt).toContain('Seuils seulement');
    expect(txt).toContain('Aucune vente n’est enregistrée pour l’instant');
    expect(txt).toContain('—');            // dernière saisie inconnue
  });

  it('saisonnalité appliquée : le coefficient est visible sur la ligne produit', async () => {
    const el = await monter(data({ products: [produit({ seasonCoef: 1.3 })] }));
    expect(el.textContent ?? '').toContain('saison ×1.3');
  });
});
