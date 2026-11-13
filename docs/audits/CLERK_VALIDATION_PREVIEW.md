# Clerk : production coupée, prévisualisation à valider (chantier P0-F)

13 novembre 2026. Aucune clé dans ce document.

## 1. État connu (relevé indépendant)

Instance AFRISUPPLY de développement : zéro utilisateur, aucune méthode de connexion activée. Aucune
instance de production. Décision proposée et retenue pour cette fusion : **Clerk coupé en production**.

## 2. Ce qui est vérifié par le code

| # | Vérification | Résultat | Preuve | Statut de preuve |
|---|---|---|---|---|
| 1 | La connexion par mot de passe ne dépend pas de Clerk | Tout le parcours du navigateur (140 vérifications) se fait sans aucune clé Clerk | `preuves/parcours_navigateur_final.txt` | test automatisé |
| 2 | Clerk coupé ne bloque aucun écran ni aucune API | 22 écrans de l'espace client affichés, 469 appels à l'API, aucune erreur serveur | idem | test automatisé |
| 3 | Le serveur répond 503 aux tentatives Clerk quand les clés ne conviennent pas ; 401 sans jeton | `clerk_dev_instance_in_production` (503), `clerk_token_required` (401) | `levee-reserves-config.test.ts`, parcours 13 bis | test automatisé |
| 4 | Le site ne demande rien à Clerk quand l'intégration est coupée | Pendant tout le parcours, zéro requête du navigateur vers un domaine de Clerk | parcours 13 bis | test automatisé |
| 5 | Aucun repli d'identité | Une identité envoyée dans le corps n'ouvre rien ; un jeton Clerk présenté à une route protégée est refusé | `clerk-sync.test.ts` | test automatisé |
| 6 | Cohérence clé du site / clé du serveur | Deux sortes différentes : refus ; même instance ou non : dit par le diagnostic | `levee-reserves-config.test.ts` | test automatisé (Clerk simulé) |

Limite du point 4 : le code de la bibliothèque Clerk reste présent dans le paquet JavaScript du site
(il est importé par les pages de connexion) ; il n'est ni initialisé ni mis en relation avec Clerk.

## 3. Ce qui reste à faire sur la prévisualisation — EN ATTENTE EXTERNE

| # | Geste | Qui | Preuve attendue |
|---|---|---|---|
| 7 | `VITE_CLERK_PUBLISHABLE_KEY` et `CLERK_SECRET_KEY` de l'application AFRISUPPLY de développement, portée Preview uniquement | ChatGPT et titulaire | `GET /api/status` → `checks.auth.clerk = { enabled: true, mode: "test", problem: null }` |
| 8 | Dans l'instance de développement : activer une méthode de connexion (adresse e-mail, avec mot de passe ou code — au choix du titulaire) | Titulaire | Le formulaire Clerk propose cette méthode |
| 9 | Activer la vérification de l'adresse à l'inscription | Titulaire, après validation | Une inscription d'essai exige le code reçu |
| 10 | Connexion réelle d'essai, puis tentative depuis une autre origine | ChatGPT | Session ouverte ; `GET /api/status/config` → `clerk.instance.same = true` ; l'autre origine reçoit 401 `clerk_origin_refused` |

## 4. Critères de sortie

| Critère | État |
|---|---|
| Production : Clerk désactivé de façon sûre | **Rempli par le code** — à constater après déploiement sur `/api/status` |
| Connexion par mot de passe toujours fonctionnelle | **Rempli** (test automatisé) |
| Preview : clés de la même instance, `clerk.instance.same = true` | EN ATTENTE EXTERNE |
| Connexion réelle testée, origine non autorisée refusée | EN ATTENTE EXTERNE (prouvé contre un faux service seulement) |
