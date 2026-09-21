// Chantier 4 (audit) — la page Analyse doit RÉELLEMENT afficher ce qu'elle promet.
//
// Ce test ne vérifie pas que le fichier « contient du texte » : il monte le composant
// et lit le HTML produit. Il utilise une charge utile volontairement réaliste
// (montants au centime, indice à un seul mois de relevés, hausse à surveiller,
// plat sous son objectif de marge) et refuse les affirmations embellies.
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ state: { data: null as any, loading: false, error: null as string | null } }));
vi.mock('../lib/useApi', () => ({
  useApi: () => ({ ...h.state, reload: async () => {}, setData: () => {} }),
}));

import Analysis from './Analysis';
import { fmtEur } from '../lib/api';

const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const rico = {
  months,
  spend: {
    months, totals: [310.5, 288, 402.25, 366, 1355.53, 886.7], total: 3608.98,
    currentMonth: '2026-09', currentMonthTotal: 886.7, invoicedSharePct: 42,
    byCategory: [
      { category: 'viandes_poissons', totals: [120, 100, 150, 140, 700, 480], total: 1690 },
      { category: 'feculents', totals: [190.5, 188, 252.25, 226, 655.53, 406.7], total: 1918.98 },
    ],
  },
  bySupplier: [
    { supplierId: 's1', supplierName: 'Grossiste Marché Nantes', total: 2100.5, invoiced: true },
    { supplierId: 's2', supplierName: 'Boucherie Chez Moussa', total: 1508.48, invoiced: false },
  ],
  prices: [
    { category: 'feculents', points: [100, 100, 102.5, 102.5, 108.4, 109.3], monthCount: 6, productsTracked: 4, risingProducts: 2, avgProductChangePct: 4.4, firstPrice: 1.5, lastPrice: 1.64, changePct: 9.3 },
    { category: 'frais', points: [100], monthCount: 1, productsTracked: 1, risingProducts: 1, avgProductChangePct: 10, firstPrice: 0.8, lastPrice: 0.88, changePct: null },
  ],
  pricesInvoiced: [],
  drifts: [
    { productId: 'p-plantain', productName: 'Plantain', unit: 'kg', category: 'feculents', supplierName: 'Grossiste Marché Nantes', firstPrice: 1.5, lastPrice: 1.64, changePct: 9.3, quantitySince: 36, impactEur: 5, invoiced: true },
  ],
  watchlist: [
    { productId: 'p-tamarin', productName: 'Tamarin (pulpe)', unit: 'kg', category: 'epicerie', supplierName: 'Grossiste Marché Nantes', firstPrice: 6.8, lastPrice: 7.2, changePct: 5.9, quantitySince: 0, impactEur: 0, invoiced: false },
  ],
  explanation: {
    currentMonth: '2026-09', previousMonth: '2026-08', currentTotal: 886.7, previousTotal: 1355.53, deltaTotal: -468.83,
    priceEffectEur: -2.5, volumeEffectEur: -466.33,
    contributors: [
      { productId: 'p-capitaine', productName: 'Capitaine (thiof / mérou)', deltaEur: -129, pricePart: 0, volumePart: -129, reason: 'volume', productUrl: '/app/achats/comparer/p-capitaine' },
      { productId: 'p-plantain', productName: 'Plantain', deltaEur: 5, pricePart: 5, volumePart: 0, reason: 'prix', productUrl: '/app/achats/comparer/p-plantain' },
    ],
    sentence: 'Vos achats ont coûté 886,70 € en septembre 2026, soit 468,83 € de moins qu’en août 2026, notamment grâce à « Capitaine (thiof / mérou) » (-129,00 €).',
  },
  recipes: [
    { id: 'r1', name: 'Thiéboudienne', costPerPortion: 4.57, sellingPriceEur: 17, marginEur: 12.43, marginPct: 73.1, targetMarginPct: 75, portions30: 120, marginTotalEur: 1491.6, missingPrices: [], url: '/app/recettes', ingredients: [] },
    { id: 'r2', name: 'Saka-saka', costPerPortion: 2.59, sellingPriceEur: 14, marginEur: 11.41, marginPct: 81.5, targetMarginPct: 70, portions30: 40, marginTotalEur: 456.4, missingPrices: [], url: '/app/recettes', ingredients: [] },
  ],
  recipeHistory: [
    { id: 'r1', name: 'Thiéboudienne', points: [4.5, 4.5, 4.57, 4.57, 4.57, 4.57], firstCost: 4.5, lastCost: 4.57, changePct: 1.6 },
    { id: 'r2', name: 'Saka-saka', points: [2.64, 2.6, 2.59, 2.59, 2.59, 2.59], firstCost: 2.64, lastCost: 2.59, changePct: -1.9 },
  ],
  unitCosts: [],
};
const vide = {
  ...rico, drifts: [], watchlist: [], prices: [], pricesInvoiced: [], bySupplier: [], recipeHistory: [], recipes: [],
  spend: { ...rico.spend, totals: [0, 0, 0, 0, 0, 0], total: 0, currentMonthTotal: 0, invoicedSharePct: 0, byCategory: [] },
  explanation: { ...rico.explanation, currentTotal: 0, previousTotal: 0, deltaTotal: 0, priceEffectEur: 0, volumeEffectEur: 0, contributors: [], sentence: 'Vos achats sont stables : 0,00 € en septembre 2026, comme le mois précédent.' },
};

const rendu = (data: unknown) => {
  h.state.data = data; h.state.loading = false; h.state.error = null;
  return renderToStaticMarkup(<MemoryRouter><Analysis /></MemoryRouter>);
};

describe('Page Analyse — ce que le restaurateur voit vraiment', () => {
  it('répond en français, avec des chiffres, à « pourquoi mes coûts augmentent ? »', () => {
    const html = rendu(rico);
    expect(html).toContain('Pourquoi mes coûts');
    expect(html).toContain('886,70 €');                                  // le montant réel du mois
    expect(html).toContain('468,83 € de moins');                         // la phrase calculée, recopiée telle quelle
    expect(html).toContain('Capitaine (thiof / mérou)');
    expect(html).toContain('par le prix');                               // la part prix est distinguée
  });

  it('chiffre les hausses en euros et propose une action concrète', () => {
    const html = rendu(rico);
    expect(html).toContain('Plantain');
    expect(html).toContain('+9,3 %');
    expect(html).toContain(fmtEur(5, 0));                                // 36 kg × 0,14 €
    expect(html).toContain('/app/achats/comparer/p-plantain');
    expect(html).toContain('Comparer →');
  });

  it('ne prétend pas « 0 % » avec un seul mois de relevés et annonce la vraie variation produit', () => {
    const html = rendu(rico);
    expect(html).toContain('1 mois de relevés');
    expect(html).toContain('+10 % en moyenne');
    expect(html).not.toMatch(/>0 %</);
  });

  it('sépare les hausses qui coûtent de l’argent de celles à surveiller', () => {
    const html = rendu(rico);
    expect(html).toContain('À surveiller');
    expect(html).toContain('Tamarin (pulpe)');
    expect(html).toContain('Le montant exact sera chiffré dès votre prochain achat');
  });

  it('affiche la marge de chaque plat au coût réel et alerte sous l’objectif', () => {
    const html = rendu(rico);
    expect(html).toContain('Thiéboudienne');
    expect(html).toContain(fmtEur(4.57));                                // coût matière au dernier prix payé
    expect(html).toContain('+73,1 %');
    expect(html).toContain('est en dessous de votre objectif');          // 73,1 % < 75 % visés
    expect(html).toContain(fmtEur(1491.6, 0));                            // 120 portions × 12,43 €
  });

  it('n’affiche aucun chiffre fictif quand il n’y a pas encore de données', () => {
    const html = rendu(vide);
    expect(html).toContain('Rien à analyser');
    expect(html).toContain('saisissez le');
    expect(html).not.toContain('Comparer →');
    expect(html).not.toContain('À surveiller');
  });

  it('affiche l’erreur telle quelle plutôt qu’une page vide', () => {
    h.state.data = null; h.state.loading = false; h.state.error = 'Session expirée';
    expect(renderToStaticMarkup(<MemoryRouter><Analysis /></MemoryRouter>)).toContain('Session expirée');
  });

  it('affiche « Chargement… » tant que la réponse n’est pas là', () => {
    h.state.data = null; h.state.loading = true; h.state.error = null;
    expect(renderToStaticMarkup(<MemoryRouter><Analysis /></MemoryRouter>)).toContain('Chargement');
  });
});
