// Erreurs de base de données qui viennent du CLIENT, et non d'une panne du service.
//
// Audit n°3 — constat mesuré : un identifiant d'URL qui n'est pas un UUID (ex. `/api/compare/abc`)
// était comparé directement à une colonne `uuid` en base. PostgreSQL refuse alors la requête
// (code 22P02, « invalid input syntax for type uuid »), l'erreur remontait telle quelle et l'API
// répondait **500 « Erreur serveur »** — en développement avec le texte SQL complet en clair.
// Mesuré sur 7 routes sur 16 testées ; **40 routes paramétrées** du dépôt sont exposées au même cas,
// dont certaines n'existent que pour un usage interne (fournisseur, administration, facturation).
//
// Un identifiant malformé n'est pas une panne : c'est une ressource qui n'existe pas. Le traiter
// comme tel évite trois effets de bord :
//   1. une alerte de supervision pour une faute de frappe (le bruit qui fait ignorer les vraies) ;
//   2. une fuite d'information (le SQL, le nom des colonnes) dans la réponse ;
//   3. un comportement incohérent selon la route (certaines répondaient déjà 404, d'autres 500).
//
// Ce module rassemble la détection ; `app.ts` l'utilise pour répondre 404 comme le font les routes
// qui valident déjà leur identifiant.

/** `invalid_text_representation` — la valeur fournie n'a pas le format attendu par la colonne. */
const CODE_INVALID_TEXT = '22P02';

type Chainable = { code?: string; message?: string; cause?: unknown };

/**
 * Vrai si l'erreur (ou l'une de ses causes imbriquées) est un rejet de valeur malformée par Postgres,
 * c'est-à-dire une entrée utilisateur invalide — typiquement un identifiant qui n'est pas un UUID.
 * Drizzle enveloppe l'erreur d'origine : on remonte donc la chaîne des `cause`, sans risque de boucle.
 */
export function isInvalidUuidInput(e: unknown): boolean {
  const vus = new Set<unknown>();
  let noeud: unknown = e;
  while (noeud && typeof noeud === 'object' && !vus.has(noeud)) {
    vus.add(noeud);
    const n = noeud as Chainable;
    if (n.code === CODE_INVALID_TEXT) return true;
    if (typeof n.message === 'string' && /invalid input syntax for type uuid/i.test(n.message)) return true;
    noeud = n.cause;
  }
  return false;
}
