# Chantier 15 (B) — Tableau de bord fournisseur « Analyses »

Onglet **Analyses** dans `/fournisseur` (`GET /api/vendor/analytics`) :
- **4 indicateurs** : CA 90 jours, restaurants actifs, taux d'acceptation des commandes, délai de réponse moyen.
- **CA 6 mois** (graphique barres, commandes confirmées/livrées).
- **Produits qui se vendent** (90 j) : colis, CA, part, nb restaurants.
- **Meilleurs clients** : commandes, CA, dernière commande (⚠️ au-delà de 30 j = client à relancer).
- **Demande non couverte** : produits suivis en stock par les restaurants de mes zones de livraison (et de mes catégories) que je ne propose pas → bouton **Ajouter** (pré-remplit la création d'offre).
- **Demandes vitrine** : compte des clics « Me prévenir » par produit (leads source `vitrine`, 90 j).

Code : fin de `apps/api/src/routes/vendor.ts`, `apps/web/src/pages/vendor/Analytics.tsx`. Test : `vendor-invite.test.ts` (bloc analytics).
