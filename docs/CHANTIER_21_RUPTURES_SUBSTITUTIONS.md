# Chantier 21 — Ruptures partielles & substitutions

**Problème** : sur le frais/exotique, une commande sur trois a une ligne indisponible ; sans outil, le grossiste refuse tout ou livre autre chose sans prévenir.

## Grossiste (onglet Commandes, commande « À confirmer »)
- Bouton **✏️ Rupture partielle / substitution** : par ligne, « je peux livrer N/M » et, pour le manque, « remplacer par » une offre de son catalogue (quantité). Message libre, nouveau total calculé en direct.
- `POST /vendor/orders/:id/propose` : contrôles (≤ commandé, offre du même grossiste, ≥ 1 changement, total > 0). La commande reste **envoyée** ; la proposition est stockée dans `orders.proposal` (migration 0011), événement de chronologie + e-mail/WhatsApp au restaurant.
- Le grossiste peut toujours confirmer tel quel (efface la proposition) ou refuser.

## Restaurant (Achats)
- Encart ambre « X propose une modification » : détail ligne par ligne (rupture, quantité réduite, remplacement), nouveau total vs ancien, message.
- **✅ Accepter** → lignes mises à jour (suppression si 0, quantité réduite, ligne de remplacement ajoutée), total recalculé, commande **confirmée**, commission créée, grossiste prévenu → passe en préparation.
- **Refuser** → commande annulée, grossiste prévenu, lien « Comparer ailleurs ».
- `POST /orders/:id/proposal {action: accept|decline}`.
