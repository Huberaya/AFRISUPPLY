import { describe, it, expect } from 'vitest';
import { parseCsv, parsePack, toNumber, pick } from '../lib/csv.js';

describe('csv', () => {
  it('détecte le séparateur ; et gère guillemets + BOM', () => {
    const { headers, rows } = parseCsv('\uFEFFFournisseur;Produit;Prix\n"Afro; Distribution";Riz parfumé;"42,50"\n');
    expect(headers).toEqual(['fournisseur', 'produit', 'prix']);
    expect(rows[0].fournisseur).toBe('Afro; Distribution'); expect(toNumber(rows[0].prix)).toBe(42.5);
  });
  it('accepte les synonymes de colonnes', () => {
    const { rows } = parseCsv('Grossiste,Désignation,Tarif\nTropic,Attiéké,31');
    expect(pick(rows[0], 'supplier')).toBe('Tropic'); expect(pick(rows[0], 'product')).toBe('Attiéké'); expect(pick(rows[0], 'price')).toBe('31');
  });
  it('lit les conditionnements courants', () => {
    expect(parsePack('Sac 25 kg')).toEqual({ qty: 25, unit: 'kg' });
    expect(parsePack('Bidon 5L')).toEqual({ qty: 5, unit: 'L' });
    expect(parsePack('Carton 24 x 33 cl')).toEqual({ qty: 7.92, unit: 'L' });
    expect(parsePack('Sachet 500 g')).toEqual({ qty: 0.5, unit: 'kg' });
    expect(parsePack('Carton 500 pièces')).toEqual({ qty: 500, unit: 'piece' });
    expect(parsePack('Carton 24')).toEqual({ qty: 24, unit: 'piece' });
  });
  it('toNumber gère espaces, € et milliers', () => { expect(toNumber('1 250,50 €')).toBe(1250.5); expect(toNumber('abc')).toBeNull(); });
});
