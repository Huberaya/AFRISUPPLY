# Fiche d'intervention VERCEL-01 — Variables, portées, prévisualisation, région

| | |
|---|---|
| Chantiers | P0.4 (production et Vercel), P0.2 (secret de session) |
| Nature | Constat dans le tableau de bord Vercel, puis (sur décision) réglages de variables |
| Qui | Le titulaire du compte Vercel, accompagné par ChatGPT |
| Durée | 15 minutes pour le constat |
| État | À réaliser — rien de ce qui suit n'a été exécuté |

## Pourquoi l'agent ne le fait pas lui-même

Le connecteur Vercel de l'agent est authentifié mais **sans portée d'équipe ni de projet** : la liste
des équipes est vide et toute lecture de projet, de variable, de déploiement ou de journal répond
« Access denied » (constaté les 11 et 12 novembre 2026). L'agent ne voit Vercel qu'à travers GitHub
(déploiements et statuts publiés sur le dépôt) et à travers les réponses publiques du site.
Pour lever ce blocage : donner au connecteur un jeton dont la portée couvre l'équipe et les projets
`afrisupply` et `afrisupply-api`.

## Ce qu'on cherche à établir

1. Les variables définies, **par environnement** (Production / Preview / Development) — les noms, jamais les valeurs.
2. L'existence et la longueur de `JWT_SECRET` en Production (32 caractères minimum).
3. Si les prévisualisations reçoivent aujourd'hui les variables de production (base, e-mail, paiement).
4. La région des fonctions, à comparer à la région Neon (fiche NEON-01).
5. Le rôle de chacun des deux projets Vercel reliés au dépôt, et lequel sert l'adresse de production.

## Opérations — constat (lecture seule), pour chacun des deux projets

| # | Où | Quoi relever |
|---|---|---|
| V1 | Project → Settings → Environment Variables | Pour chaque variable : son nom et les environnements cochés. Ne relever aucune valeur |
| V2 | même écran, `JWT_SECRET` | Présente en Production ? Longueur (afficher la valeur pour compter, ne pas la copier) |
| V3 | même écran, `DATABASE_URL` | Cochée pour Preview ? (la documentation du dépôt demandait « Production + Preview ») |
| V4 | même écran | Présence de `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `APP_URL`, `ADMIN_EMAILS`, `CRON_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, `SEED_DEMO`, `ALLOW_INSECURE_CONFIG`, `VENDOR_AUTO_APPROVE` |
| V5 | Project → Settings → Functions | Région des fonctions (ex. `iad1`), durée maximale, plan (Hobby : 60 s) |
| V6 | Project → Settings → Deployment Protection | Les prévisualisations sont-elles protégées (« Vercel Authentication ») ? |
| V7 | Project → Settings → Git | Dépôt relié, branche de production, « Ignored Build Step » |
| V8 | Project → Settings → Domains | Domaines servis par ce projet |
| V9 | Project → Cron Jobs | Tâches listées et dernier résultat de chacune |
| V10 | Project → Logs, filtre `/api/jobs/daily`, 7 derniers jours | Code de réponse et durée ; présence de « Task timed out » |
| V11 | `DATABASE_URL` (Production) : **le nom d'hôte seulement**, entre `@` et `/` | La région qu'il contient (ex. `….eu-central-1.aws.neon.tech` → `eu-central-1`). Ne relever ni l'identifiant ni le mot de passe |
| V12 | Project → Settings → Environment Variables | Présence de `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (copie des sauvegardes hors de la plateforme) |
| V13 | Project → Settings → General (ou Billing) | Offre de l'équipe (Hobby, Pro) : elle fixe la durée maximale d'une fonction et la fréquence des tâches planifiées |

## La région des fonctions : un réglage, un effet sur toute l'application

Mesuré le 2026-11-12 sur la page de statut publique de la production : fonctions en `iad1` (côte est
des États-Unis), et **environ 96 ms par requête SQL**, de façon stable. C'est le temps d'un
aller-retour entre deux continents ; dans une même région, ce chiffre est de 1 à 5 ms.

Conséquences mesurées (`preuves/P0_4_passe_quotidienne.txt`) :

- un écran qui fait quinze requêtes SQL attend une seconde et demie rien que pour la distance ;
- la passe quotidienne fait environ 115 requêtes par restaurant, soit 11 secondes : au-delà de cinq
  restaurants elle ne tient plus dans les 60 secondes d'une fonction. Aucune passe complète n'est
  enregistrée en production depuis le 2026-09-23.

La branche de correction découpe la passe en tranches et la reprend : elle se terminera même avec
cette latence. Mais la cause de fond se règle ici, en une ligne.

| Si V11 montre… | Région de fonctions à choisir |
|---|---|
| `eu-central-1` (Francfort) | `fra1` |
| `eu-west-2` (Londres) | `lhr1` |
| `us-east-1` | `iad1` (déjà le cas : chercher la cause ailleurs) |
| `us-east-2` | `cle1` |

Deux façons de faire, au choix (une seule suffit) :

1. dans le dépôt : ajouter `"regions": ["fra1"]` à `vercel.json` — l'agent le fait dans la branche dès
   que la région de la base est confirmée (V11), et le changement passe par la demande de fusion ;
2. dans Vercel : Project → Settings → Functions → Function Region.

Après le déploiement suivant, la branche de correction rend le résultat lisible sans aucun accès :
`GET /api/status` → `checks.database.latencyMs` (un aller-retour, connexion déjà ouverte) et
`checks.database.colocated` (`true` quand les fonctions sont dans la région de la base). Tant que les
régions diffèrent, un avertissement `[config]` le dit dans les journaux de la fonction et dans l'écran
« Exploitation » du back-office, avec la région conseillée.

## Les tâches planifiées après la fusion

| Déclencheur | Où | Rôle après la fusion |
|---|---|---|
| Cron `/api/jobs/daily` (04:30 UTC) | `vercel.json` | Démarre la passe du jour. Si elle ne tient pas dans une invocation, l'API lance elle-même la suite |
| Cron `/api/jobs/reminders` (14:00 UTC) | `vercel.json` | Rappels aux grossistes, alertes urgentes — et reprise d'une passe du jour restée inachevée |
| Workflow « Daily digest » (04:45 UTC) | GitHub Actions | Facultatif. Rappelle `/api/jobs/daily` jusqu'à la fin de la passe ; échoue (et GitHub prévient) si elle ne se termine pas. Aujourd'hui non configuré : il ne lance rien et le dit |

Pour activer le workflow (recommandé pendant le pilote : c'est le seul déclencheur qui prévient par
e-mail quand la passe ne se termine pas) : GitHub → dépôt → Settings → Secrets and variables → Actions
→ créer `API_URL` (adresse publique du site, sans barre finale) et `CRON_SECRET` (la même valeur que
dans Vercel — à copier de Vercel vers GitHub directement, sans passer par une conversation).

## Ce que la branche de correction change, et ce qu'il faut vérifier avant de la fusionner

| Comportement de la branche | Conséquence | À vérifier avant fusion |
|---|---|---|
| En production, `JWT_SECRET` absent, court ou d'exemple → l'API répond 503 partout | Si V2 montre un secret absent ou court, **la production s'arrêterait** au déploiement | V2 conforme, sinon poser un secret de 32 caractères aléatoires d'abord |
| Les droits d'exploitant exigent une adresse confirmée | L'exploitant perd ses écrans d'administration tant que son adresse n'est pas confirmée | Requête Q10 de NEON-01 ; sinon confirmer l'adresse après déploiement (lien « renvoyer la confirmation ») |
| Le build de production contrôle l'état des migrations et échoue si la base est en retard | Aucune migration nouvelle dans cette branche : le contrôle passe si la base est à 29 migrations | Requête Q2 de NEON-01 |
| Une prévisualisation n'utilise que `PREVIEW_DATABASE_URL` | Tant qu'elle n'existe pas, l'API de prévisualisation répond 503 (le site statique s'affiche) | Créer la base de prévisualisation (fiche NEON-02), puis poser la variable en portée Preview |
| Sans `VITE_CLERK_PUBLISHABLE_KEY` au build, la connexion Clerk n'est plus proposée | Si la production comptait sur la clé de test écrite dans le code, le bouton Clerk disparaît | V4 et fiche CLERK-01 |
| Déconnexion = révocation des sessions du compte | Se déconnecter sur un appareil déconnecte les autres appareils du même compte | Décision de produit à confirmer |

## Opérations — réglages (uniquement après décision explicite)

1. Retirer la portée **Preview** de `DATABASE_URL` et de toute variable qui désigne une ressource de
   production (clé d'envoi d'e-mails, clé de paiement réelle, stockage des sauvegardes).
2. Créer, en portée **Preview** uniquement : `PREVIEW_DATABASE_URL` (base dédiée, fiche NEON-02),
   `MIGRATE_ON_BUILD=apply` (le build de prévisualisation aligne alors SA base, jamais celle de
   production), un `JWT_SECRET` différent de celui de la production, `APP_URL` si l'on veut tester Clerk.
3. Si la région des fonctions n'est pas celle de la base : la rapprocher (voir « La région des
   fonctions » ci-dessus).
4. Sauvegardes : sur la plateforme, le disque d'une fonction disparaît avec elle. Sans les variables
   `BACKUP_S3_*` (V12), **aucune sauvegarde applicative n'est conservée** — la page de statut de la
   production indique aujourd'hui « 0 fichier ». La seule protection des données est alors celle de
   Neon (fiche NEON-01, Q13). Pour une copie indépendante : créer un espace de stockage compatible S3
   et poser les quatre variables en portée Production (procédure : `docs/SAUVEGARDE_HORS_SITE.md`).

## Risques

- Retirer une variable de la portée Production par erreur arrête le service au déploiement suivant.
  Ne modifier que la portée **Preview** dans le point 1.
- Changer la région des fonctions s'applique au déploiement suivant : à faire en dehors d'un
  déploiement de correction, et à vérifier par `GET /api/status` (`checks.database.latencyMs`).

## Opérations interdites

- Copier la valeur d'une variable dans une conversation, un ticket ou le dépôt.
- Modifier ou supprimer une variable de portée Production sans décision explicite.
- Déclencher un déploiement de production, changer un domaine ou la branche de production.

## Preuves attendues en retour

Le tableau V1 (noms et portées), les réponses V2 à V13. Aucune valeur de variable.

## Comment le résultat sera vérifié

- Prévisualisation sans base : `GET <adresse de prévisualisation>/api/health` → 503,
  `{"ok":false,"db":"aucune","config":"a_corriger","env":"preview"}`.
- Prévisualisation avec base dédiée : même adresse → 200, `"db":"neon"`, `"env":"preview"` ;
  `GET /api/status` → `checks.schema.state`.
- Production après déploiement : `GET /api/health` → 200 `"config":"ok"` ; `GET /api/status` →
  `checks.schema` = `a_jour`, 29/29.
- Région : `GET /api/status` → `checks.database.colocated` = `true` et `latencyMs` inférieur à 10.
- Passe quotidienne, le lendemain matin : `GET /api/status` → `checks.jobs.daily.state` = `ok`,
  `lastRun.finishedAt` du jour. Le détail (nombre de tranches, durée par restaurant) est dans
  `GET /api/status/jobs` (secret des tâches planifiées) et dans l'écran « Exploitation ».
