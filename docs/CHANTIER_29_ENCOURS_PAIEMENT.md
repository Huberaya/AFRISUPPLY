# Chantier 29 — Encours & conditions de paiement

## Pourquoi
Dans l'alimentaire de gros, le crédit fournisseur est la règle : « paiement à 30 jours », avec un plafond tacite. Le grossiste a besoin de voir qui lui doit quoi et de fermer le robinet en cas d'impayé ; le restaurant a besoin de savoir ce qu'il doit et quand.

## Côté grossiste — onglet **Encours**
- 4 chiffres : à encaisser, en retard, factures ouvertes, clients à crédit.
- **Conditions par client** : délai (comptant / 15 / 30 / 45 / 60 j), plafond d'encours (jauge), blocage manuel, note. Défaut : comptant, sans plafond.
- **Factures à encaisser** : commande, client, livrée le, échéance (rouge si dépassée), reste dû → **Encaisser** (total ou acompte, moyen : virement, CB, espèces, chèque, prélèvement, avoir). La timeline de la commande garde la trace.

## Côté restaurant
- Fiche grossiste : « Paiement à 30 jours · encours 420 € / 1 500 € », alertes retard / compte bloqué.
- *Achats* : bandeau « Factures fournisseurs à régler » avec échéances.
- E-mails automatiques (job quotidien) : J-2 avant échéance, puis J+1, J+8, J+15 de retard.

## Règles serveur (`lib/credit.ts`)
- **Exposition** = somme des commandes plateforme engagées (hors brouillon/annulée) non soldées, frais de port inclus, acomptes déduits.
- À la commande, refus **402** si : compte bloqué ; au moins une facture en retard (et délai > 0) ; encours + panier > plafond.
- `orders.payment_days` figé à la commande ; `due_at` = livraison (grossiste ou réception restaurant) + délai ; `paid_amount_eur` / `paid_at` / `payment_method`.

## API
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/vendor/credit` | clients (conditions + exposition) et factures ouvertes |
| PUT | `/api/vendor/credit/:restaurantId` `{paymentDays?, creditLimitEur?, blocked?, note?}` | conditions |
| POST | `/api/vendor/orders/:id/payment` `{amountEur?, method?, paidAt?}` | encaissement (409 si soldée, 400 si > reste dû) |
| GET | `/api/marketplace/vendors/:id/credit` | restaurant — mes conditions et mon encours |
| GET | `/api/marketplace/payables` | restaurant — factures à régler |

Migration `0019_credit` (table `vendor_credit_terms`, colonnes `orders.payment_days/due_at/paid_at/paid_amount_eur/payment_method`).

## Test
`notifications.test.ts` → « chantier 29 » : délai figé sur la commande, plafond 402, échéance +30 j à la livraison, acompte puis solde (409 ensuite), retard → 402, blocage → refus, rappels.

## Suite naturelle
Chantier 25 (Stripe) : paiement en ligne des factures « comptant » et prélèvement SEPA à l'échéance.
