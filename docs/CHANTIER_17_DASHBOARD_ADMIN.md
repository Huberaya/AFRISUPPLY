# Chantier 17 — Tableau de bord fondateur (`/app/admin`)

Premier écran du menu **Admin AFRISUPPLY** (visible pour les e-mails de `ADMIN_EMAILS`). `GET /api/admin/dashboard`.

- **À faire** en tête : grossistes à valider, demandes de produits, commandes en attente, alerte « aucun grossiste actif », configuration manquante (IA, Stripe).
- **Demande** : restaurants inscrits (+30 j), actifs, essai/payants, utilisateurs, produits suivis.
- **Offre** : grossistes actifs / en attente, offres en ligne, produits couverts, **couverture de la demande** (% des produits suivis ayant ≥ 1 offre), demandes vitrine.
- **Activité & argent** : commandes marketplace 30 j, volume d'affaires, taux d'acceptation et délai de réponse, commissions du mois / non facturées, en attente grossiste.
- Graphiques 12 semaines : commandes (toutes vs marketplace), inscriptions.
- Pipeline prospection restaurants / grossistes (à contacter → en cours → convertis → perdus).
- Produits les plus suivis (avec/sans offre), grossistes, 15 derniers restaurants, dernières commandes, journal d'activité, état de la configuration.
