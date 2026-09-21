# RAPPORT — CHANTIER 2 : SÉCURISER AVANT TOUT ACCÈS EXTÉRIEUR

**Date :** 21 septembre 2026
**Périmètre :** authentification, sessions, mots de passe, rôles et permissions, cloisonnement entre restaurants, CORS, configuration de production, dépendances.
**Règle tenue :** chaque point ci-dessous est prouvé par une exécution réelle (test automatisé ou appel HTTP sur l'API qui tourne). Aucun « c'est fait » sans preuve.

---

## ✅ CORRIGÉ (avec la preuve)

| # | Gravité | Problème constaté à l'audit | Correction | Preuve d'exécution |
|---|---|---|---|---|
| 1 | 🔴 | **Identifiants de démonstration pré-remplis** sur l'écran de connexion (`awa@chezawa.fr` / `demo1234`) : n'importe qui ouvrant le site en production entrait dans le compte démo. | Champs vides. Le bouton de démonstration n'apparaît que si `VITE_DEMO_LOGIN` est défini **au moment du build** (jamais en production). | `Login.tsx` relu ; build web repassé sans la variable → aucun identifiant dans le bundle. |
| 2 | 🔴 | **Seed de démonstration actif par défaut** : un déploiement en production créait un compte public. | Refus explicite en production, sauf `ALLOW_DEMO_SEED=true`. `.env.example` passe `SEED_DEMO=false` + `ALLOW_DEMO_SEED=false`. | Exécution réelle : `NODE_ENV=production SEED_DEMO=true` → *« Seed de démonstration refusé en production (compte awa@chezawa.fr / demo1234 accessible publiquement) »*, base intacte. |
| 3 | 🔴 | **Impossible de réinitialiser un mot de passe** (le mot de passe oublié = compte perdu). | Flux complet : demande par e-mail → lien à usage unique (1 h) → nouveau mot de passe. Politique : 8 caractères minimum + mots de passe courants refusés. Aucune fuite d'information sur l'existence d'un compte. | `audit/chantier2_verif.py` : compte inconnu → réponse strictement identique ; compte connu → lien ; réinitialisation OK. |
| 4 | 🔴 | **Session de 30 jours non révocable** : un jeton volé donnait 30 jours d'accès, même après changement de mot de passe. | `users.token_version` revérifié en base à chaque requête. Le changement de mot de passe révoque les autres appareils ; « Déconnecter tous mes appareils » coupe tout immédiatement. | Appels HTTP : ancien jeton → `401 session_revoked` après réinitialisation, après changement de mot de passe et après déconnexion globale. |
| 5 | 🔴 | **Démarrage en production sans garde-fou** : on pouvait lancer l'app avec le secret JWT de développement et sans base de données (données perdues à chaque déploiement). | `enforceSecureConfig()` refuse le démarrage ; Vercel avertit au démarrage à froid. | Exécution réelle : `NODE_ENV=production` avec secret de dev → *« 🛑 Démarrage refusé — configuration non sûre »* (JWT_SECRET + DATABASE_URL), aucun port ouvert. |
| 6 | 🟠 | **CORS reflétait toute origine** avec `credentials: true` : n'importe quel site pouvait appeler l'API avec les cookies de la victime. | Liste blanche (`ALLOWED_ORIGINS` + `APP_URL`, plus `localhost` en développement). | Origine `https://attaquant.example` → **aucun** en-tête CORS ; origine autorisée → en-tête limité à cette origine. Jamais `*`. |
| 7 | 🟠 | **Les rôles `owner` / `manager` / `staff` existaient en base mais n'étaient jamais vérifiés** : tout membre pouvait tout faire. | `requireMinRole()` appliqué sur 25 routes. Employé = stock, réception, ventes, saisie express, listes. Responsable = fournisseurs, offres, recettes, commandes, réglages, export. Propriétaire = membres, abonnement, suppression de compte. | Employé → `403 role_required` sur fournisseur, réglages et paiement ; l'accès au stock reste `200`. Responsable accepté sur les achats. |
| 8 | 🟠 | **Impossible d'inviter un employé** : l'équipe partageait un seul compte. | `GET/POST/PATCH/DELETE /api/members` + page « Équipe & sécurité » : invitation par lien (7 jours), changement de rôle, retrait. | Invitation → l'employé choisit son mot de passe → connexion ; double invitation refusée (409) ; membre retiré → accès coupé (`401`). |
| 9 | 🟠 | **Le dernier propriétaire pouvait se rétrograder ou se retirer** : compte définitivement bloqué. | Garde-fou serveur : rétrogradation/retrait du dernier propriétaire refusés (409) avec un message actionnable. | `409` sur les deux appels, avec message compréhensible pour un restaurateur. |
| 10 | 🟡 | **BUG-5** — une URL inexistante répondait `401` (fuite d'information, confusion) au lieu de `404`. | Registre des routes connues : `404 « Route inconnue »` uniquement pour de vraies inconnues ; `401` conservé sur les routes réelles non authentifiées. | `GET /api/inconnu` → `404` ; `GET /api/dashboard` sans jeton → `401`. |
| 11 | 🟡 | **BUG-6** — `GET /compare/:productId` laissait un restaurant lire **le nom du produit privé d'un concurrent**. | Cloisonnement : un produit privé n'existe que pour son restaurant (le référentiel AFRISUPPLY reste partagé) → `404` pour les autres. | `scenario_tests.py` 49/49 : *« un autre restaurant ne peut PAS lire un produit privé tiers — HTTP 404 »* + test automatisé dédié (produit privé → 404 pour B, 200 pour A, référentiel → 200 pour tous). |
| 12 | 🟡 | **Dépendance `xlsx`** (faille haute, aucun correctif disponible) installée dans l'application web. | Retirée : import **CSV uniquement**, message explicite pour les fichiers `.xlsx` (« Enregistrer sous CSV »). | `npm audit` ne remonte plus `xlsx` ; `CatalogImport.tsx` relu. |
| 13 | 🟡 | **10 vulnérabilités npm** dont 1 critique et 3 hautes (drizzle-orm SQL injection, vitest critique, vite/esbuild). | Montées de version : drizzle-orm 0.45.2, vitest 4.1.11, vite 8 + plugin-react 6. | `npm audit` → **4 vulnérabilités modérées**, toutes dans l'outil de migration (développement uniquement, jamais déployé). |
| 14 | 🟡 | **Limitation de débit trop étroite** et aucune protection sur les routes de mot de passe. | Limites par IP : connexion 10/min, inscription 5/min, mot de passe oublié 5/15 min, réinitialisation 10/15 min, changement 10/15 min, déconnexion globale 20/15 min, leads 5/min. `Cache-Control: no-store` sur toute l'API, `X-Content-Type-Options: nosniff`. | 14 tentatives de connexion rapides → `401` puis **`429`** (blocage effectif). En-têtes vérifiés en direct. |
| 15 | 🟡 | **Interface incohérente avec les droits** : un employé voyait des écrans qui répondraient `403`. | Menu filtré selon le rôle + mention « Connecté·e comme Employé / Responsable / Propriétaire ». | `AppLayout.tsx` : navigation par rôle, `typecheck` vert, build web OK. |

**Bug découvert par les tests pendant le chantier (et corrigé) :** le jeton délivré après une réinitialisation de mot de passe ou une connexion ne portait pas la version de session (`tokenVersion`) — l'utilisateur aurait été déconnecté immédiatement après avoir changé son mot de passe. Détecté par `security.test.ts` (5 échecs), corrigé, revérifié.

---

## 📁 FICHIERS

**Créés**
- `apps/api/src/lib/security.ts` — configuration de démarrage sûre, liste blanche CORS, politique de mot de passe, registre des routes connues, hiérarchie des rôles.
- `apps/api/src/lib/reset-link.ts` — émission des liens de réinitialisation / d'invitation (jeton haché en base, usage unique, 1 h).
- `apps/api/src/routes/members.ts` — équipe : liste, invitation, changement de rôle, retrait, protections.
- `apps/api/src/test/security.test.ts` — 23 tests (config, CORS, mots de passe, sessions, rôles, cloisonnement).
- `apps/web/src/pages/Forgot.tsx`, `apps/web/src/pages/Reset.tsx`, `apps/web/src/pages/Team.tsx` — « Mot de passe oublié », « Réinitialiser / bienvenue », « Équipe & sécurité ».
- `packages/db/drizzle/0013_password_resets.sql` (+ `meta/0013_snapshot.json`) — `users.token_version` et table `password_resets`.
- `audit/chantier2_verif.py` — 41 vérifications HTTP du chantier 2, rejouables.

**Modifiés (principaux)**
- API : `app.ts` (CORS, `no-store`, limites, routes connues), `lib/auth.ts` (`tokenVersion`, 404, 401 explicites, `requireMinRole`), `lib/ops.ts`, `routes/auth.ts` (politique, oubli, réinitialisation, changement, déconnexion globale), `routes/{manage,restaurant,marketplace,billing,jobs,account}.ts` (rôles par route, cloisonnement `compare`), `server.ts` + `api/_src/index.ts` (garde de configuration).
- Web : `Login.tsx`, `App.tsx` (nouvelles routes), `AppLayout.tsx` (menu par rôle), `Settings.tsx`, `pages/Orders.tsx`, `pages/vendor/CatalogImport.tsx`, `lib/api.ts`.
- Données : `packages/db/src/schema.ts`, `src/seed.ts`, `src/index.ts`.
- Configuration : `.env.example` (secret JWT à générer, `SEED_DEMO=false`, `ALLOW_DEMO_SEED=false`, `ALLOWED_ORIGINS`, `TRUST_PROXY`, `AUTH_TOKEN_TTL`, `PASSWORD_MIN_LENGTH`, `PASSWORD_RESET_TTL_MINUTES`).

---

## 🔧 FONCTIONNALITÉS (ce qu'un restaurateur peut faire aujourd'hui qu'il ne pouvait pas hier)

1. **Créer un vrai compte d'équipe** : inviter le gérant ou le cuisinier par e-mail, chacun avec son mot de passe, sans partager ses identifiants.
2. **Choisir qui peut quoi** : l'employé saisit les réceptions et les ventes ; seul le responsable commande et modifie les fournisseurs ; seul le propriétaire touche à l'abonnement et à l'équipe.
3. **Récupérer un compte perdu** : « Mot de passe oublié ? » → lien reçu par e-mail → nouveau mot de passe (les anciens appareils sont déconnectés).
4. **Reprendre la main en cas de doute** : changer son mot de passe déconnecte les autres appareils ; « Déconnecter tous mes appareils » coupe tout.
5. **Travailler sans risque de confusion** : les écrans proposés correspondent aux droits réels ; une action interdite répond un message clair (« Action réservée au responsable… ») et non une erreur technique.
6. **Confidentialité entre restaurants** : le catalogue privé d'un restaurant (produits, prix, fournisseurs) n'est plus visible depuis un autre compte.

---

## 🧪 TESTS & PREUVES (tout a été exécuté)

| Vérification | Résultat |
|---|---|
| Tests API (`apps/api`) | **145/145** (20 fichiers) — dont les 23 nouveaux tests de sécurité |
| Tests base de données (`packages/db`) | **5/5** |
| Vérification de types (3 espaces de travail) | **3/3 verts** (exécutés séparément : sur cette machine 2 Go, un `tsc` groupé peut être tué par manque de mémoire — sans incidence sur le code) |
| Build de l'application web | **OK** (215 kB, 70,8 kB gzip) |
| `audit/chantier1_verif.py` (non-régression réception/statuts) | **23/23** |
| `audit/scenario_tests.py` (6 scénarios métier + sécurité) | **49/49** |
| `audit/edge_tests.py` (cas limites, rôles, limitation de débit) | **OK** — employé refusé (403) sur fournisseur/réglages/paiement, dernier propriétaire protégé (409), blocage `429` obtenu |
| `audit/market2.py` (parcours marketplace complet) | **OK** — jusqu'à la réception 90 % + commission |
| `audit/chantier2_verif.py` (nouveau) | **41/41** |
| Gardes de production (démarrage + seed) | **Refus effectif** dans les deux cas |
| `npm audit` | **4 modérées**, développement uniquement (outil de migration) |

---

## ⚠️ RESTANT / LIMITES ASSUMÉES

1. **Jeton de session encore conservé dans le navigateur** (`localStorage`) alors que l'API délivre déjà un cookie `httpOnly`. Le risque XSS résiduel doit être supprimé en basculant l'application web sur le cookie seul — **prévu au chantier de durcissement suivant**, à ne pas laisser traîner après l'ouverture publique.
2. **4 vulnérabilités modérées** restent dans la chaîne `drizzle-kit` → `@esbuild-kit/esm-loader` → `esbuild` : outil de génération de migrations, **jamais exécuté en production** ; aucun correctif sans casser l'outil.
3. **Envoi d'e-mails** : sans `RESEND_API_KEY`, les liens sont écrits dans `.outbox` (fichier) et renvoyés dans la réponse en développement. Avant un pilote réel, la clé Resend doit être configurée, sinon aucun restaurateur ne recevra son lien.
4. **Base de démonstration** : le répertoire PGlite de développement a été corrompu par un arrêt brutal de l'API ; une base neuve a été régénérée (données de test perdues — ce qui était de toute façon souhaité) et une sauvegarde a été conservée. Les instances d'audit tournent désormais sur une base séparée pour ne plus polluer la démo.
5. **`drizzle-kit` rétrogradé** de 0.31.10 à 0.30.6 : la 0.31 refuse de générer avec `drizzle-orm` 0.45 (« Please install latest version of drizzle-orm »). La génération fonctionne à nouveau et confirme que le schéma et les migrations sont synchronisés.
6. **`AUTO_MIGRATE=true` reste la valeur de `.env.example`** : acceptable en développement, à vérifier lors du déploiement (les migrations tournent au build Vercel ; `SKIP_MIGRATE=1` pour les désactiver).
7. **BUG-7 toujours ouvert** : à la réception, le prix réellement facturé n'est pas enregistré → l'historique de prix reste plat et l'alerte de hausse ne se déclenche pas. C'est le cœur du chantier suivant.
8. **Aucun commit n'a été fait** (chantiers 1 et 2 en attente : 39 fichiers modifiés, 15 nouveaux). Je peux commiter sur demande, en un ou deux commits clairs.

---

## ➡️ SUIVANT — CHANTIER 3 PROPOSÉ

**« Prix réellement facturé et détection de la hausse de prix » (chantier 3 de la feuille de route).**
- Problème : la réception enregistre le prix commandé, pas le prix facturé — donc la promesse « je vous préviens quand vos prix montent » n'est pas tenue par les données.
- Actions : champ « prix facturé » optionnel à la réception, écriture de l'historique de prix (`source = facture`), rapprochement prix commandé / facturé, alerte « surfacturation » chiffrée en euros, mise à jour de l'offre au dernier prix réellement payé.
- Critères de validation : réception à 46 € au lieu de 42 € → alerte + historique + montant d'écart ; réception sans prix facturé → comportement inchangé (non-régression).

**En attente de votre validation pour démarrer le chantier 3.**
