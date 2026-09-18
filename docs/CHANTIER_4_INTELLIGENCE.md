# Chantier 4 — Intelligence : prévision, panier, auto-reorder, assistant

Principe directeur : **tout est déterministe et explicable**. Le LLM est optionnel et ne fait que reformuler des chiffres déjà calculés ; il n’a jamais accès à l’écriture et n’invente jamais un prix.

## 1. Prévision des besoins (`apps/api/src/lib/forecast.ts`)
- **Entrée** : ventes par plat et par jour (`sales`), fiches recettes (`recipe_ingredients`), stock (`inventory_items`).
- **Ventes prévues par plat** : pour chaque jour J+1…J+7, moyenne pondérée des 4 dernières occurrences du même jour de semaine (poids 40/30/20/10) × tendance 28 j / 28 j précédents bornée [0,7 ; 1,3] × coefficient événement optionnel. Un jour de semaine sans aucune vente alors que les jours voisins en ont est traité comme **jour de fermeture** (0). Confiance = couverture des 4 semaines × pénalité si peu de jours saisis.
- **Besoin produit** = Σ (portions prévues × quantité par portion) ; jour de rupture = premier jour où le cumul dépasse le stock.
- **Commande recommandée** = besoin + sécurité (2 jours de besoin moyen) − stock, plafonnée par `targetLevel × 1,5` ; sans recette → repli sur le seuil critique (expliqué).
- Chaque ligne porte une **explication en français** (« calculé à partir de 3 recettes… pic samedi… rupture prévue le 20/09 »).
- `POST /forecast/snapshot` archive la prévision (table `forecasts`) pour mesurer plus tard l’écart prévision/réel.

## 2. Panier intelligent (`buildSmartCart`)
- Pour chaque produit à commander : score = coût des packs + pénalité si délai fournisseur > jours de stock restants + 15 % × (100 − fiabilité %) ; offres hors stock exclues.
- Consolidation par fournisseur ; si un fournisseur reste **sous son minimum**, ses lignes sont déplacées vers le 2e choix quand le surcoût est inférieur aux frais évités (note affichée).
- `saving` = coût chez le fournisseur habituel (ou le plus cher) − coût du panier.
- `POST /smart-cart/checkout` crée une commande **`preparee`** par fournisseur (`source = panier_ia`) — validation humaine obligatoire dans Achats.

## 3. Auto-reorder
- Règle par article : seuil, quantité, stratégie (`best` = meilleure offre, `preferred` = fournisseur habituel).
- `POST /reorder-rules/run` : pour chaque règle active sous le seuil, sans commande en cours pour ce produit → commande `preparee` (`source = auto_reorder`) + alerte dédupliquée `auto_reorder:<orderId>`. Idempotent : relancer ne crée pas de doublon. À brancher sur un cron (Neon : GitHub Action ou Vercel cron quotidien).

## 4. Ventes du jour
- `POST /sales { day, lines[{recipeId, portions}], decrementStock }` — upsert par (restaurant, recette, jour) ; si `decrementStock`, mouvements `vente` selon les fiches recettes.

## 5. Assistant « Demander à l’IA » (`apps/api/src/lib/assistant.ts`)
- Classification d’intention par règles FR (accents ignorés) + détection d’entité (produit / plat / fournisseur du restaurant) : `what_to_order`, `why_costs_up`, `find_cheaper`, `dish_cost`, `most_reliable_supplier`, `should_raise_price`, `monthly_spend`, `upcoming_stockouts`, `stock_level`, `help`.
- Chaque intention est résolue par les moteurs existants (prévision, comparateur, coût recette, fiabilité, historique de prix, dépenses). Réponse `{ answer, facts[], actions[{label,url}], engine }`.
- Si `LLM_API_KEY` est défini : l’API compatible OpenAI reformule la réponse **sans changer un chiffre** (instruction stricte, température 0,2, repli local en cas d’erreur/timeout).

## Écrans
`/app/stock/prevision` (tableau + sparklines + explication au clic), `/app/achats/panier` (panier par fournisseur, quantités éditables, économie, checkout), `/app/ventes` (saisie couverts + règles auto-reorder + exécution), `/app/ia` (chat avec faits et boutons d’action).

## Tests
`apps/api/src/test/forecast.test.ts` : saisonnalité hebdo, jour de fermeture, jour de rupture, repli seuil critique, choix d’offre + économie, regroupement sous minimum, produits sans offre, classification de 8 questions du concept.

## Limites / suite
- Pas encore d’événements (soirées privatisées) dans l’UI — le moteur accepte déjà `eventMultipliers`.
- Pas de mesure automatique de précision (snapshots à comparer aux ventes réelles).
- E-mail quotidien « à commander aujourd’hui » et cron auto-reorder : chantier 4 bis.
