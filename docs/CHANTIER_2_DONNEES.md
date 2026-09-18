# Chantier 2 — Données : catalogue produits, recettes types, import fournisseurs

## Ce qui est livré

| Brique | Fichier | Contenu |
|---|---|---|
| Référentiel produits | `packages/db/src/data/products.ts` | **324 références** en 6 catégories, chacune avec alias (orthographes, langues locales : attieke/garba, saka-saka/pondu, soumbala/nététou/dawadawa/iru, maggi/jumbo…), unité de base, origine typique, conditionnements grossistes, DLC moyenne, saisonnalité, tags d'usage (plats) |
| Recettes types | `packages/db/src/data/recipes.ts` | **31 plats** emblématiques (Sénégal, Côte d'Ivoire, Cameroun/Congo, Nigeria/Ghana, boissons) avec grammages moyens par portion et prix conseillé |
| Moteur de reconnaissance | `findReferenceProduct()` | Recherche exacte → inclusion → contenu, sur nom + alias normalisés (accents, apostrophes) |
| Import CSV | `apps/api/src/lib/csv.ts` + `POST /api/import/suppliers` | Séparateur auto, guillemets, BOM Excel ; synonymes de colonnes FR/EN ; lecture des conditionnements (« Sac 25 kg », « Carton 24 × 33 cl ») ; mode **dry-run** avec aperçu ligne à ligne ; création fournisseurs / offres / prix / produits privés ; suivi stock automatique |
| Export | `GET /api/export/offers.csv`, `GET /api/import/template.csv` | Aller-retour Excel |
| Onboarding | `GET /api/onboarding/templates`, `POST /api/onboarding/apply` | Cocher ses plats → recettes + ingrédients + stock suivi |
| UI | `Catalogue`, `Configurer ma carte`, `Import` | 3 nouvelles pages ; l'inscription redirige vers l'onboarding |
| Tests | `packages/db/src/data/validate.test.ts`, `apps/api/src/test/csv.test.ts` | Unicité, ≥300 refs, aucun ingrédient orphelin, alias, parsing CSV |

## Parcours d'un nouveau restaurant (≈ 10 min)

1. Inscription → **Configurer ma carte** : coche 8 plats → ~50 produits suivis, recettes prêtes.
2. **Import** : dépose l'export Excel de ses tarifs fournisseurs (ou saisit 10 lignes) → fournisseurs, prix, comparateur actifs.
3. **Stock** : premier inventaire (clic sur les quantités).
4. Le lendemain : alertes, coût matière, comparateur fonctionnent.

## Décisions

- **Référentiel partagé + produits privés** : `products.restaurant_id IS NULL` = référentiel AFRISUPPLY, sinon produit propre au restaurant. Le référentiel s'auto-synchronise (`ensureReference`) — ajouter une ligne dans `products.ts` suffit.
- **Alias larges plutôt que ML** : la reconnaissance à l'import repose sur des alias curatés ; c'est déterministe, explicable et corrigeable. Un LLM pourra proposer des correspondances pour les lignes « nouveau produit » (chantier 4).
- **Grammages = point de départ** : les recettes types donnent des ordres de grandeur ; le restaurateur ajuste (formulaires chantier 3).
- **Prix de départ** : aucune grille de prix nationale embarquée (trop vite obsolète). Les prix viennent des restaurants (import, réception). À terme, l'agrégation anonymisée entre restaurants donnera l'indice de prix (chantier 8/9).

## À compléter (backlog chantier 2)

- [ ] Base fournisseurs publique (30–50 grossistes IDF / Nantes / Lyon / Marseille) — collecte terrain, tables `public_suppliers` + zone de livraison
- [ ] Photos produits (image_url) — banque libre de droits ou génération
- [ ] Traductions EN des noms (restaurants anglophones : Nigeria, Ghana)
- [ ] Import Excel natif (.xlsx) via SheetJS côté navigateur (aujourd'hui : CSV UTF-8)
- [ ] Suggestions LLM pour les lignes non reconnues
