// Chantier 9 (audit 2) — « la prévision ne doit jamais être absente ».
// Ces tests vérifient la cascade de sources, les jours de fermeture, la saisonnalité
// et le rappel doux « ventes non saisies » — pas seulement le cas idéal où tout est saisi.
import { describe, it, expect } from 'vitest';
import { forecastRecipes, forecastProducts, parseSeasonality, weakestBasis, type StockRow } from '../lib/forecast.js';

const today = new Date('2026-09-18T12:00:00Z'); // vendredi
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (n: number) => iso(new Date(today.getTime() - n * 86_400_000));

// 8 semaines complètes : 10 portions/jour en semaine, 20 le samedi, fermé le lundi.
const full: { recipeId: string; day: string; portions: number }[] = [];
for (let d = 56; d >= 1; d--) { const date = new Date(today.getTime() - d * 86_400_000); if (date.getUTCDay() === 1) continue; full.push({ recipeId: 'r1', day: iso(date), portions: date.getUTCDay() === 6 ? 20 : 10 }); }

const stock = (over: Partial<StockRow> = {}): StockRow => ({ productId: 'riz', productName: 'Riz parfumé', unit: 'kg', quantity: 5, criticalLevel: 3, targetLevel: 40, ...over });

describe('chantier 9 — cascade de prévision', () => {
  it('des ventes récentes mais partielles → source « semaine écoulée » et prévision non nulle', () => {
    // 2 jours de ventes seulement, tous dans les 7 derniers jours (aucun jour de semaine couvert 4 fois)
    const sales = [{ recipeId: 'r1', day: day(2), portions: 12 }, { recipeId: 'r1', day: day(5), portions: 18 }];
    const rf = forecastRecipes(sales, ['r1'], { horizonDays: 7, today });
    const f = rf.get('r1')!;
    expect(f.basis).toBe('ventes_7j');
    expect(f.total).toBeGreaterThan(0);
    // Fusion avec le « démarrage à froid » : 2 jours de ventes ne justifient pas la confiance d'une
    // semaine complète (0,45) — on retient la plus prudente des deux lectures (0,4).
    expect(f.confidence).toBe(0.4);
    const [pf] = forecastProducts(rf, [{ recipeId: 'r1', productId: 'riz', quantity: 0.15 }], [stock()], { horizonDays: 7, today });
    expect(pf.basis).toBe('ventes_7j');
    expect(pf.predictedNeed).toBeGreaterThan(0);
    expect(pf.explanation).toMatch(/vos ventes de la semaine écoulée/);
  });

  it('aucune vente mais des couverts → estimation « couverts », expliquée comme telle', () => {
    const rf = forecastRecipes([], ['r1', 'r2'], { horizonDays: 7, today, coversPerDay: 120 });
    const f = rf.get('r1')!;
    expect(f.basis).toBe('couverts');
    expect(f.total).toBeGreaterThan(0);              // 120 couverts × 1/2 part × 7 jours
    expect(f.total).toBeLessThanOrEqual(120 * 7);
    const [pf] = forecastProducts(rf, [{ recipeId: 'r1', productId: 'riz', quantity: 0.15 }], [stock()], { horizonDays: 7, today, coversPerDay: 120 });
    expect(pf.basis).toBe('couverts');
    expect(pf.predictedNeed).toBeGreaterThan(0);
    expect(pf.confidence).toBe(0.3);
    expect(pf.explanation).toMatch(/nombre de couverts|saisissez vos ventes/);
    expect(pf.explanation).toMatch(/Estimation de repli/);
    // La part d'un plat déjà vendu est respectée quand les ventes existent ailleurs.
    const salesOther = [{ recipeId: 'r2', day: day(3), portions: 30 }, { recipeId: 'r2', day: day(4), portions: 30 }];
    const rf2 = forecastRecipes(salesOther, ['r1', 'r2'], { horizonDays: 7, today, coversPerDay: 120 });
    expect(rf2.get('r2')!.basis).toBe('ventes_7j');
    expect(rf2.get('r1')!.basis).toBe('couverts');
  });

  it('ni ventes ni couverts → source « seuils » : la prévision n’invente rien', () => {
    const rf = forecastRecipes([], ['r1'], { horizonDays: 7, today });
    const f = rf.get('r1')!;
    expect(f.basis).toBe('seuils'); expect(f.total).toBe(0);
    const [pf] = forecastProducts(rf, [{ recipeId: 'r1', productId: 'riz', quantity: 0.15 }], [stock()], { horizonDays: 7, today });
    expect(pf.basis).toBe('seuils');
    expect(pf.predictedNeed).toBe(0);
    // Au DÉMARRAGE À FROID (aucune vente jamais saisie), la recommandation suit l'objectif que le
    // restaurant a lui-même fixé : on complète jusqu'à 40 kg (politique s,S) — 40 − 5 = 35 kg.
    // Le besoin prévisionnel, lui, reste 0 : on n'invente aucune consommation.
    expect(pf.recommendedOrder).toBe(35);
    // Sans objectif fixé, on retombe sur le comportement d'origine : remonter au seuil critique.
    const [low] = forecastProducts(rf, [{ recipeId: 'r1', productId: 'riz', quantity: 0.15 }], [stock({ quantity: 1, targetLevel: null })], { horizonDays: 7, today });
    expect(low.recommendedOrder).toBe(2);             // on remonte au seuil critique
    expect(low.explanation).toMatch(/seuil critique/);
  });

  it('les jours de fermeture sont exclus du besoin', () => {
    const sansFermeture = forecastRecipes(full, ['r1'], { horizonDays: 7, today }).get('r1')!;
    const avecFermeture = forecastRecipes(full, ['r1'], { horizonDays: 7, today, closedWeekdays: [6] }).get('r1')!; // samedi fermé
    expect(avecFermeture.total).toBeLessThan(sansFermeture.total);
    expect(avecFermeture.perDay[0]).toBe(0);           // demain = samedi
    expect(avecFermeture.closedPerDay[0]).toBe(true);
    const [pf] = forecastProducts(new Map([['r1', avecFermeture]]), [{ recipeId: 'r1', productId: 'riz', quantity: 0.15 }], [stock()], { horizonDays: 7, today, closedWeekdays: [6] });
    expect(pf.perDay[0]).toBe(0);                      // aucun besoin produit le jour de fermeture
  });

  it('la saisonnalité du restaurant majore réellement les besoins', () => {
    const base = forecastRecipes(full, ['r1'], { horizonDays: 7, today }).get('r1')!;
    const pic = forecastRecipes(full, ['r1'], { horizonDays: 7, today, peakMonths: [9], peakCoef: 1.3 }).get('r1')!;  // septembre = pleine activité
    expect(pic.total).toBeGreaterThan(base.total * 1.25);
    expect(pic.total).toBeLessThan(base.total * 1.35);
    const horsPic = forecastRecipes(full, ['r1'], { horizonDays: 7, today, peakMonths: [7], peakCoef: 1.3 }).get('r1')!;
    expect(horsPic.total).toBe(base.total);
  });

  it('la saisonnalité d’un produit (JSON) s’applique et se lit dans plusieurs formats', () => {
    expect(parseSeasonality('{"months":[7,8],"coef":1.5}')).toEqual({ months: [7, 8], coef: 1.5 });
    // Coef par défaut = celui de la pleine saison (1,2, chantier 4 de l'autre historique) : modeste et
    // assumé, plutôt qu'un 1,3 sorti de nulle part. Le coefficient explicite de la fiche produit reste roi.
    expect(parseSeasonality('[6,9]')).toEqual({ months: [6, 9], coef: 1.2 });
    expect(parseSeasonality('saison des pluies')).toBeNull();   // texte libre : aucune invention
    expect(parseSeasonality(null)).toBeNull();
    const rf = forecastRecipes(full, ['r1'], { horizonDays: 7, today });
    const [avec] = forecastProducts(rf, [{ recipeId: 'r1', productId: 'riz', quantity: 0.15 }], [stock({ seasonality: '{"months":[9],"coef":1.5}' })], { horizonDays: 7, today });
    const [sans] = forecastProducts(rf, [{ recipeId: 'r1', productId: 'riz', quantity: 0.15 }], [stock()], { horizonDays: 7, today });
    expect(avec.seasonCoef).toBe(1.5);
    expect(avec.predictedNeed).toBeGreaterThan(sans.predictedNeed * 1.4);
    expect(avec.explanation).toMatch(/Saisonnalité 1.5/);   // phrase unique, lisible telle quelle à l'écran
    expect(sans.seasonCoef).toBe(1);
  });

  it('la source affichée est toujours la plus fragile des recettes composant un produit', () => {
    expect(weakestBasis('ventes_28j', 'ventes_28j')).toBe('ventes_28j');
    expect(weakestBasis('ventes_28j', 'couverts')).toBe('couverts');
    expect(weakestBasis('couverts', 'seuils')).toBe('seuils');
  });

  it('le cas idéal (4 semaines de ventes) reste inchangé : ventes 28 j, confiance 85 %', () => {
    const rf = forecastRecipes(full, ['r1'], { horizonDays: 7, today });
    const f = rf.get('r1')!;
    expect(f.basis).toBe('ventes_28j'); expect(f.confidence).toBe(0.85);
    expect(f.perDay[0]).toBeGreaterThan(17); expect(f.perDay[0]).toBeLessThan(23);   // samedi ×2
    expect(f.perDay[2]).toBe(0);                                                       // lundi fermé
  });
});
