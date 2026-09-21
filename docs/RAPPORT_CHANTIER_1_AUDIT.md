# Rapport de fin de chantier 1 — Intégrité de la réception et des statuts de commande

> Audit AFRISUPPLY · chantier 1/11 · date : 21/09/2026
> Périmètre : impossibilité de compter deux fois une livraison, impossibilité de renvoyer/modifier une commande close, refus des quantités invraisemblables, réception atomique.

---

## ✅ Corrigé (prouvé par exécution)

| Bug d'audit | Comportement avant | Comportement après | Preuve |
|---|---|---|---|
| **BUG-1 🔴** double réception | 2ᵉ `POST /orders/:id/receive` accepté → stock 123 → 173 → **223 kg** | 2ᵉ réception refusée **409 `order_already_received`**, stock inchangé (173 → 173) | `audit/chantier1_verif.py` (23/23), `edge_tests.py` rejoué |
| **BUG-2 🟠** statuts non protégés | `POST /orders/:id/send` sur une commande `livree` → **200** et statut remis à `envoyee` | **409** (`order_already_received` / `order_closed`) ; `PUT /orders/:id` et `PUT /orders/:id/lines` refusent aussi (**409**) | idem |
| **BUG-3 🔴** quantité reçue absurde | `receivedQty = 1e12` → **500** (dépassement `numeric(12,3)`) ; 900 000 kg acceptés | **400** explicite (`Quantités reçues invalides…`) puis **400 `quantity_out_of_range`** avec plafond chiffré | idem |
| **BUG-4 🔴** commande à 999 999 colis | acceptée → **42 999 958 €** de bon de commande | **400** : « colis entre 1 et 1000 » ; le plafond métier refuse même 500 colis (~12,5 t) avec explication | idem |

Effets de bord corrigés dans la foulée :

* la réception est désormais **atomique** (transaction : livraison + stock + lignes + écarts + alerte + statut) : plus de stock modifié sans commande clôturée, ni l'inverse ;
* les commandes **déjà** réceptionnées avant ce correctif ont été **rétro-marquées** (`orders.received_at`) et sont donc protégées elles aussi ;
* un restaurant ne peut plus voir disparaître une commande en cours sans trace (chaque transition écrit dans la timeline).

---

## 📁 Fichiers

**Base de données**
* `packages/db/src/schema.ts` — `orders.receivedAt` (horodatage de réception) + `uniqueIndex('deliveries_order_unique')` (une commande = une livraison).
* `packages/db/drizzle/0012_order_integrity.sql` *(nouveau)* — nettoyage des doublons de livraison déjà créés, ajout de la colonne, backfill des commandes déjà réceptionnées, création de l'index unique. `meta/_journal.json` + `meta/0012_snapshot.json` mis à jour.
* `packages/db/src/limits.ts` *(nouveau)* + export dans `packages/db/src/index.ts` — plafonds de plausibilité calculés sur les données réelles.

**API**
* `apps/api/src/lib/orders.ts` *(nouveau)* — machine à états : `checkSend`, `checkReceive`, `checkStatusChange`, `checkLineEdit`, états terminaux/réceptionnables, codes d'erreur (`order_already_received`, `order_closed`, `order_cancelled`, `invalid_transition`, `order_not_receivable`, `order_not_editable`, `order_not_sendable`).
* `apps/api/src/routes/restaurant.ts` — `POST /orders` (plafonds + `override`), `POST /orders/:id/send` (garde + écriture conditionnelle + événement), `POST /orders/:id/receive` (garde, plafonds, transaction `SELECT … FOR UPDATE`, horodatage, réponse enrichie), `assertPlausibleQuantity()` exporté.
* `apps/api/src/routes/manage.ts` — `PUT /orders/:id` (machine à états + journalisation), `PUT /orders/:id/lines` (garde + plafonds).
* `apps/api/src/routes/marketplace.ts` — création de commande plateforme bornée (80 lignes, 1000 colis/ligne) + plafonds.

**Web**
* `apps/web/src/pages/Orders.tsx` — badge « ✓ Reçue le … », bouton « Réceptionner » masqué si déjà réceptionnée, confirmation avant validation, anti-double-clic, encart ambre « quantité invraisemblable » avec bouton « Le volume est réel, confirmer », encart rouge « déjà réceptionnée ».
* `apps/web/src/lib/api.ts` — `ApiError` transporte désormais `code` et `details` (l'UI distingue les refus).

**Tests / vérification**
* `apps/api/src/test/order-integrity.test.ts` *(nouveau)* — 18 tests.
* `audit/chantier1_verif.py` *(nouveau)* — 23 vérifications en direct contre l'API réelle.

---

## 🔧 Fonctionnalités livrées

1. **Réception idempotente** : une commande ne peut être réceptionnée qu'une fois. Toute tentative ultérieure reçoit un message compréhensible (« déjà réceptionnée le 21/09/2026 ; pour corriger, utilisez un ajustement de stock ou un inventaire ») — et le stock n'est pas touché. Protections à deux niveaux : verrou applicatif (`SELECT … FOR UPDATE` dans la transaction) **et** index unique en base (`deliveries_order_unique`), donc même deux clics simultanés n'y arrivent pas.
2. **Plafond de plausibilité dérivé de la réalité du restaurant** (et non d'une constante) : consommation mensuelle mesurée = max(conso 28 j, moyenne 90 j ÷ 3) ; à défaut seuil critique × 30 j ; à défaut ordre de grandeur par catégorie ; plafond = ×12 mois (`ORDER_MAX_MONTHS_OF_STOCK`). Message d'erreur chiffré : « 500 colis (12 500 kg) dépasse votre maximum habituel de 216 colis ».
3. **Dépassement possible mais explicite** : `override: true` (bouton « Le volume est réel, confirmer ») accepte un volume exceptionnel et le journalise dans la timeline de la commande. Un lot de saison ou une grosse commande de fêtes n'est donc pas bloqué.
4. **Cycle de vie verrouillé** : plus aucun retour en arrière après réception ; `envoyée → préparée` reste possible (correction d'une commande partie quelques secondes plus tôt) ; annulation possible tant que rien n'est réceptionné.
5. **Réception transactionnelle** : soit tout passe (livraison, stock, mouvements, lignes, écarts, alerte, statut, horodatage), soit rien.
6. **Écran Achats cohérent** : l'utilisateur ne peut plus cliquer là où l'API refusera ; en cas de refus, il voit la raison en français, pas une erreur technique.

---

## 🧪 Tests et preuves d'exécution

| Vérification | Résultat |
|---|---|
| `npx vitest run` (API, 19 fichiers) | **123 tests passés** (105 avant + 18 nouveaux), 0 échec |
| `packages/db` / `apps/web` / `apps/api` `tsc --noEmit` | **0 erreur** |
| `npm run build -w apps/web` | OK (5,97 s) |
| `audit/chantier1_verif.py` (API réelle) | **23/23 OK** |
| `audit/edge_tests.py` rejoué | 4 anciens bugs → 409/409/400/400 (avant : 200, 200, 200, 500) |
| `audit/scenario_tests.py` | **49/49 OK** (dont isolation cross-tenant) |
| `audit/market2.py` (parcours marketplace complet) | OK : offre → commande 4×25 kg → confirm → préparation → expédition → **réception 90/100 kg** → écart + réclamation → commission 4,8 € |
| Migration 0012 sur base existante | colonne + index créés, doublons purgés, 15 commandes rétro-marquées |

Le scénario métier n°4 de l'audit (« 50 kg commandés / 45 reçus ») est re-vérifié de bout en bout : écart détecté, réclamation pré-rédigée, commande en `livree_partiel`, ligne visible dans **Écarts**, alerte « Écart sur la livraison » créée.

---

## ⚠️ Restant / limites assumées

* **Le plafond est un garde-fou, pas un calcul de besoin** : pour un produit jamais consommé, il repose sur le seuil critique saisi ou sur un ordre de grandeur par catégorie. C'est volontaire (mieux vaut demander confirmation qu'inventer une consommation).
* **Une commande confirmée ne peut plus repasser en « préparée »** : pour corriger une commande déjà confirmée par le grossiste, il faut l'annuler et la recréer. Choix assumé (garantit qu'une commande visible côté grossiste ne change plus sous ses pieds).
* **Pas de verrou distribué** : la protection repose sur la transaction et l'index unique Postgres — suffisant pour l'architecture actuelle (une base, un écrivain par restaurant). À revoir si un jour plusieurs instances écrivent en parallèle sur des cas de course extrêmes.
* **La base de démonstration est polluée par l'audit** : une commande à 42 M€ (créée avant correctif) et plusieurs écarts de test y figurent. À purger/regénérer avant toute démo client.
* **Hors périmètre de ce chantier, encore ouverts** : BUG-5 (une route inconnue renvoie 401 au lieu de 404), BUG-6 (le comparateur laisse fuiter le nom d'un produit privé d'un autre restaurant), BUG-7 (le prix réellement facturé à la réception n'est pas enregistré) → chantiers 2, 3 et 5.
* **Aucun commit n'a été fait** (les changements sont dans l'arbre de travail, `git status` fourni) : je peux commiter sur demande.

---

## ➡️ Suivant — chantier 2 : sécurisation avant tout accès extérieur

Problème : l'application telle qu'elle est déployée aujourd'hui peut être ouverte au public dans un état dangereux (`SEED_DEMO=true` par défaut, identifiants de démonstration pré-remplis dans l'écran de connexion, JWT en `localStorage` 30 jours sans renouvellement, CORS `origin: o ?? '*'` avec credentials, aucun reset de mot de passe, rôles `member_role` définis mais non appliqués, rate-limit en mémoire non partagé, dépendance `xlsx` en vulnérabilité HIGH sans correctif).

Résultat attendu : un déploiement « fermé par défaut » (pas de compte de démo, secrets obligatoires, CORS restreint, session révocable) qu'on peut mettre en ligne sans exposer les données de qui que ce soit.

**En attente de votre validation pour démarrer le chantier 2.**
