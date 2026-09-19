# Chantier 12 — Import de catalogue fournisseur & prix express

**Objectif** : mettre un grossiste en ligne en 10 minutes, sans saisie ligne à ligne.

## Côté fournisseur (`/fournisseur` → onglet Catalogue)
1. **Importer mon tarif** — trois entrées :
   - coller un texte libre (« Riz brisé parfumé sac 25 kg 29,90 »), ou des colonnes copiées depuis Excel (séparateur `;` ou tabulation) ;
   - déposer un fichier `.csv` / `.xlsx` (lu dans le navigateur, aucune clé requise) ;
   - prendre une **photo** ou un scan du tarif (nécessite `LLM_API_KEY` ; sinon message clair « collez le texte »).
2. **Relecture** : chaque ligne est rapprochée du référentiel (324 produits + alias). Menu déroulant des candidats avec score, avertissement si l'unité lue ne correspond pas (ex. tarif en litres sur un produit vendu au kg), prix actuel → nouveau avec % de variation, possibilité d'ignorer une ligne ou de corriger le prix.
3. **Publier** : upsert des offres, propagation aux restaurants liés (`supplierOffers` + `priceHistory` source `catalogue`), option « passer en rupture les produits absents de ce tarif ».
4. **Prix express** : une ligne façon SMS — `riz brisé 25 kg 41`, `attiéké rupture`, `gombo dispo`.

## API
| Route | Rôle |
|---|---|
| `POST /api/vendor/catalog/parse` `{text}` ou `{image}` | lignes lues + candidats + prix actuel |
| `POST /api/vendor/catalog/apply` `{lines[], replaceMissing}` | publication + audit `vendor.catalog_import` |
| `POST /api/vendor/offers/quick` `{text}` | mise à jour d'un prix / disponibilité |

Code : `apps/api/src/lib/catalog-import.ts`, routes en fin de `apps/api/src/routes/vendor.ts`, UI `apps/web/src/pages/vendor/CatalogImport.tsx`. Tests : `apps/api/src/test/catalog-import.test.ts` (suite : 87/87).
