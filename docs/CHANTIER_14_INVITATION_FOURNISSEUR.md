# Chantier 14 — Invitation fournisseur pré-remplie

**Objectif** : transformer les 206 grossistes de la prospection en catalogues en ligne, avec le moins de friction possible.

## Côté admin (`/app/admin/prospection` → onglet Fournisseurs)
Bouton **Inviter** sur chaque fiche : saisie facultative de l'e-mail → `POST /api/admin/prospects/:id/invite-vendor`
- génère un **lien signé 30 jours** `APP_URL/fournisseur?invite=<token>` contenant nom, ville, téléphone, contact ;
- envoie l'e-mail (Resend) si un e-mail est connu ; sinon fournit le **message WhatsApp prêt à coller** + bouton « Ouvrir WhatsApp » (wa.me) ;
- passe le prospect en `contacte`, ajoute une note datée, journal d'audit `prospect.invite_vendor`.

## Côté grossiste (`/fournisseur?invite=…`)
Page d'atterrissage : « *Nom*, votre fiche est prête » → zones livrées, catégories, minimum, délai (pré-remplis) + e-mail/mot de passe (ou « j'ai déjà un compte ») → **Activer mon espace et importer mon tarif**.
- `POST /api/vendor/register` avec `invite` : l'espace est créé **actif immédiatement** (vérifié par l'équipe) ; le prospect passe `converti` avec l'e-mail du compte.
- Le grossiste arrive directement sur l'onglet Catalogue (import Excel/texte/photo, chantier 12) et apparaît aussitôt sur la vitrine publique (chantier 13).

Public : `GET /api/public/vendor-invite/:token` (lecture de l'invitation). Tests : `apps/api/src/test/vendor-invite.test.ts`.
