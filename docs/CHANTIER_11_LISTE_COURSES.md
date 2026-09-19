# Chantier 11 — Liste de courses en langage naturel (« façon Éthimarket »)

## Ce que fait la fonctionnalité
Page **Liste de courses** (`/app/courses`). Le restaurateur écrit ou **dicte au micro** : « 10 kg de piment, 5 kilo de riz, 2 cartons poisson fumé ».
1. Reconnaissance des produits (référentiel commun + produits privés ; tolère fautes, « kilo », chiffres en lettres). Le nom du produit prime sur ses alias.
2. Comparaison de **toutes** les offres : fournisseurs Marketplace livrant la zone + fournisseurs perso du restaurant, triées au prix/unité.
3. Calcul des colis (5 kg de riz → 1 sac 25 kg ; « 2 cartons » → 2 colis ; g/mL → kg/L). Offre la moins chère pré-sélectionnée, écart de prix affiché.
4. Commande en un clic, regroupée par fournisseur : plateforme → `POST /marketplace/vendors/:id/orders` (envoyée) ; perso → `POST /orders` (préparée). Minimums contrôlés.
5. **Listes enregistrées** (« Liste du lundi ») rejouables, compteur d'usage ; **suggestions** : réassort (stock ≤ seuil → compléter au niveau cible) et « refaire la dernière commande ».

## API
- `POST /api/shopping/parse` `{ text }` → `{ lines[{ raw, qty, unit, neededQty, product, candidates, offers[], selected, savingPct, note }], unmatched, sellers }`
- `GET/POST /api/shopping/lists`, `PUT /api/shopping/lists/:id` (`name`, `text`, `used:true`), `DELETE`
- `GET /api/shopping/suggestions` → `{ restock:{count,text}, last:{reference,date,text} }`

## Données
Migration `0007_shopping_lists` (table `shopping_lists`). Tests : `apps/api/src/test/shopping.test.ts` (5 tests).

## Limites / suite
- Dictée vocale : Web Speech API (Chrome, Safari, Android) ; non disponible sur Firefox.
- Avec `LLM_API_KEY` : comprendre « de quoi faire 50 mafés » via les recettes (à brancher sur `/api/assistant`).
