# Chantier 13 — Vitrine publique (parcours « Amazon », inspiré d'EthiMarket)

**Objectif** : en arrivant sur afrisupply, on voit directement les produits ; on crée son compte au moment de commander.

## Parcours
1. `/` — accueil vitrine : recherche, 6 rayons, produits, grossistes partenaires, appel « Vous tenez un restaurant ? ».
2. `/catalogue` — 324 produits du référentiel, filtres rayon / origine / « avec prix », tri, recherche par nom et alias.
3. `/produit/:id` — fiche : photo, origine, unité, alias ; **offres des grossistes actifs** triées par prix unitaire (conditionnement, €/kg, délai, minimum, port) ; « Ajouter au panier ». Sans offre : « Prix sur demande » + formulaire « Me prévenir » (lead source `vitrine`).
4. `/panier` — panier local (survit à l'inscription), regroupé par grossiste, contrôle du minimum ; **Commander** → si non connecté : `/inscription?next=/panier` ou `/connexion?next=/panier` ; connecté : une commande marketplace par grossiste (`POST /api/marketplace/vendors/:id/orders`).
5. L'ancienne page de présentation SaaS est déplacée sur `/pour-les-restaurants` (lien dans l'en-tête).

Réservé aux professionnels : tout le monde voit produits et prix HT, un compte restaurant (gratuit) est requis pour commander.

## API publique (sans token)
| Route | Rôle |
|---|---|
| `GET /api/public/catalog?q=&category=&origin=` | produits + `fromUnitPrice` (meilleur prix grossiste actif, null = sur demande) |
| `GET /api/public/products/:id` | fiche + offres + produits du même rayon |
| `GET /api/public/vendors` | grossistes actifs |
| `POST /api/public/product-alert` | « prévenez-moi » → lead |

## Photos produits
`apps/web/public/produits/<slug>.jpg` (slug = nom normalisé, cf. `docs/_products_slugs.json`). Générées par IA en lot (640 px, ~50 Ko) ; à défaut, icône de rayon. Génération par lots de 10 (limite outil) ; 209/324 au 21/09/2026.

Code : `apps/api/src/routes/storefront.ts`, `apps/web/src/pages/store/*`, `apps/web/src/lib/cart.ts`. Tests : `apps/api/src/test/storefront.test.ts`.
