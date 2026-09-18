# Chantier 10 — Marketplace B2B, achats groupés, commission

## Principe
Un **fournisseur plateforme** (`vendors`) publie un catalogue (`vendor_offers`, produits du référentiel commun uniquement).
Les restaurants de sa zone (ville / département / France) le voient dans **Marketplace**, comparent ses prix à leurs meilleurs prix,
et peuvent :
- **le lier** → un `suppliers` privé (`vendor_id`) est créé avec son catalogue copié : comparateur, panier intelligent, réception, suivi des prix marchent sans changement ; toute modification de prix côté vendeur se propage ;
- **commander** → `orders` (channel `plateforme`, statut `envoyee`) ; le vendeur **confirme** (→ `confirmee`, commission calculée) / **refuse** (→ `annulee` + motif) / marque **expédiée** (mail restaurant) ;
- **participer à un achat groupé** (`group_buys` / `group_buy_participations`) : palier de colis + remise ; à la clôture, si le palier est atteint, une commande `confirmee` (source `achat_groupe`) est créée pour chaque participant au prix remisé, le fournisseur est lié automatiquement.

**Commission** : `commissions` (une ligne par commande confirmée, `vendors.commission_pct`, défaut 3 %), agrégée par période AAAA-MM dans l'espace fournisseur. Facturation Stripe → chantier 6.

## Validation des fournisseurs
Inscription `POST /api/vendor/register` → statut `en_attente` (invisible). Un admin (`ADMIN_EMAILS`) active/suspend et règle la commission sur **/app/admin/fournisseurs**. `VENDOR_AUTO_APPROVE=true` pour activer d'office (dév / démo).

## Écrans
- `/fournisseur` (hors app restaurant, même compte utilisateur) : inscription, commandes à confirmer, catalogue (recherche référentiel + import `produit;conditionnement;quantité;prix`), achats groupés, commissions, fiche.
- `/app/marketplace` : annuaire de ma zone, fiche fournisseur avec écart de prix vs mes prix, commande, achats groupés en cours.
- `/app/admin/fournisseurs` : validation.

## API
Restaurant : `GET /marketplace/vendors`, `GET /marketplace/vendors/:id`, `POST …/link`, `POST …/orders`, `GET /marketplace/group-buys`, `POST /marketplace/group-buys/:id/join`, `GET /marketplace/my-orders`.
Fournisseur (header `X-Vendor-Id` optionnel si un seul espace) : `POST /vendor/register`, `GET /vendor/me`, `GET /vendor/dashboard`, `PUT /vendor/profile`, `GET|POST /vendor/offers`, `POST /vendor/offers/import`, `DELETE /vendor/offers/:id`, `GET /vendor/orders`, `POST /vendor/orders/:id/(confirm|refuse|shipped)`, `GET|POST /vendor/group-buys`, `POST /vendor/group-buys/:id/close`, `GET /vendor/commissions`.
Admin : `GET /admin/vendors`, `PUT /admin/vendors/:id`. Public : `GET /public/reference?q=`.

## Migration
`packages/db/drizzle/0003_marketplace.sql` (appliquée automatiquement par `AUTO_MIGRATE`). Les références de commande utilisent désormais une séquence globale `order_ref_seq` (l'index `orders_ref` est unique sur toute la plateforme).

## Tests
`apps/api/src/test/marketplace.test.ts` : inscription → validation → catalogue/import → visibilité par zone → lien → commande (minimum, confirmation, commission 4 %) → achat groupé atteint (2 commandes) / non atteint (annulé) → refus.

## Suites possibles
Notation des fournisseurs après réception, messagerie commande, facture de commission automatique (Stripe), notification push PWA au vendeur.
