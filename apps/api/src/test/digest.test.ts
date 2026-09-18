import { describe, it, expect } from 'vitest';
import { buildDigest, digestHeadline, type DigestInput } from '../lib/digest.js';

const base: DigestInput = {
  restaurantName: 'Chez Awa', firstName: 'Awa', date: new Date('2026-09-18T05:30:00Z'), appUrl: 'https://app.afrisupply.fr',
  stock: { critique: 2, bas: 5, ok: 20, urgent: [] }, cart: null, autoReorder: [], priceAlerts: [], opportunities: [],
  discrepancies: { count: 0, openValue: 0 }, pendingOrders: [], salesYesterday: 120, spend: { thisMonth: 1035.2, evolutionPct: 12.5 },
};

describe('digest du matin', () => {
  it('journée calme : mail court, titre rassurant', () => {
    const d = buildDigest(base);
    expect(d.isEmpty).toBe(true);
    expect(d.subject).toMatch(/Tout est sous contrôle/);
    expect(d.text).toContain('Bonjour Awa,'); expect(d.text).toContain('120 portions saisies hier'); expect(d.text).toContain('1035,20 €');
    expect(d.html).toContain('<!doctype html>'); expect(d.html).not.toContain('<script');
  });
  it('urgences en tête, panier, auto-reorder, écarts et liens vers l’app', () => {
    const d = buildDigest({
      ...base,
      stock: { ...base.stock, urgent: [{ productName: 'Plantain', unit: 'kg', quantity: 14, daysLeft: 1.8, stockoutDay: '2026-09-20', recommendedOrder: 31 }, { productName: 'Cube bouillon', unit: 'piece', quantity: 180, daysLeft: 3.5, stockoutDay: null, recommendedOrder: 279.2 }] },
      cart: { total: 1246.2, saving: 27.5, supplierCount: 5, lineCount: 31 },
      autoReorder: [{ productName: 'Huile de palme rouge', supplierName: 'Sahel Épices', total: 64.5, reference: 'AFS-2026-000014' }],
      discrepancies: { count: 1, openValue: 16.8 }, salesYesterday: null,
    });
    expect(d.isEmpty).toBe(false);
    expect(d.subject).toBe('☀️ Votre matin AFRISUPPLY — 2 produits à commander aujourd’hui — Plantain en premier');
    expect(d.text).toContain('Plantain : 14 kg en stock (1,8 j), rupture dimanche 20 → commander 31 kg');
    expect(d.text).toContain('280 pièces'); // unités comptables arrondies au supérieur
    expect(d.text).toContain('31 produits chez 5 fournisseurs pour 1246,20 € — 27,50 € d’économie');
    expect(d.text).toContain('AFS-2026-000014');
    expect(d.text).toContain('16,80 € à récupérer');
    expect(d.text).toContain('Ventes d’hier non saisies');
    expect(d.html).toContain('https://app.afrisupply.fr/app/achats/panier'); expect(d.html).toContain('https://app.afrisupply.fr/app/achats/ecarts');
  });
  it('échappe le HTML des données', () => {
    const d = buildDigest({ ...base, priceAlerts: [{ title: 'x', message: 'Prix <b>hack</b> & co' }] });
    expect(d.html).toContain('Prix &lt;b&gt;hack&lt;/b&gt; &amp; co');
  });
  it('titre : priorité ruptures > prix > écarts', () => {
    expect(digestHeadline({ ...base, priceAlerts: [{ title: '', message: '' }] })).toMatch(/hausse de prix/);
    expect(digestHeadline({ ...base, discrepancies: { count: 2, openValue: 40 } })).toMatch(/40,00 € à récupérer/);
  });
});
