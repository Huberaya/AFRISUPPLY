// Chantier 12 — Import de catalogue fournisseur : texte libre / lignes Excel / photo de tarif → lignes structurées
// rapprochées au référentiel commun. Aucune écriture ici : le fournisseur valide avant publication.
import { normalize, similarity } from './quick.js';

export interface CatalogLine { raw: string; label: string; packLabel: string; packQty: number; packUnit: string; price: number; inStock: boolean }
export interface RefProduct { id: string; name: string; aliases: string[]; baseUnit: string }
export interface MatchedLine extends CatalogLine { match: { id: string; name: string; baseUnit: string; score: number } | null; candidates: { id: string; name: string; baseUnit: string; score: number }[]; warning?: string }

const UNIT: Record<string, string> = { kg: 'kg', kilo: 'kg', kilos: 'kg', kgs: 'kg', g: 'g', gr: 'g', l: 'L', lt: 'L', litre: 'L', litres: 'L', ml: 'mL', cl: 'cL', pc: 'piece', pcs: 'piece', piece: 'piece', pieces: 'piece', u: 'piece', unite: 'piece', unites: 'piece', botte: 'botte', bottes: 'botte' };
const PACK_WORDS = /\b(sac|carton|bidon|pot|bocal|boite|bouteille|seau|caisse|colis|filet|barquette|paquet|sachet|plateau|palette|lot|pack|bte|btl|ctn)\b/;

/** Parse une ligne « Riz brisé parfumé sac 25 kg 29,90 » / « Huile de palme rouge | bidon 5 L | 24.50 » / « Attiéké 1kg x 10 – 32 € ». */
export function parseCatalogLine(rawIn: string): CatalogLine | null {
  const raw = rawIn.trim(); if (!raw || /^(produit|designation|libelle|article|nom)\b/i.test(raw)) return null;
  // colonnes tabulaires (Excel/CSV) : produit ; conditionnement ; qté ; prix [; stock]
  const cols = raw.split(/\t|;|\|/).map((c) => c.trim()).filter(Boolean);
  if (cols.length >= 4 && isNum(cols[2]) && isNum(cols[3])) {
    const unit = guessUnit(cols[1]) ?? 'kg';
    return { raw, label: cols[0], packLabel: cols[1], packQty: num(cols[2]), packUnit: unit, price: num(cols[3]), inStock: !/non|0|faux|false|rupture/i.test(cols[4] ?? 'oui') };
  }
  if (cols.length === 3 && isNum(cols[2])) { const p = parsePack(cols[1]); if (p) return { raw, label: cols[0], packLabel: cols[1], packQty: p.qty, packUnit: p.unit, price: num(cols[2]), inStock: true }; }
  // texte libre : prix = dernier nombre (avec € éventuel)
  let n = normalize(raw.replace(/€|eur|euros|ttc|ht/gi, ' '));
  const priceM = n.match(/(\d+(?:\.\d+)?)\s*$/); if (!priceM) return null;
  const price = Number(priceM[1]); n = n.slice(0, priceM.index).trim(); if (!(price > 0)) return null;
  // « 1kg x 10 » ou « 10 x 1kg » → 10 kg
  let packQty = 0; let packUnit = ''; let packLabel = '';
  const multi = n.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl)?\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl)?/);
  if (multi) {
    const a = Number(multi[1]), b = Number(multi[3]); const u = UNIT[multi[2] ?? multi[4] ?? ''] ?? 'piece';
    const per = multi[2] ? a : b; const count = multi[2] ? b : a;
    packQty = per * count; packUnit = u; packLabel = `${count} × ${per} ${u === 'piece' ? 'pièce' : u}`.replace(/\.0+ /, ' ');
    n = n.replace(multi[0], ' ');
  } else {
    const q = n.match(/(\d+(?:\.\d+)?)\s*(kg|kilos?|kgs|g|gr|l|lt|litres?|ml|cl|pcs?|pieces?|unites?|u|bottes?)\b/);
    if (q) { packQty = Number(q[1]); packUnit = UNIT[q[2]] ?? 'kg'; const pw = n.match(PACK_WORDS); packLabel = `${pw ? cap(pw[1]) + ' ' : ''}${q[1]} ${packUnit}`; n = n.replace(q[0], ' ').replace(PACK_WORDS, ' '); }
    else { const pw = n.match(PACK_WORDS); const cnt = n.match(/\bx?\s*(\d+)\s*$/); packQty = cnt ? Number(cnt[1]) : 1; packUnit = 'piece'; packLabel = pw ? cap(pw[1]) : packQty > 1 ? `Lot de ${packQty}` : 'Pièce'; n = n.replace(PACK_WORDS, ' ').replace(/\bx?\s*\d+\s*$/, ' '); }
  }
  // conversions g→kg, mL/cL→L pour la quantité en unité de base
  if (packUnit === 'g') { packQty = packQty / 1000; packUnit = 'kg'; } if (packUnit === 'mL') { packQty = packQty / 1000; packUnit = 'L'; } if (packUnit === 'cL') { packQty = packQty / 100; packUnit = 'L'; }
  const label = n.replace(/\s+/g, ' ').replace(/[-–:]+$/, '').trim(); if (!label || packQty <= 0) return null;
  return { raw, label, packLabel: packLabel.trim(), packQty: Math.round(packQty * 1000) / 1000, packUnit, price, inStock: true };
}
const isNum = (s: string) => /^\d+([.,]\d+)?$/.test(s.replace(/\s|€/g, ''));
const num = (s: string) => Number(s.replace(/\s|€/g, '').replace(',', '.'));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function guessUnit(s: string) { const m = normalize(s).match(/\b(kg|kilos?|g|gr|l|litres?|ml|cl|pcs?|pieces?|unites?)\b/); return m ? UNIT[m[1]] : undefined; }
function parsePack(s: string) { const m = normalize(s).match(/(\d+(?:\.\d+)?)\s*(kg|kilos?|g|gr|l|litres?|ml|cl|pcs?|pieces?|unites?)\b/); if (!m) return null; let qty = Number(m[1]); let unit = UNIT[m[2]] ?? 'kg'; if (unit === 'g') { qty /= 1000; unit = 'kg'; } if (unit === 'mL') { qty /= 1000; unit = 'L'; } if (unit === 'cL') { qty /= 100; unit = 'L'; } return { qty, unit }; }

export function parseCatalogText(text: string): CatalogLine[] {
  return text.split(/\r?\n/).map(parseCatalogLine).filter((l): l is CatalogLine => !!l);
}

/** Rapprochement au référentiel : nom > alias > flou ; l'unité du conditionnement doit être compatible avec l'unité de base. */
export function matchCatalogLines(lines: CatalogLine[], ref: RefProduct[]): MatchedLine[] {
  return lines.map((l) => {
    const words = normalize(l.label).split(' ').filter((w) => w.length >= 2);
    const scored = ref.map((p) => {
      const nw = normalize(p.name).split(' '); const aw = p.aliases.map((a) => normalize(a));
      const inName = words.length && words.every((w) => nw.includes(w)); const exactAlias = aw.includes(normalize(l.label));
      let score = inName ? 0.95 : exactAlias ? 0.9 : Math.min(0.84, Math.max(similarity(l.label, p.name), ...p.aliases.map((a) => similarity(l.label, a))));
      const compatible = p.baseUnit === l.packUnit || (p.baseUnit === 'piece' && l.packUnit === 'piece') || (['sac', 'carton', 'botte'].includes(p.baseUnit) && l.packUnit === 'piece');
      if (!compatible) score -= 0.25;
      return { id: p.id, name: p.name, baseUnit: p.baseUnit, score: Math.round(score * 1000) / 1000 };
    }).filter((m) => m.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, 4);
    const top = scored[0]; const second = scored[1];
    const confident = !!top && top.score >= 0.6 && (!second || top.score - second.score >= 0.08 || top.score >= 0.9);
    const warning = top && top.baseUnit !== l.packUnit && !(top.baseUnit === 'piece' || l.packUnit === 'piece') ? `Unité ${l.packUnit} ≠ ${top.baseUnit} du référentiel` : undefined;
    return { ...l, match: confident ? top : null, candidates: scored, warning };
  });
}

export const CATALOG_PROMPT = `Tu lis la photo (ou le PDF) d'un tarif / catalogue de grossiste alimentaire africain ou exotique.
Réponds UNIQUEMENT avec un JSON valide : {"lines":[{"label":string,"packLabel":string|null,"packQty":number|null,"packUnit":"kg"|"g"|"L"|"mL"|"piece"|null,"price":number|null}]}
Règles : une ligne par produit/conditionnement ; label = nom du produit sans le conditionnement ; packQty = quantité par colis dans packUnit (« 10 x 1 kg » → 10, "kg") ; price = prix du colis en euros (HT si indiqué, sinon tel quel). Ignore titres, totaux, conditions générales.`;

export async function extractCatalogFromImage(imageDataUrl: string): Promise<{ ok: true; lines: CatalogLine[] } | { ok: false; error: string }> {
  if (!process.env.LLM_API_KEY) return { ok: false, error: 'Lecture de photo indisponible : LLM_API_KEY non configuré. Collez le texte du tarif ou importez un fichier CSV/Excel.' };
  const base = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1'; const model = process.env.LLM_VISION_MODEL ?? process.env.LLM_MODEL ?? 'gpt-4o-mini';
  try {
    const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` }, signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ model, temperature: 0, max_tokens: 4000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: CATALOG_PROMPT }, { role: 'user', content: [{ type: 'text', text: 'Voici le tarif.' }, { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }] }] }) });
    if (!res.ok) return { ok: false, error: `LLM HTTP ${res.status}` };
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse((data.choices?.[0]?.message?.content ?? '{}').replace(/^```json\s*|```$/g, '')) as { lines?: { label?: string; packLabel?: string | null; packQty?: number | null; packUnit?: string | null; price?: number | null }[] };
    const lines = (parsed.lines ?? []).filter((l) => l && l.label && Number(l.price) > 0).map((l) => {
      let qty = Number(l.packQty) || 1; let unit = l.packUnit ?? 'piece';
      if (unit === 'g') { qty /= 1000; unit = 'kg'; } if (unit === 'mL') { qty /= 1000; unit = 'L'; }
      return { raw: `${l.label} ${l.packLabel ?? ''} ${l.price}`.trim(), label: l.label!, packLabel: l.packLabel ?? (unit === 'piece' ? 'Pièce' : `${qty} ${unit}`), packQty: qty, packUnit: unit, price: Number(l.price), inStock: true };
    });
    return { ok: true, lines };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
