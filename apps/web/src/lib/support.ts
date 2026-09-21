// Chantier 12 (audit) — UNE seule adresse de support pour toute l'interface.
//
// L'audit a compté six endroits différents où « bonjour@afrisupply.fr » était écrit en dur :
// le jour où l'adresse change (ou qu'un numéro de téléphone s'ajoute), il y a six fichiers à
// retrouver — et un oubli laisse une adresse morte devant un client. Ici : une définition,
// surchargeable par variable d'environnement (VITE_SUPPORT_EMAIL).
export const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || 'bonjour@afrisupply.fr';
/** Horaires où une réponse humaine est réellement possible. */
export const SUPPORT_HOURS = 'du lundi au samedi, 8 h – 20 h (heure de Paris)';
/** Délais annoncés : tenus par une personne, pas par un robot. */
export const SUPPORT_RESPONSE = 'réponse sous 4 h ouvrées · incident bloquant (impossible de commander ou de réceptionner) : sous 1 h';

/** Lien mail pré-rempli (objet + corps), pour que le restaurant n'ait rien à rédiger. */
export const mailtoSupport = (subject: string, body?: string) =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
