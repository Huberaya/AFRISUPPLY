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
3. Si la région des fonctions n'est pas celle de la base : la rapprocher (une fonction aux États-Unis
   et une base en Europe ajoutent un aller-retour transatlantique à chaque requête SQL).

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

Le tableau V1 (noms et portées), les réponses V2 à V10. Aucune valeur de variable.

## Comment le résultat sera vérifié

- Prévisualisation sans base : `GET <adresse de prévisualisation>/api/health` → 503,
  `{"ok":false,"db":"aucune","config":"a_corriger","env":"preview"}`.
- Prévisualisation avec base dédiée : même adresse → 200, `"db":"neon"`, `"env":"preview"` ;
  `GET /api/status` → `checks.schema.state`.
- Production après déploiement : `GET /api/health` → 200 `"config":"ok"` ; `GET /api/status` →
  `checks.schema` = `a_jour`, 29/29.
