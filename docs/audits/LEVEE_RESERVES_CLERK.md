# Levée des réserves — Clerk (chantier B)

État au 13 novembre 2026, commit `6292ccb`. Aucun secret ni aucune donnée personnelle dans ce document.

**Résumé.** Les variables Clerk de la production ne conviennent pas (clés d'instances de
développement, deux clés différentes, aucune instance de production). Le code ne dépend plus de leur
correction pour être sûr : en production, des clés de développement **coupent** la connexion Clerk.
La connexion par e-mail et mot de passe n'est pas touchée, et aucun compte de production n'est relié
à Clerk (relevé Neon : 0 sur 96). La fusion peut donc se faire **Clerk coupé en production**. Reste
à faire, avec ChatGPT : poser les bonnes clés sur la prévisualisation et y prouver une connexion réelle.

## 1. Ce que le code lit

| Variable | Lue par | Rôle | Remarque |
|---|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | le site (au build) et le serveur | Clé du site : désigne l'instance Clerk | **La seule que le site lit** |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | le serveur seulement, et seulement si la précédente est absente | Convention d'un autre outillage (Next.js) | **Inutile ici** : le site ne la lit jamais |
| `CLERK_PUBLISHABLE_KEY` | le serveur seulement, en dernier recours | idem | Inutile ici |
| `CLERK_SECRET_KEY` | le serveur | Vérifie les jetons de session, lit la fiche de la personne | Sans elle, toute connexion Clerk est refusée |
| `CLERK_JWT_KEY` | le serveur | Clé publique de l'instance : vérification sans appel réseau | Facultative |
| `CLERK_AUTHORIZED_PARTIES` | le serveur | Origines autorisées à présenter un jeton, en plus de `APP_URL` et `ALLOWED_ORIGINS` | Facultative |
| `CLERK_TIMEOUT_MS` | le serveur | Délai accordé à Clerk (8 s par défaut) | Facultative |
| `CLERK_API_URL`, `CLERK_FRONTEND_API_URL` | le serveur, **hors production uniquement** | Adresses d'un faux service, pour les tests | Ignorées en production (test) |

## 2. Relevé indépendant (communiqué par ChatGPT, non relu par l'agent)

| Constat | Conséquence avec le code de la branche |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` : clé `pk_test`, portées Production et Preview, d'une application de test **autre** qu'AFRISUPPLY | Production : connexion Clerk coupée (clé de développement). Preview : le site se brancherait sur la mauvaise application |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` : clé `pk_test`, portée Production, de l'application AFRISUPPLY de développement | Jamais lue par le site. Le serveur signale « deux clés différentes » et dit laquelle il retient |
| `CLERK_SECRET_KEY` présente, instance non identifiée | Le diagnostic (§ 4) dit de quelle instance elle est, sans l'afficher |
| Aucune instance Clerk de production | Rien à brancher en production : Clerk y reste coupé |

## 3. Ce que le code garantit désormais

Règles de `apps/api/src/lib/clerk-config.ts` (serveur) et de `apps/web/src/lib/clerk.ts` (site, au build) :

1. **Production** : avec une clé de développement (`pk_test_` ou `sk_test_`), la connexion Clerk est coupée. Le site ne charge rien de Clerk ; le serveur répond 503 à toute tentative, avant tout appel à Clerk.
2. **Prévisualisation** : les clés de l'instance de production (`pk_live_`, `sk_live_`) ne sont jamais utilisées.
3. **Partout** : une clé du site et une clé du serveur de deux sortes sont refusées.
4. Une clé du serveur qui ne ressemble pas à une clé Clerk est refusée hors développement.
5. Deux variables portant deux clés différentes, ou une clé fournie par une variable que le site ne lit pas : avertissement nommant les variables et les instances, jamais les clés.

Preuve : `apps/api/src/test/levee-reserves-config.test.ts` (22 tests) et `apps/web/src/lib/clerk.test.ts` (4 tests).
Quatre règles retirées du code une à une : chaque retrait fait échouer la suite (3, 2, 3 et 1 tests).
Rejouer : `cd apps/api && npx vitest run src/test/levee-reserves-config.test.ts`.

## 4. Lire la configuration réelle sans lire un secret

Deux lectures, disponibles sur tout déploiement de la branche :

- `GET /api/status` (public) → `checks.auth.clerk` : `{ enabled, mode, problem }`. Exemple attendu en production après fusion, variables inchangées : `{ "enabled": false, "mode": "test", "problem": "clerk_dev_instance_in_production" }`.
- `GET /api/status/config` (en-tête `Authorization: Bearer <CRON_SECRET>`) → bloc `clerk` : variable retenue, sorte de chaque clé, domaine de l'instance que désigne la clé du site, origines autorisées, et `instance.same` — **la clé du site et la clé du serveur appartiennent-elles à la même instance ?** (`true`, `false`, ou `null` si la comparaison est impossible). La comparaison se fait sur l'identifiant d'instance publié par Clerk des deux côtés ; aucune clé ne sort.

## 5. Matrice

| Environnement | Application / instance attendue | Variable | État constaté | Statut | Preuve |
|---|---|---|---|---|---|
| Production | Aucune tant qu'une instance de production n'existe pas | `VITE_CLERK_PUBLISHABLE_KEY` | `pk_test`, autre application | Neutralisée par le code ; à retirer de la portée Production | Tests ; `checks.auth.clerk` après déploiement |
| Production | — | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test`, AFRISUPPLY développement | Inutile ; à retirer | Lecture du code (§ 1) |
| Production | — | `CLERK_SECRET_KEY` | présente, instance inconnue | À identifier ; si `sk_test` : neutralisée par le code | Diagnostic |
| Prévisualisation | AFRISUPPLY, instance de développement | `VITE_CLERK_PUBLISHABLE_KEY` | même valeur qu'en production : autre application | **EN ATTENTE CLERK** : à remplacer, portée Preview | Diagnostic : `clerk.site.frontendApi` |
| Prévisualisation | AFRISUPPLY, instance de développement | `CLERK_SECRET_KEY` | portée inconnue | **EN ATTENTE CLERK** : même instance, portée Preview | Diagnostic : `clerk.instance.same = true` |
| Développement, intégration continue | Faux service local | — | simulé | Conforme | 22 + 22 tests |

## 6. Les douze points de la mission

| # | Point | État | Preuve ou suite |
|---|---|---|---|
| 1 | Variables consommées | Fait | § 1 |
| 2 | Variables inutilisées | Fait : `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY` | § 1 ; retrait dans Vercel : fiche CLERK-02 |
| 3 | Instance attendue par environnement | Fait | § 5 |
| 4 | Vérifier les clés sans les afficher | Outil livré | § 4 |
| 5 | Clés de la même instance | Outil livré ; lecture réelle **EN ATTENTE CLERK** | `clerk.instance.same` sur la prévisualisation |
| 6 | Production sans clé de développement | Fait, par le code | Tests § 3 |
| 7 | Prévisualisation sans identifiants de production | Fait, par le code | Tests § 3 |
| 8 | Domaines, redirections, origines | Côté serveur : fait (origine du jeton exigée et contrôlée). Côté tableau de bord Clerk : **EN ATTENTE CLERK** | `clerk-sync.test.ts` ; fiche CLERK-02 |
| 9 | Validation réelle des sessions | Code prouvé contre un **faux** service. Essai réel : **EN ATTENTE CLERK** | Connexion d'essai sur la prévisualisation |
| 10 | Identité Clerk ↔ compte métier | Fait | `clerk-sync.test.ts` (22 tests) |
| 11 | Confirmation d'adresse | Fait : adresse vérifiée exigée chez Clerk **et** dans AFRISUPPLY pour relier un compte existant | Idem. En production, 0 adresse confirmée : aucun compte existant ne peut être relié sans confirmation préalable — voulu |
| 12 | Clerk indisponible | Fait : 503 en 8 s au plus, aucune session ouverte, connexion par mot de passe intacte | Tests « panne » et « silence » |

## 7. Fiche d'intervention CLERK-02 — pour ChatGPT et le titulaire

| | |
|---|---|
| Objet | Identifier les deux applications Clerk, poser les bonnes clés sur la prévisualisation, prouver une connexion réelle |
| Nature | Lectures, puis réglages de variables **en portée Preview uniquement** |
| Préalable | La prévisualisation a sa base (`PREVIEW_DATABASE_URL`) et son `JWT_SECRET` — fiche VERCEL-02 |

**Lectures (tableau de bord Clerk, aucune modification)**

1. Pour chacune des deux applications : son nom, et le domaine affiché à « API keys → Frontend API URL » (`….clerk.accounts.dev`). Ce domaine n'est pas un secret.
2. Application AFRISUPPLY : « User & authentication → Email » — la vérification à l'inscription est-elle activée ? Combien de comptes ?
3. Existe-t-il une instance « Production » ? (attendu : non)

**Réglages (Vercel, portée Preview uniquement)**

4. `VITE_CLERK_PUBLISHABLE_KEY` (Preview) = clé du site de l'application AFRISUPPLY, instance de développement.
5. `CLERK_SECRET_KEY` (Preview) = clé du serveur de la **même** application. À copier de Clerk vers Vercel directement, sans passer par une conversation.
6. Relancer le déploiement de prévisualisation.

**Preuves attendues**

7. `GET <prévisualisation>/api/status` → `checks.auth.clerk` = `{ "enabled": true, "mode": "test", "problem": null }`.
8. `GET <prévisualisation>/api/status/config` → `clerk.site.frontendApi` = le domaine relevé au point 1 pour AFRISUPPLY, et `clerk.instance.same` = `true`.
9. Une connexion d'essai par Clerk sur la prévisualisation, avec une adresse de test : elle ouvre un espace ; une seconde tentative depuis une autre origine est refusée.

**Sur la production — décision à confirmer par le titulaire**

- Retirer `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (inutile) et la portée Production de `VITE_CLERK_PUBLISHABLE_KEY` et de `CLERK_SECRET_KEY`. Sans effet sur le service : le code coupe déjà Clerk en production avec ces clés. C'est une mise au propre, pas un préalable à la fusion.
- Ouvrir Clerk en production demandera une instance de production. À vérifier auprès de Clerk : elle exige un nom de domaine dont la société maîtrise les enregistrements DNS, ce que l'adresse actuelle en `vercel.app` ne permet vraisemblablement pas.

**Interdits** : créer une instance de production sans décision du titulaire ; copier une clé dans une conversation ou dans le dépôt ; modifier une variable de portée Production sans décision explicite.
