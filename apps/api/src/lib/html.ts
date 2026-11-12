import { z } from 'zod';

// Chantier P0.5 — HTML des e-mails : toute valeur insérée est échappée, sauf mention contraire.
//
// Constat : 25 gabarits d'e-mails inséraient des valeurs saisies par les utilisateurs (nom d'une
// personne, d'un restaurant, d'un grossiste, d'un produit, texte d'un litige ou d'un avis) directement
// dans du HTML. Un compte pouvait donc faire partir, au nom d'AFRISUPPLY et vers l'adresse de son choix
// (invitation d'un membre, commande à un grossiste), un message contenant ses propres liens et sa
// propre mise en page : un support d'hameçonnage.
//
// Règle : les gabarits s'écrivent avec l'étiquette `h`. Chaque `${valeur}` y est échappée. Un fragment
// HTML construit par le code (une liste, des retours à la ligne) se déclare avec `brut(...)` — et ses
// propres valeurs passent elles aussi par `h` ou `esc`.

/** Échappe une valeur pour l'insérer dans du HTML (texte ou attribut entre guillemets doubles). */
export const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Fragment HTML déjà sûr (construit par le code). */
export class Brut { constructor(readonly html: string) {} }
export const brut = (html: string): Brut => new Brut(html);

/** Gabarit HTML : `h\`<p>Bonjour ${prenom}</p>\`` — les valeurs sont échappées, les `brut(...)` insérés tels quels. */
export function h(morceaux: TemplateStringsArray, ...valeurs: unknown[]): string {
  let out = '';
  morceaux.forEach((m, i) => {
    out += m;
    if (i < valeurs.length) { const v = valeurs[i]; out += v instanceof Brut ? v.html : esc(v); }
  });
  return out;
}

/** Texte brut → HTML : échappé, retours à la ligne conservés. */
export const nl2br = (texte: string, balise = '<br>'): Brut => brut(esc(texte).replace(/\n/g, balise));

/**
 * Un nom montré à des tiers (personne, restaurant, grossiste) : il figure dans l'OBJET et le texte
 * d'e-mails envoyés à d'autres que son auteur. L'échappement protège le HTML ; cette règle protège le
 * reste — un nom n'est ni une phrase, ni une balise, ni une adresse web (les messageries rendent
 * cliquable toute adresse écrite en clair).
 */
export const NOM_MAX = 80;
export const nomAfficheProbleme = (nom: string): string | null => {
  const s = nom.trim();
  if (s.length < 2) return 'Ce nom est trop court (2 caractères au moins).';
  if (s.length > NOM_MAX) return `Ce nom est trop long (${NOM_MAX} caractères au plus).`;
  if (/[<>]/.test(s)) return 'Ce nom ne peut pas contenir les caractères < et >.';
  if (/(https?:\/\/|www\.)/i.test(s)) return 'Ce nom ne peut pas contenir d\'adresse web.';
  return null;
};

/** Schéma de validation d'un nom montré à des tiers (voir `nomAfficheProbleme`). */
export const zNomAffiche = z.string().trim().superRefine((v, ctx) => { const pb = nomAfficheProbleme(v); if (pb) ctx.addIssue({ code: 'custom', message: pb }); });
