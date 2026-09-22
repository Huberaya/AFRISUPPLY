# Rapport — Fusion des deux historiques (audit 4→12 ↔ photos produits + chantier 25)

**Date** : 21 septembre 2026
**Branche** : `main`. **Deux fusions successives** : `origin/main` avait avancé deux fois pendant l'audit.
**Commits de fusion** : `a3d8fb2` (fusion 1 — 13 commits distants, dont le paiement en ligne) puis
`0a94fa0` + `b31cd86` (fusion 2 — démarrage à froid et photos lot 10, arrivés après la première fusion).
Le push vers `origin/main` a été une **simple avance en fast-forward** (aucun `--force`). Il a finalement
abouti le **22 septembre 2026** après **sept fusions** — voir §7 et §10 (le premier essai avait été refusé
par GitHub : le jeton utilisé ne portait pas le scope `workflow`, indispensable pour publier
`.github/workflows/`).

---

## 1. Pourquoi ce rapport existe

Le travail d'audit (chantiers 4 à 12) a été mené **en local**, sans push après le chantier 3. Pendant ce
temps, `origin/main` a reçu **13 commits** que nous n'avions pas : neuf lots de photos produits
(89 → 169 photos sur 324) et **« Chantier 25 : paiement en ligne des commandes (Stripe Connect Express) »**,
plus les chantiers 19 (tournées/créneaux), 24 bis (récurrentes à valider) et 29 (encours & conditions de
paiement).

Autrement dit : deux versions du produit avaient divergé depuis `48826af`, et **un push direct était
impossible** (et un `--force` aurait détruit leurs 13 commits — jamais fait, jamais proposé comme
solution par défaut).

## 2. Ce que la fusion devait garantir

1. **Rien ne disparaît** : ni leurs fonctionnalités (paiement en ligne, tournées, encours, photos),
   ni les corrections de l'audit (14 correctifs de bugs, réception idempotente, prix facturé, sauvegardes
   et restauration prouvée, supervision, UX…).
2. **Une base de données reste cohérente** : les deux branches avaient créé des migrations portant les
   **mêmes numéros** (0018, 0019, 0020) — un cas classique qui casse silencieusement une production.
3. **Tout est re-vérifié après fusion** : une fusion « qui compile » ne prouve rien.

## 3. Les 12 conflits, et comment chacun a été tranché

| Fichier | Nature du conflit | Résolution (les deux apports conservés) |
|---|---|---|
| `apps/api/src/jobs/daily.ts` | imports + fin de la passe quotidienne | Leurs relances (encours, récurrentes) **+** ma sauvegarde/surveillance. Leur rappel d'encours a été **replacé avant** l'écriture de la ligne de supervision, pour qu'il apparaisse dans le résumé du job (sinon l'information n'aurait pas été supervisée) |
| `apps/api/src/routes/marketplace.ts` | création de commande fournisseur | Leurs contrôles (encours, plafond, créneau de tournée) **+** mon `insertWithFreshReference()` : une collision de référence ne renvoie plus 500 |
| `apps/api/src/routes/billing.ts` | webhook Stripe + imports | Leur branche « paiement de commande » (`order_payment`) et ma gestion des abonnements/factures coexistent dans le même webhook, avec une seule déclaration de la variable `o` |
| `apps/api/src/routes/vendor.ts` | imports | Union des tables (encours, tournées) ; un import dupliqué de `stripeConfigured` supprimé |
| `packages/db/src/schema.ts` | colonnes ajoutées de part et d'autre | **Union** : `orders.payment_days/route_id/…`, `vendors.stripe_account_id` **et** `users.email_verified_at`, `alerts.notified_at`, `billing_events.status/error`, `vendors.billing_email` |
| `apps/web/src/pages/vendor/VendorSpace.tsx` | onglets fournisseur | Onglet « Commissions » (retour de Stripe) **et** onglet demandé par l'URL (tournées, commandes) |
| `README.md` | réécriture (moi) vs liste (eux) | Ma table des chantiers d'audit conservée ; leurs 4 nouvelles entrées de documentation ajoutées |
| `api/index.js` | bundle généré | Régénéré depuis le code fusionné (`npm run build:api`) — jamais résolu à la main |
| `drizzle/meta/0020_*.json`, `_journal.json` | **migrations** | Voir §4 |
| 3 écrans fournisseur (`Routes`, `Credit`, `Payments`) | *hors conflit* | Détectés en vérification : `confirm()` natif et absence de « Réessayer » — corrigés (§5) |

## 4. Le piège des migrations (le point le plus dangereux)

Les deux branches avaient créé des migrations avec **les mêmes numéros** :

| Numéro | Notre côté (audit) | Leur côté (publié) |
|---|---|---|
| 0018 | `verification_email` | `routes` |
| 0019 | `canaux_notifications` | `credit` |
| 0020 | `factures_abonnement` | `online_payment` |
| 0021 | `facturation_fournisseur` | — |

Un outil de migration applique un fichier **en fonction de son numéro et de sa date**. Deux fichiers au
même numéro = un des deux jamais appliqué selon l'ordre d'exécution, c'est-à-dire une base à moitié
migrée. Comme **leurs migrations sont déjà publiées** (et donc potentiellement appliquées quelque part),
ce sont **les miennes qui ont été renumérotées** en **0021 → 0024**, dans le même ordre :

| Ancien | Nouveau |
|---|---|
| 0018_verification_email | **0021**_verification_email |
| 0019_canaux_notifications | **0022**_canaux_notifications |
| 0020_factures_abonnement | **0023**_factures_abonnement |
| 0021_facturation_fournisseur | **0024**_facturation_fournisseur |

Les **dates de migration** (`when`, qui décident de ce qui reste à appliquer) ont été recalculées pour être
strictement postérieures aux leurs : une base qui a déjà appliqué leurs 0018→0020 applique donc bien mes
0021→0024, au lieu de les ignorer — c'est le scénario qui aurait laissé une base sans les tables de
`email_verifications` et de `subscription_invoices` (et l'application aurait échoué au démarrage).

Les **snapshots** Drizzle (utilisés pour générer les futures migrations) ont été reconstruits : leurs
tables (`vendor_routes`, `vendor_credit_terms`) et leurs colonnes ajoutées à mes snapshots, et la chaîne
`prevId` raccordée au leur. **Preuve** : `npx drizzle-kit generate` répond
**« No schema changes, nothing to migrate »** — le schéma TypeScript fusionné, les 25 migrations et les
snapshots sont exactement d'accord. (Sans ce contrôle, la prochaine migration générée aurait recréé des
tables existantes.)

## 5. Ce que la vérification a rattrapé (et qui n'était pas dans les conflits)

- **`confirm()` natif** dans `pages/vendor/Routes.tsx` (nouvel écran de leur côté) : contraire à la règle
  du chantier 11 (« aucune boîte de dialogue native »). Remplacé par la confirmation intégrée, avec une
  phrase qui explique les conséquences.
- **3 écrans d'erreur sans issue** (`Routes`, `Credit`, `Payments`) : ajout du bouton « Réessayer » sur
  les trois.
- **Imports inutilisés** après fusion (`vendorMembers`, `users` dans `routes/billing.ts`) : retirés —
  la résolution du destinataire des relevés de commission passe par `vendorBillingRecipient()` (l'équivalent
  existant), donc **aucune capacité perdue**.

## 6. Preuves d'exécution (après fusion)

| Contrôle | Résultat |
|---|---|
| `npm run verify` (lint + types + tests + build + bundle) | **exit 0** — lint 0 erreur, `tsc` API et web 0 erreur, **381 tests** (base 5 · API 309 · web 67), bundle à jour |
| `drizzle-kit generate` | « **No schema changes** » (schéma ⟷ migrations ⟷ snapshots cohérents) |
| Base **neuve** (chaîne complète 0000→0024) | migrations appliquées, restaurant de démonstration créé (844228ad…) |
| Passe complète de bout en bout (`scripts/verifications/toutes.sh`) | **507 vérifications · 12/12 scripts · exit 0** (rejouée après la fusion 2, log `/tmp/afs-e2e-fusion3.log`) |
| `chantier9_verif.py` (prévision robuste) | **40/40** après recalage de 4 attentes (voir §9) |
| `chantier11_verif.py` (règles UX du produit) | 40/40 après correction des 3 écrans (fusion 1) puis 40/40 après la fusion 2 |
| `npm run verify` | lint 0 · `tsc` API 0 · `tsc` web 0 · **397 tests** (base 5 · API 325 · web 67) · bundle à jour. *Note : l'enchaînement des 6 étapes en une seule commande est tué par le noyau (exit 137, mémoire de la machine d'essai à 2 Go) ; chaque étape passe séparément — limite d'environnement, pas un échec produit.* |
| Photos produits | 169/324 conservées (leur travail, intact) |

## 7. Contenu du premier push (tenté le 21, abouti le 22 septembre 2026 après les fusions 3 à 7)

- `origin/main..HEAD` = **13 commits** : `df5af01`, `2f2bfef`, `5b064b9`, `8db3ecc`, `d145e72`, `31caa76`,
  `f042307`, `31b58f2`, `521fea8`, `4869197`, `a3d8fb2` (fusion 1), `0a94fa0` et `b31cd86` (fusion 2).
- Différence avec `origin/main` : **165 fichiers, +44 138 / −8 474** (dont les 9 lots de photos et le
  paiement en ligne, qui sont **leur** travail : ils ne sont pas « ajoutés » par nous, ils reviennent
  simplement dans l'historique commun).
- Vérifié : `git merge-base --is-ancestor origin/main HEAD` = vrai ⇒ **fast-forward**, rien n'est écrasé.

## 8. Ce qui reste, dit franchement

- **Aucune base cliente n'existe encore** : si une base avait reçu *nos* migrations pré-fusion (bases de
  développement uniquement), elle doit être **recréée** (les migrations renommées ne sont pas idempotentes).
  La base de démonstration a été recréée pour la vérification — c'est le seul environnement concerné.
- Les snapshots intermédiaires (0021→0024) portent leurs tables dès le premier : cohérent pour la suite,
  mais un développeur qui inspecterait l'historique verrait cette simplification. Sans effet à l'exécution.
- La **preuve terrain** reste à faire : 3 restaurateurs non formés, protocole dans
  `docs/CHANTIER_12_RECETTE_TERRAIN.md`.
- Les faiblesses d'exploitation déjà listées (sauvegarde hors site, verrou multi-instance, cadence réelle
  des crons selon l'hébergeur) ne sont **pas** résolues par cette fusion.

---

## 9. Fusion 2 (le 21 septembre, après la première fusion) : un conflit de *comportement*, pas de lignes

Entre la première fusion et le push, `origin/main` a de nouveau avancé de 2 commits :
**« Chantier 1 — Le démarrage à froid »** (seuils par défaut, prévision dès le premier jour) et le
**lot 10 de photos** (169 → 179 photos sur 324). Nouvelle fusion : `origin/main` → `main`.

Cette fois les conflits étaient plus subtils que la première fois. `apps/api/src/lib/forecast.ts` avait été
modifié **des deux côtés sur le même sujet** : ma cascade de sources (chantier 9) et leur démarrage à
froid reposaient sur deux hypothèses différentes de ce qu'est une « bonne » prévision quand le restaurant
n'a **aucune donnée**. Git ne signale pas ce genre de désaccord : il aurait suffi de trancher au fil du
texte pour casser silencieusement l'un des deux apports. Trois points ont donc été tranchés explicitement,
documentés dans le code, et **arbitrés par des tests** :

| Point | Nos deux positions | Ce qui a été retenu | Pourquoi |
|---|---|---|---|
| **Confiance** | la mienne : `ventes_7j` = 45 % | **la plus prudente des deux**, mais **uniquement pour les bases reposant sur des ventes** | 1 jour de ventes saisi ne justifie pas la confiance d'une semaine écoulée. En revanche une estimation par **couverts** (30 %) ou par **seuils** (15 %) ne repose pas sur des ventes : la pénaliser n'aurait aucun sens |
| **Quantité recommandée sans aucune donnée** | la mienne : jamais plus que le seuil critique manquant | **la leur** : on complète jusqu'à l'objectif de stock du restaurant (politique s,S), plafonné à `objectif × 1,5` | Sans cela le panier intelligent reste **muet le premier jour** — précisément le jour où le restaurateur découvre l'outil. Le **besoin prévisionnel reste 0** : aucune consommation n'est inventée |
| **Explication affichée** | la mienne : source + pic + conséquence | **fusion** : « Pas encore assez de ventes pour prévoir… » d'emblée quand l'historique est vide, puis la source réelle, et la mention « (ramène le stock à votre objectif) » quand la quantité vient de l'objectif | Un chiffre sans sa raison d'être n'est pas moins dangereux qu'un chiffre inventé. Aucun « pic lundi » n'est affiché faute de données |

**Les tests ont été alignés sur ces règles, jamais l'inverse** : 3 attentes du chantier 9 réécrites (avec
la raison en commentaire), `cold-start.test.ts` conservé intégralement (9/9). Côté vérification terrain,
4 attentes de `chantier9_verif.py` ont été recalées — dont l'invariant qui protège du surstock, désormais
exprimé sur le **vrai** contrat du code : `recommandé ≤ max(manque pour le seuil critique, objectif × 1,5)`.

**Deux correctifs d'UX** apportés à leurs nouveaux écrans, au nom des règles de l'audit (et non parce
qu'ils étaient en conflit) :

- `apps/web/src/pages/Onboarding.tsx` — étape « vos seuils d'alerte » : l'échec d'enregistrement
  n'offrait **aucune issue**. Un bouton « Réessayer » (qui relance l'enregistrement sans perdre la
  saisie) a été ajouté, conformément à la règle du chantier 11.
- La même étape a été conservée telle quelle pour le reste (c'est leur apport, il fonctionne).

**Preuves après fusion 2** : `scripts/verifications/toutes.sh` → **507/507 · 12/12 · exit 0** ;
`chantier9` 40/40 ; `chantier11` 40/40 ; lint 0 ; `tsc` API et web 0 ; 397 tests verts ; bundle API
régénéré ; `drizzle-kit generate` → « No schema changes ».

---

## 10. Fusions 3 à 7 (22 septembre 2026) — jusqu'au push réel

L'historique distant a continué d'avancer pendant l'audit n°2. Cinq fusions supplémentaires ont été
nécessaires ; **aucune n'a été forcée** (`git merge` + résolution), et toutes ont été vérifiées avant push :

| Fusion | Commit | Objet | Ce qui a été tranché |
|---|---|---|---|
| 3 | `f787f3a` | leurs chantiers 2-4 distants | migrations (nôtres sur 0024-0027), routes `auth`/`billing` : union des imports |
| 4 | `2bef97c` | leur CI & exploitation | **cookie HttpOnly `afs_token`** adopté (le jeton n'est plus lisible par le JS) ; migrations → 0023-0026 ; bug `api is not defined` dans `Forecast.tsx` corrigé |
| 5 | `dea1ed7` | preuve sociale (`023 feedback.published`) | leur migration renumérotée en **0023**, les miennes décalées en 0024-0027 |
| 6 | `4a0666c` | correctif commercial distant + photos lots 14-15 | `Pricing.tsx` = mon texte honnête **+** leur nettoyage anti-promesse ; `sell.test.ts` = leur version (14 tests anti-promesse) ; journal `_journal.json` = mes 28 entrées ; snapshot dupliqué supprimé |
| 7 | `57b9e62` | photos lot 16 (**239/324**) | aucun conflit |

**Push** : `d06f172..57b9e62 main -> main`, **fast-forward**, aucun `--force`. `origin/main` = HEAD, écart 0/0.
Les deux workflows (`.github/workflows/ci.yml`, `cron-daily.yml`) sont désormais publiés.

## 11. La CI a rattrapé une régression que mes vérifications avaient manquée

C'est le point le plus instructif de ce chantier de fusion, et il mérite d'être écrit noir sur blanc.

**Fait** : après le push, la CI GitHub a échoué à l'étape « Types (un workspace à la fois) » — alors que,
en local, **lint 0 · `tsc` API 0 · `tsc` web 0 · 453 tests verts**. La contradiction était réelle : ce
n'était ni un faux positif de la CI, ni deux contrôles différents.

**Cause exacte** : `apps/web/tsconfig.json` ne contient que `{ "files": [], "references": [...] }` —
c'est un fichier de *solution*, il ne typechecke **rien**. En local je lançais `npx tsc --noEmit -p apps/web`,
donc **zéro fichier contrôlé** : le « 0 erreur » était un contrôle à vide. La CI, elle, appelle le script du
workspace (`tsc --noEmit -p tsconfig.app.json`), qui contrôle réellement tout le web.

**Ce que le contrôle réel a révélé** — une régression introduite par les fusions 4/5 et restée invisible
en production des heures durant :

```
apps/web/src/components/AppLayout.tsx(244,21) : Property 'emailVerified' does not exist on type 'User'
apps/web/src/pages/Settings.tsx(121,16)       : Property 'emailVerified' does not exist on type 'User'
apps/web/src/components/AppLayout.tsx(95,68)  : Property 'accessNotice' does not exist on type 'Ctx'
```

Pendant la fusion 4 (cookie HttpOnly), `apps/web/src/lib/auth.tsx` a été repris de la version distante ;
`AppLayout.tsx` et `Settings.tsx`, eux, restaient les miens. Résultat : le type `User` ne portait plus
`emailVerified`, et le contexte d'authentification plus `accessNotice`. Or `AppLayout` ouvrait par
`if (!user || user.emailVerified !== false) return null;` — avec `emailVerified` **absent**, l'expression
vaut toujours vrai : **l'application entière rendait un écran blanc** pour tout utilisateur connecté.

**Pourquoi aucune vérification ne l'avait vu** : les 453 tests unitaires montent les écrans directement
(ils ne passent pas par `AppLayout`), et la suite de bout en bout interroge l'**API** — le rendu HTML de
l'application connectée n'y est pas exercé. C'est exactement le trou que la CI a comblé.

**Correction** (`apps/web/src/lib/auth.tsx`, `apps/web/src/lib/api.ts`) : modèle **cookie** conservé (leur
acquis de sécurité) et les trois apports perdus rétablis — `User.emailVerified`/`emailVerifiedAt`,
`accessNotice`/`clearAccessNotice` (chantier 8), le gestionnaire d'événement `afs:access`, plus
`tokenStore.clearRestaurant()`. Le contenu de l'audit n'est pas modifié ; c'est du code qui revient.

**Leçon retenue** : ne jamais vérifier les types avec un fichier de solution. La bonne commande est
`npm run typecheck` (racine) — celle qu'utilise la CI. Elle est désormais la seule utilisée ici.
