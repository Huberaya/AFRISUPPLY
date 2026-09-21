# Chantier 24 — Recommander en 1 clic & commandes récurrentes

## Restaurant (Achats)
- Bouton **🔁 Recommander** sur toute commande marketplace : aperçu **au prix du jour** (écart % vs dernière fois, produits indisponibles grisés), quantités ajustables → **Renvoyer la commande** (nouvelle commande `source=recommande`, flux normal : grossiste prévenu, rappel 4 h…).
- Case **Programmer chaque semaine** : nom, jours (L→D), → commande récurrente. Section **Commandes récurrentes** en haut d'Achats : prochaine date, estimation, *Envoyer maintenant*, *Pause/Réactiver*, *Supprimer*.
- Le job quotidien (`/api/jobs/daily`, 04h30 UTC) envoie les commandes dont `next_run_on` = aujourd'hui, puis recalcule la prochaine date ; en cas d'échec (offre indisponible, minimum non atteint, grossiste inactif) le restaurant reçoit un e-mail et la récurrence continue la semaine suivante.

## API
`GET /orders/:id/reorder-preview`, `POST /orders/:id/reorder {lines?}`, `GET/POST /recurring`, `PUT/DELETE /recurring/:id`, `POST /recurring/:id/run`. Table `recurring_orders` (migration 0012). Fonction partagée `placeVendorOrder()` (panier, recommande, récurrent) avec contrôles : grossiste actif, offres en stock, minimum de commande.

Le mode « me demander avant » est prévu (champ `mode=confirm`) mais se comporte comme `auto` pour l'instant.
