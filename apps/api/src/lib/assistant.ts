// =============================================================
// AFRISUPPLY — Assistant « Demander à l'IA »
//
// Architecture "données d'abord" :
//   1. classer l'intention (règles locales, ou LLM si LLM_API_KEY)
//   2. exécuter les requêtes métier correspondantes (chiffres réels)
//   3. rédiger la réponse (gabarits FR ; le LLM, s'il est présent,
//      reformule UNIQUEMENT à partir des faits fournis — jamais d'invention)
// =============================================================

export type Intent =
  | 'what_to_order' | 'why_costs_up' | 'find_cheaper' | 'dish_cost' | 'most_reliable_supplier'
  | 'should_raise_price' | 'monthly_spend' | 'upcoming_stockouts' | 'stock_level' | 'help';

export interface Classified { intent: Intent; entity?: string; confidence: number }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ');

const RULES: { intent: Intent; patterns: RegExp[] }[] = [
  { intent: 'what_to_order', patterns: [/que? (dois|devrais|faut)[- ]?(je|il)? ?commander/, /commander cette semaine/, /quoi commander/, /panier/, /liste de courses/, /besoins? (de la|cette) semaine/] },
  { intent: 'why_costs_up', patterns: [/pourquoi .*(cout|couts|depense|depenses|prix).*(augment|hausse|mont)/, /(cout|couts|depenses?) .*augment/, /hausse/, /plus cher qu avant/] },
  { intent: 'find_cheaper', patterns: [/moins cher/, /meilleur prix/, /compar/, /trouve[- ]moi/, /ou acheter/, /alternative/] },
  { intent: 'dish_cost', patterns: [/combien (me )?coute/, /cout (matiere|de revient)/, /marge/, /rentab/, /prix de revient/] },
  { intent: 'should_raise_price', patterns: [/augmenter le prix/, /monter le prix/, /prix de vente/, /dois[- ]je (augmenter|changer)/, /(bon|juste) prix/] },
  { intent: 'most_reliable_supplier', patterns: [/fiable/, /meilleur fournisseur/, /fournisseur .*(confiance|serieux|retard)/, /retards?/] },
  { intent: 'monthly_spend', patterns: [/combien (j ai|ai[- ]je) depense/, /depenses? (du|ce) mois/, /budget/, /total (des )?achats/, /depense/] },
  { intent: 'upcoming_stockouts', patterns: [/rupture/, /va(is)? manquer/, /bientot (plus|fini)/, /en manque/, /alerte/] },
  { intent: 'stock_level', patterns: [/combien (il )?(me )?reste/, /stock de/, /reste[- ]t[- ]il/, /j ai combien/, /quantite/] },
];

export function classifyIntent(question: string, knownEntities: { products: string[]; recipes: string[]; suppliers: string[] }): Classified {
  const q = norm(question);
  let intent: Intent = 'help'; let confidence = 0.3;
  for (const r of RULES) if (r.patterns.some((p) => p.test(q))) { intent = r.intent; confidence = 0.75; break; }
  // entité : produit / plat / fournisseur cité dans la question (plus longue correspondance)
  const all = [...knownEntities.recipes.map((e) => ({ e, k: 'recipe' })), ...knownEntities.products.map((e) => ({ e, k: 'product' })), ...knownEntities.suppliers.map((e) => ({ e, k: 'supplier' }))];
  let entity: string | undefined; let bestLen = 0;
  for (const { e } of all) {
    const ne = norm(e); const first = ne.split(/[\s(]/)[0];
    const score = ne.length > 3 && q.includes(ne) ? 1000 + ne.length : first.length >= 4 && q.includes(first) ? first.length : 0; // nom complet prioritaire sur le 1er mot
    if (score > bestLen) { entity = e; bestLen = score; }
  }
  // désambiguïsation par entité
  if (intent === 'help' && entity) { intent = knownEntities.recipes.includes(entity) ? 'dish_cost' : knownEntities.suppliers.includes(entity) ? 'most_reliable_supplier' : 'stock_level'; confidence = 0.55; }
  if (intent === 'find_cheaper' && !entity && /riz|poulet|huile|attieke|bissap/.test(q)) entity = q.match(/riz|poulet|huile|attieke|bissap/)![0];
  if (entity) confidence = Math.min(0.95, confidence + 0.15);
  return { intent, entity, confidence };
}

export const EXAMPLE_QUESTIONS = [
  'Qu’est-ce que je dois commander cette semaine ?', 'Pourquoi mes coûts augmentent ?', 'Trouve-moi moins cher pour le riz.',
  'Combien me coûte réellement mon mafé ?', 'Quel fournisseur est le plus fiable ?', 'Est-ce que je dois augmenter le prix du poulet braisé ?',
  'Combien ai-je dépensé ce mois-ci ?', 'Quelles ruptures arrivent ?', 'Combien il me reste de plantain ?',
];

// -------------------------------------------------------------
// LLM optionnel (OpenAI-compatible : OpenAI, Mistral, Groq, Ollama…)
// -------------------------------------------------------------
export function llmEnabled() { return !!process.env.LLM_API_KEY; }

export async function llmRephrase(question: string, facts: string, draft: string): Promise<string | null> {
  if (!llmEnabled()) return null;
  const base = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1'; const model = process.env.LLM_MODEL ?? 'gpt-4o-mini';
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 400, messages: [
        { role: 'system', content: 'Tu es l\'assistant achats d\'un restaurant africain. Réponds en français, de façon concise et concrète, en tutoyant. Tu ne peux utiliser QUE les faits fournis : n\'invente aucun chiffre, prix, fournisseur ou produit. Si les faits ne suffisent pas, dis-le.' },
        { role: 'user', content: `Question : ${question}\n\nFaits (source de vérité) :\n${facts}\n\nBrouillon de réponse à améliorer (garde tous les chiffres) :\n${draft}` },
      ] }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch { return null; }
}

export const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`;
export const qty = (v: number, u: string) => `${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')} ${u}`;
