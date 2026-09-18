import { describe, it, expect } from 'vitest';
import { parseQuick, detectKind, tokenize, similarity } from '../lib/quick.js';

const ctx = {
  recipes: [{ id: 'r1', name: 'Mafé bœuf' }, { id: 'r2', name: 'Yassa poulet' }, { id: 'r3', name: 'Thiéboudienne' }, { id: 'r4', name: 'Poulet braisé' }, { id: 'r5', name: 'Attiéké poisson' }],
  products: [{ id: 'p1', name: 'Plantain', unit: 'kg' }, { id: 'p2', name: 'Riz brisé parfumé', aliases: ['riz cassé', 'riz'], unit: 'kg' }, { id: 'p3', name: 'Huile de palme rouge', unit: 'L' }, { id: 'p4', name: 'Tilapia entier', unit: 'kg' }, { id: 'p5', name: 'Capitaine (thiof / mérou)', unit: 'kg' }],
};

describe('saisie express — intention', () => {
  it('détecte vente / comptage / réception / perte', () => {
    expect(detectKind('vendu 40 mafé')).toBe('vente'); expect(detectKind('ce soir on a fait 30 yassa')).toBe('vente');
    expect(detectKind('il reste 3 kg de plantain')).toBe('comptage'); expect(detectKind('inventaire : 2 sacs riz')).toBe('comptage');
    expect(detectKind('reçu 25kg riz')).toBe('reception'); expect(detectKind('jeté 2 kg poisson périmé')).toBe('perte');
    expect(detectKind('40 mafé 25 yassa')).toBe('vente'); // défaut
  });
});

describe('saisie express — découpage', () => {
  it('sépare quantités, unités et libellés, gère virgules et nombres en lettres', () => {
    const t = tokenize('vendu 40 mafé 25 yassa poulet et douze thiep');
    expect(t.map((x) => [x.qty, x.label])).toEqual([[40, 'mafe'], [25, 'yassa poulet'], [12, 'thiep']]);
    const s = tokenize('reste 3,5 kg plantain, 2 sacs riz, 10 L huile de palme');
    expect(s.map((x) => [x.qty, x.unit, x.label])).toEqual([[3.5, 'kg', 'plantain'], [2, 'sac', 'riz'], [10, 'L', 'huile palme']]);
    expect(tokenize('reçu 25kg riz')[0]).toMatchObject({ qty: 25, unit: 'kg', label: 'riz' });
  });
});

describe('saisie express — rapprochement', () => {
  it('tolère accents, fautes, abréviations et alias', () => {
    expect(similarity('mafe', 'Mafé bœuf')).toBeGreaterThan(0.8);
    expect(similarity('thiep', 'Thiéboudienne')).toBeGreaterThan(0.6);
    expect(similarity('capitaine', 'Capitaine (thiof / mérou)')).toBeGreaterThan(0.8);
    const r = parseQuick('vendu 40 mafé 25 yassa 12 thiep 8 attieke', ctx);
    expect(r.kind).toBe('vente'); expect(r.lines.map((l) => [l.match?.id, l.qty])).toEqual([['r1', 40], ['r2', 25], ['r3', 12], ['r5', 8]]); expect(r.unmatched).toEqual([]);
  });
  it('les produits passent par les alias ; l’inconnu remonte en « non reconnu » avec candidats', () => {
    const r = parseQuick('reste 3 kg plantain 2 sacs riz 4 kg tilapia 1 kg gombo', ctx);
    expect(r.kind).toBe('comptage'); expect(r.lines.slice(0, 3).map((l) => l.match?.id)).toEqual(['p1', 'p2', 'p4']);
    expect(r.unmatched).toEqual(['1 kg gombo']); expect(r.lines[3].candidates.length).toBeLessThanOrEqual(3);
  });
  it('ambiguïté : « poulet » entre Yassa poulet et Poulet braisé → pas de choix automatique', () => {
    const r = parseQuick('vendu 10 poulet', ctx); expect(r.lines[0].match).toBeNull(); expect(r.lines[0].candidates.map((c) => c.id).sort()).toEqual(['r2', 'r4']);
  });
});
