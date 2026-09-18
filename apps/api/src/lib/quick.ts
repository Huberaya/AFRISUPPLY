// Saisie express (chantier 9) : comprendre une phrase libre du restaurateur sans LLM.
//   « vendu 40 mafé 25 yassa 12 thiep »         → ventes du jour
//   « reste 3 kg plantain, 2 sacs riz »          → comptage de stock
//   « reçu 25 kg riz 10 L huile »                 → réception
//   « perdu 2 kg poisson »                        → perte
// Le rapprochement des noms se fait par normalisation + score de similarité sur les entités du restaurant.

export type QuickKind = 'vente' | 'comptage' | 'reception' | 'perte';
export interface QuickEntity { id: string; name: string; aliases?: string[]; unit?: string }
export interface QuickLine { kind: QuickKind; raw: string; qty: number; unit?: string; match: { id: string; name: string; score: number } | null; candidates: { id: string; name: string; score: number }[] }
export interface QuickParse { kind: QuickKind; lines: QuickLine[]; unmatched: string[] }

export const normalize = (s: string) => s.replace(/(\d),(\d)/g, '$1.$2').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9. ]+/g, ' ').replace(/\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();

const KIND_WORDS: [RegExp, QuickKind][] = [
  [/\b(vendu|vente|ventes|servi|sorti|fait)\b/, 'vente'],
  [/\b(reste|restant|il reste|stock|compte|comptage|inventaire|j ai|on a)\b/, 'comptage'],
  [/\b(recu|reception|livre|livraison|arrive|rentre)\b/, 'reception'],
  [/\b(perdu|perte|jete|casse|perime|poubelle|gaspille)\b/, 'perte'],
];
const UNITS: Record<string, string> = { kg: 'kg', kilo: 'kg', kilos: 'kg', g: 'g', gr: 'g', grammes: 'g', l: 'L', litre: 'L', litres: 'L', ml: 'mL', cl: 'cL', piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', unite: 'piece', unites: 'piece', botte: 'botte', bottes: 'botte', sac: 'sac', sacs: 'sac', carton: 'carton', cartons: 'carton', bidon: 'bidon', bidons: 'bidon', portion: 'portion', portions: 'portion', assiette: 'portion', assiettes: 'portion', plat: 'portion', plats: 'portion' };
const NUM_WORDS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100 };
const STOP = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'et', 'a', 'au', 'aux', 'en', 'pour', 'ce', 'ces', 'soir', 'midi', 'aujourd', 'hui', 'hier', 'matin', 'avec', 'sur']);

export function detectKind(text: string, fallback: QuickKind = 'vente'): QuickKind {
  const n = normalize(text);
  for (const [re, k] of KIND_WORDS) if (re.test(n)) return k;
  return fallback;
}

/** Similarité 0..1 : inclusion de mots + bigrammes de caractères (tolère fautes et abréviations : "thiep" ~ "thiéboudienne"). */
export function similarity(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (nb.includes(na) || na.includes(nb)) return 0.92;
  const wa = na.split(' '), wb = nb.split(' ');
  if (wa.some((w) => w.length >= 4 && wb.some((x) => x.startsWith(w) || w.startsWith(x)))) return 0.85;
  // préfixe phonétique : « thiep » / « thieb » ~ « thieboudienne » (4 premières lettres, tolérance p/b, k/c, e/a)
  const ph = (s: string) => s.slice(0, 4).replace(/p/g, 'b').replace(/k|q/g, 'c').replace(/[aeiouy]/g, 'a');
  if (wa.some((w) => w.length >= 4 && wb.some((x) => x.length >= 4 && ph(w) === ph(x)))) return 0.7;
  const grams = (s: string) => { const g = new Map<string, number>(); const t = ` ${s} `; for (let i = 0; i < t.length - 1; i++) { const k = t.slice(i, i + 2); g.set(k, (g.get(k) ?? 0) + 1); } return g; };
  const ga = grams(na), gb = grams(nb); let inter = 0, tot = 0;
  for (const [k, v] of ga) { tot += v; inter += Math.min(v, gb.get(k) ?? 0); } for (const v of gb.values()) tot += v;
  return tot ? (2 * inter) / tot : 0;
}

export function bestMatches(name: string, entities: QuickEntity[], limit = 3) {
  return entities.map((e) => ({ id: e.id, name: e.name, score: Math.max(similarity(name, e.name), ...(e.aliases ?? []).map((a) => similarity(name, a))) }))
    .filter((m) => m.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Découpe « 40 mafé 25 yassa poulet, 3 kg plantain » en segments (qty, unité?, libellé). */
export function tokenize(text: string): { qty: number; unit?: string; label: string; raw: string }[] {
  let n = normalize(text);
  for (const [w, v] of Object.entries(NUM_WORDS)) n = n.replace(new RegExp(`\\b${w}\\b`, 'g'), String(v));
  n = n.replace(/(\d)(kg|g|l|ml|cl)\b/g, '$1 $2');
  const out: { qty: number; unit?: string; label: string; raw: string }[] = [];
  const re = /(\d+(?:\.\d+)?)\s+([^\d]+?)(?=\s+\d|$)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(n))) {
    const qty = Number(m[1]); const words = m[2].trim().split(' ').filter((w) => w && !STOP.has(w));
    if (!words.length) continue;
    let unit: string | undefined; if (UNITS[words[0]]) { unit = UNITS[words[0]]; words.shift(); }
    // retire les mots-clés d'intention en fin/début de libellé
    const label = words.filter((w) => !KIND_WORDS.some(([r]) => r.test(w))).join(' ').trim();
    if (label) out.push({ qty, unit, label, raw: m[0].trim() });
  }
  return out;
}

export function parseQuick(text: string, ctx: { recipes: QuickEntity[]; products: QuickEntity[] }, forceKind?: QuickKind): QuickParse {
  const kind = forceKind ?? detectKind(text);
  const pool = kind === 'vente' ? ctx.recipes : ctx.products;
  const lines: QuickLine[] = tokenize(text).map((t) => {
    const cands = bestMatches(t.label, pool);
    const top = cands[0]; const second = cands[1];
    const confident = !!top && (!second || top.score - second.score >= 0.15) && top.score >= 0.6;
    return { kind, raw: t.raw, qty: t.qty, unit: t.unit, match: confident ? top : null, candidates: cands };
  });
  return { kind, lines, unmatched: lines.filter((l) => !l.match).map((l) => l.raw) };
}

// ---------- Photo de facture : extraction via LLM vision (optionnel) ----------
export interface InvoiceLine { label: string; qty: number; unit?: string; unitPrice?: number; total?: number }
export interface InvoiceExtract { supplierName?: string; date?: string; total?: number; lines: InvoiceLine[] }

export const INVOICE_PROMPT = `Tu lis une facture ou un bon de livraison de fournisseur alimentaire (grossiste africain, marché, cash & carry) photographié par un restaurateur.
Réponds UNIQUEMENT avec un JSON valide, sans texte autour, de la forme :
{"supplierName": string|null, "date": "AAAA-MM-JJ"|null, "total": number|null, "lines": [{"label": string, "qty": number, "unit": "kg"|"g"|"L"|"mL"|"piece"|"sac"|"carton"|"botte"|null, "unitPrice": number|null, "total": number|null}]}
Règles : une ligne par produit ; qty = quantité livrée (si « 2 x 25 kg », qty = 50 et unit = "kg") ; prix en euros TTC si visible ; ignore les lignes de transport, consigne, remise globale. Si un champ est illisible, mets null.`;

export async function extractInvoiceFromImage(imageDataUrl: string): Promise<{ ok: true; data: InvoiceExtract } | { ok: false; error: string }> {
  if (!process.env.LLM_API_KEY) return { ok: false, error: 'Lecture de facture indisponible : LLM_API_KEY non configuré' };
  const base = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1'; const model = process.env.LLM_VISION_MODEL ?? process.env.LLM_MODEL ?? 'gpt-4o-mini';
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` }, signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({ model, temperature: 0, max_tokens: 1500, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: INVOICE_PROMPT },
        { role: 'user', content: [{ type: 'text', text: 'Voici la facture.' }, { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }] },
      ] }),
    });
    if (!res.ok) return { ok: false, error: `LLM HTTP ${res.status}` };
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, '')) as InvoiceExtract;
    parsed.lines = (parsed.lines ?? []).filter((l) => l && l.label && Number.isFinite(Number(l.qty))).map((l) => ({ ...l, qty: Number(l.qty) }));
    return { ok: true, data: parsed };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
