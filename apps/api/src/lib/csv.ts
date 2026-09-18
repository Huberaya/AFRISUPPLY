// Parseur CSV minimal (séparateur ; ou , ou tab auto-détecté, guillemets, BOM) — zéro dépendance.
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/)[0] ?? '';
  const sep = [';', ',', '\t'].map((s) => [s, (firstLine.match(new RegExp(`\\${s}`, 'g')) ?? []).length] as const).sort((a, b) => b[1] - a[1])[0][0];

  const records: string[][] = [];
  let cur: string[] = []; let field = ''; let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { cur.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.some((c) => c.trim() !== '')) records.push(cur);
      cur = [];
    } else field += ch;
  }
  cur.push(field); if (cur.some((c) => c.trim() !== '')) records.push(cur);
  if (!records.length) return { headers: [], rows: [] };

  const norm = (h: string) => h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const headers = records[0].map(norm);
  const rows = records.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, rows };
}

/** Colonnes acceptées (synonymes FR/EN) pour l'import fournisseurs + prix. */
export const COLUMN_ALIASES: Record<string, string[]> = {
  supplier: ['fournisseur', 'supplier', 'nom_fournisseur', 'grossiste'],
  product: ['produit', 'product', 'article', 'designation', 'libelle', 'nom_produit'],
  pack: ['conditionnement', 'pack', 'colis', 'format', 'unite_vente', 'packaging'],
  packQty: ['quantite', 'qte', 'quantite_par_colis', 'contenance', 'poids', 'pack_qty', 'qty'],
  price: ['prix', 'prix_colis', 'prix_ht', 'price', 'tarif', 'prix_unitaire_colis'],
  unitPrice: ['prix_kg', 'prix_au_kg', 'prix_litre', 'prix_unite', 'unit_price', 'prix_par_unite'],
  phone: ['telephone', 'tel', 'phone', 'portable', 'mobile'],
  whatsapp: ['whatsapp', 'wa'],
  email: ['email', 'mail', 'e_mail', 'courriel'],
  city: ['ville', 'city', 'localite'],
  leadTime: ['delai', 'delai_h', 'delai_livraison', 'lead_time', 'delai_jours'],
  minOrder: ['minimum', 'minimum_commande', 'min_order', 'franco'],
  deliveryFee: ['frais_livraison', 'livraison', 'delivery_fee', 'port'],
  category: ['categorie', 'category', 'rayon', 'famille'],
  unit: ['unite', 'unit', 'unite_base'],
};

export function pick(row: Record<string, string>, key: keyof typeof COLUMN_ALIASES): string {
  for (const a of COLUMN_ALIASES[key]) if (row[a] !== undefined && row[a] !== '') return row[a];
  return '';
}

export const toNumber = (s: string): number | null => {
  const clean = s.replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(clean); return Number.isFinite(n) && clean !== '' ? n : null;
};

/** « Sac 25 kg », « Bidon 5L », « Carton 24 × 33 cl », « 10kg » → { qty, unit } dans l'unité de base. */
export function parsePack(label: string): { qty: number; unit: 'kg' | 'L' | 'piece' } | null {
  const s = label.toLowerCase().replace(',', '.');
  const mult = s.match(/(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)/);
  if (mult) { const n = Number(mult[1]); const q = Number(mult[2]); return convert(n * q, mult[3]); }
  const single = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)\b/);
  if (single) return convert(Number(single[1]), single[2]);
  const pieces = s.match(/(\d+)\s*(pi[eè]ces?|pcs|unit[eé]s?|bouteilles?|canettes?|cubes?|sachets?|bo[iî]tes?|feuilles?|pots?|gobelets?|sacs?|barquettes?)/);
  if (pieces) return { qty: Number(pieces[1]), unit: 'piece' };
  const bare = s.match(/^(?:carton|pack|lot|colis|bo[iî]te)\s*(?:de\s*)?(\d+)$/);
  if (bare) return { qty: Number(bare[1]), unit: 'piece' };
  return null;
}
function convert(q: number, u: string): { qty: number; unit: 'kg' | 'L' | 'piece' } {
  switch (u) { case 'g': return { qty: q / 1000, unit: 'kg' }; case 'kg': return { qty: q, unit: 'kg' }; case 'ml': return { qty: q / 1000, unit: 'L' }; case 'cl': return { qty: q / 100, unit: 'L' }; default: return { qty: q, unit: 'L' }; }
}
