# Chantier 22 — Conditions générales fournisseur

- Page publique `/cgv-fournisseur` (lien dans le pied de page du site) — version `1.0`, 10 articles : intermédiaire technique, vérification, catalogue/prix HT, **confirmation sous 24 h ouvrées**, facture et encaissement directs par le fournisseur, réception/écarts, **commission 2–5 % HT sur commandes confirmées** facturée le 1er du mois, anti-contournement, données, responsabilité, résiliation, litiges (Nantes).
- Acceptation obligatoire (case à cocher) à la création d'espace fournisseur (formulaire libre et lien d'invitation) → `vendors.cgv_version / cgv_accepted_at / cgv_accepted_by` (migration 0009), audit `vendor.accept_cgv`.
- Nouvelle version : incrémenter `VENDOR_CGV_VERSION` dans `apps/api/src/lib/cgv.ts` **et** `apps/web/src/pages/site/VendorTerms.tsx`. Les grossistes voient alors un bandeau « J'accepte » ; toute action d'écriture (`POST/PUT /api/vendor/*`) renvoie `428 cgv_outdated` jusqu'à l'acceptation (`POST /api/vendor/accept-cgv`) ; la lecture reste possible.
- ⚠️ Texte à faire relire par un avocat avant la première facture de commission.
