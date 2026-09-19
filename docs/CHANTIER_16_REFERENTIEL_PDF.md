# Chantier 16 — Admin « Référentiel produits » + documents PDF

## Référentiel (admin, `/app/admin/referentiel`)
- Liste des produits communs (recherche nom/alias, filtre rayon, nb d'offres grossistes, nb de restaurants qui suivent).
- **Nouveau produit** / **Modifier** : nom, alias, rayon, unité, origine, DLC, URL photo.
- **Fusionner** un doublon dans un produit cible : offres, stocks, lignes de commande… réattribués ; le nom du doublon devient un alias.
- **Demandes de produit manquant** : envoyées par les grossistes depuis l'import de catalogue (lien « demander l'ajout de … » sous les lignes inconnues) → bouton **Créer** pré-rempli / **Ignorer**.
- API : `GET/POST /api/admin/reference`, `PUT /api/admin/reference/:id`, `POST /api/admin/reference/:id/merge`, `POST /api/reference/request` (tout compte connecté), `POST /api/admin/reference/requests/:id/dismiss`.

## PDF (sans dépendance, `apps/api/src/lib/pdf.ts`)
- Restaurant : bouton **📄 PDF** sur chaque commande → `GET /api/orders/:id/pdf` (bon de commande).
- Grossiste : **Bon de commande PDF** et **Bon de livraison PDF** (avec zone de signature/réception) → `GET /api/vendor/orders/:id/pdf[?type=livraison]`.
- Mentions : prix HT, « TVA et facture établies par le fournisseur, règlement directement au fournisseur », AFRISUPPLY intermédiaire technique.

Tests : `apps/api/src/test/reference-pdf.test.ts`.
