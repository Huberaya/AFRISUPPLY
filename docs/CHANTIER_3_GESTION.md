# Chantier 3 — Produit MVP : gestion quotidienne (formulaires, envoi, réception, écarts, prix)

Objectif : qu'un restaurant pilote gère **100 % de ses achats dans l'outil** sans revenir à son cahier. Les chantiers 1/2/4 avaient posé les moteurs ; celui-ci apporte les gestes du quotidien.

## Ce qui a été livré

### Fournisseurs
- Création (formulaire complet : contact, WhatsApp, e-mail, délai, minimum, frais, catégories, note, notes libres), modification, désactivation douce (`isActive=false`, historique conservé, offres passées en indisponible).
- **Saisie des prix** depuis la fiche : produit du référentiel (recherche avec alias), conditionnement, quantité, prix du colis → prix unitaire calculé. Modifier un prix alimente `price_history` (source `manuel`) et renvoie l'évolution en %.
- Le produit devient automatiquement suivi en stock quand un prix ou une recette le référence.

### Commandes : envoi sans compte fournisseur
- `GET /orders/:id/message` génère un message FR prêt à envoyer (lignes, total, livraison souhaitée, remarque, signature) + liens **`wa.me`** (numéro normalisé) et **`mailto:`**.
- Écran Achats : « Envoyer au fournisseur » → aperçu, boutons WhatsApp / E-mail / Copier, puis « J'ai envoyé → marquer Envoyée ». Modification des lignes tant que la commande est « préparée » (0 = retrait ; toutes à 0 = annulation), annulation, statut.

### Réception & écarts
- La réception (existante) crée maintenant une **alerte `ecart_livraison`** (dédupliquée par livraison, valeur manquante estimée, lien vers l'écran des écarts).
- Nouvel écran **`/app/achats/ecarts`** : écarts ouverts, valeur à récupérer (manquants × prix commandé), fournisseur le plus concerné, réclamation pré-rédigée à copier, résolution (avoir / relivraison / abandon) qui clôt aussi l'alerte.

### Stock
- Réglages par article : seuil critique, niveau cible, fournisseur habituel ; retrait du suivi.
- **Inventaire** : saisie groupée par catégorie (mobile-friendly, seuls les champs remplis comptent) → un mouvement `ajustement` par écart + `lastCountedAt`.
- « Suivre un produit » depuis le référentiel.

### Recettes
- Création / modification / suppression avec recherche d'ingrédients, quantités par portion, prix de vente et marge cible ; le coût matière et la marge se recalculent immédiatement.

### Suivi de prix
- `GET /prices/:productId/history` (séries par offre, variation %), affiché en **courbe SVG** dans le comparateur (aucune dépendance graphique).

## API ajoutée (`apps/api/src/routes/manage.ts`)
`PUT/DELETE /suppliers/:id` · `POST /suppliers/:id/offers` · `PUT/DELETE /offers/:id` · `GET /prices/:productId/history` · `POST/PUT/DELETE /recipes[/:id]` · `PUT/DELETE /stock/:itemId` · `POST /stock/inventory` · `GET /orders/:id/message` · `PUT /orders/:id` · `PUT /orders/:id/lines` · `GET /discrepancies` · `POST /discrepancies/:id/resolve`.

## Composants web
`Modal`, `Field`, `ProductPicker` (recherche catalogue avec debounce), `SupplierForm`, `PriceHistory`.

## Tests
`messages.test.ts` (normalisation WhatsApp, contenu du message) — 32 tests verts au total.

## Reste à faire (hors périmètre)
- Export PDF du bon de commande (le texte suffit aux pilotes ; à ajouter si demandé).
- Photos de produits, scan de facture à la réception.
- Envoi e-mail direct depuis le serveur (nécessite un fournisseur SMTP — chantier 4 bis avec l'e-mail quotidien).
