import { describe, it, expect } from 'vitest';
import { REFERENCE_PRODUCTS, findReferenceProduct, normalize } from './products.js';
import { RECIPE_TEMPLATES } from './recipes.js';

describe('référentiel produits', () => {
  it('contient au moins 300 références sans doublon', () => {
    const names = REFERENCE_PRODUCTS.map((p) => normalize(p.name));
    expect(REFERENCE_PRODUCTS.length).toBeGreaterThanOrEqual(300);
    expect(new Set(names).size).toBe(names.length);
  });
  it('chaque produit a au moins un conditionnement', () => {
    for (const p of REFERENCE_PRODUCTS) expect(p.packs.length, p.name).toBeGreaterThan(0);
  });
  it('retrouve un produit par alias / orthographe locale', () => {
    expect(findReferenceProduct('attieke')?.name).toBe('Attiéké');
    expect(findReferenceProduct('Saka saka')?.name).toBe('Feuilles de manioc');
    expect(findReferenceProduct('huile rouge')?.name).toBe('Huile de palme rouge');
    expect(findReferenceProduct('MAGGI')?.name).toMatch(/Cube bouillon/);
    expect(findReferenceProduct('soumbala')?.name).toMatch(/néré/);
    expect(findReferenceProduct('zobo')?.name).toMatch(/bissap/i);
  });
});

describe('recettes types', () => {
  it('référencent uniquement des produits existants', () => {
    const names = new Set(REFERENCE_PRODUCTS.map((p) => p.name));
    const missing = RECIPE_TEMPLATES.flatMap((r) => r.ingredients.filter(([p]) => !names.has(p)).map(([p]) => `${r.name} → ${p}`));
    expect(missing).toEqual([]);
  });
  it('au moins 25 recettes, quantités positives', () => {
    expect(RECIPE_TEMPLATES.length).toBeGreaterThanOrEqual(25);
    for (const r of RECIPE_TEMPLATES) for (const [, q] of r.ingredients) expect(q).toBeGreaterThan(0);
  });
});
