# Chantier 27 — Avis & fiabilité grossiste

## Pourquoi
Un restaurateur qui choisit un grossiste qu'il ne connaît pas a besoin de preuves : est-il ponctuel ? Les produits sont-ils conformes ? Répond-il vite ? Les avis après livraison et les indicateurs calculés automatiquement remplacent le bouche-à-oreille.

## Ce que voit le restaurant
- **Après chaque livraison** (commande plateforme au statut `livree` / `livree_partiel`, ou livrée par le grossiste avec preuve) : bouton **« ⭐ Noter le fournisseur »** dans *Commandes* → note 1–5, « livré à l'heure ? », « conforme ? », commentaire.
- **Un seul avis par commande** (409 en cas de doublon) ; impossible avant la livraison (400).
- Dans l'annuaire marketplace et sur la fiche grossiste : **badge** + note moyenne + nb d'avis ; la fiche affiche en plus % à l'heure, % conforme, % de commandes acceptées, délai moyen de réponse, % de livraisons avec écart.

## Ce que voit le grossiste (onglet **Avis**)
- Ses indicateurs de fiabilité (90 derniers jours pour l'opérationnel, tous les avis pour la note) et la règle des badges.
- La liste des avis (nom du restaurant en clair pour lui) avec **réponse publique** (une réponse par avis).

## Vitrine publique
- `GET /api/public/vendors` renvoie `reliability` pour chaque grossiste (badge sur la page d'accueil de la vitrine).
- `GET /api/public/vendors/:id/reviews` : avis anonymisés (« C*** », ville) + réponses du grossiste.

## Badges
| Badge | Règle |
|---|---|
| 🏅 Excellent | note ≥ 4,5 · ≥ 90 % à l'heure · ≥ 5 avis |
| ✓ Fiable | note ≥ 4 · ≥ 3 avis (ou ≥ 5 commandes décidées sans signal négatif) |
| Nouveau | moins de 3 avis et moins de 5 commandes |
| ⚠ À surveiller | note < 3,5 **ou** acceptation < 80 % **ou** ponctualité < 70 % |

## API
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/reviews/pending` | restaurant — commandes livrées non notées + ids déjà notés |
| POST | `/api/orders/:id/review` `{rating, onTime?, conform?, comment?}` | restaurant — 201 / 400 / 409 |
| GET | `/api/vendor/reviews` | grossiste — fiabilité + avis reçus |
| POST | `/api/vendor/reviews/:id/reply` `{reply}` | grossiste — réponse publique |
| GET | `/api/public/vendors/:id/reviews` | public |
| GET | `/api/marketplace/vendors[/:id]` | enrichi de `reliability` |

## Données
- Table `vendor_reviews` (migration `0016_reviews`) : `order_id` unique, note 1–5, `on_time`, `conform`, `comment`, `vendor_reply`, `vendor_replied_at`.
- Indicateurs calculés à la volée dans `apps/api/src/lib/reliability.ts` (`reliabilityFor(vendorIds)`).

## Test
`apps/api/src/test/notifications.test.ts` → « chantier 27 » : avis refusé avant livraison, accepté après, doublon 409, réponse grossiste, lecture publique anonymisée, fiche enrichie.
