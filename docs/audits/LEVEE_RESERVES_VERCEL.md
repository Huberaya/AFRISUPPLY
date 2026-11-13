# Levée des réserves — Vercel (chantier D)

État au 13 novembre 2026, commit `6292ccb`. Aucun secret ni aucune donnée personnelle dans ce document.

**Résumé.** L'agent ne peut toujours pas lire le projet Vercel : le connecteur s'authentifie, mais
tout appel sur un projet, une variable, un déploiement ou un journal répond « Access denied » (jeton
limité, sans équipe). Ce qui suit distingue donc ce qui est **prouvé par le code**, ce qui est **lu
de l'extérieur** (GitHub, pages publiques) et ce qui **reste à lire** par ChatGPT (fiche VERCEL-02).
Pour que ces lectures n'exigent plus d'afficher un secret, la branche fournit un diagnostic que
l'application établit elle-même (§ 2). Un fait nouveau bloque les prévisualisations : **le quota de
déploiements du compte est atteint** (§ 6).

## 1. Accès de l'agent

| Moyen | Ce qu'il donne | État |
|---|---|---|
| Connecteur Vercel | Variables, journaux, tâches planifiées, déploiements | **Refusé** : liste d'équipes vide, « Access denied » avec et sans identifiant d'équipe (13 novembre) |
| GitHub | Statut de chaque déploiement de prévisualisation, par commit | Disponible |
| Pages publiques de la production | `/api/health`, `/api/status` | Disponible |
| Prévisualisation | Ses pages et son API | **Inaccessible** : protégée par l'authentification Vercel |

Pour lever le blocage : donner au connecteur un jeton dont la portée couvre l'équipe et le projet.

## 2. Le diagnostic que l'application établit elle-même

`GET /api/status/config`, en-tête `Authorization: Bearer <CRON_SECRET>` (le secret n'est jamais
accepté dans l'adresse). Il ne renvoie **aucune valeur de variable**.

| Bloc | Contenu | Réserve qu'il lève |
|---|---|---|
| `sessionSecret` | `ok` : présent, 32 caractères au moins, pas une valeur d'exemple | D1 |
| `variables` | Pour 43 variables : présente ou non | D4 |
| `clerk` | Sorte des clés, instance désignée, clé du site et clé du serveur de la même instance ou non | D2 |
| `database` | Nom d'hôte de la base, région, rôle PostgreSQL réel, RLS, état des migrations | C et D3 |
| `regions` | Région des fonctions, région de la base, voisines ou non | D3 |
| `mail`, `backups`, `errorTracking`, `cron` | Expéditeur d'essai ou non, copie hors site configurée ou non | D4, F |
| `config.warnings` | Avertissements de configuration, en clair | tous |

Preuve qu'aucun secret n'en sort : test « diagnostic … et aucune valeur » de
`apps/api/src/test/levee-reserves-config.test.ts`. Un autre test échoue si une variable lue par le
code n'est ni dans ce diagnostic ni dans la liste explicite de celles qui n'ont pas à y être.

Le diagnostic existe sur tout déploiement de la branche. **Il n'existe pas en production** tant que
la branche n'y est pas déployée : pour la production d'aujourd'hui, les lectures restent manuelles.

## 3. D1 — `JWT_SECRET`

| Point | État | Preuve ou suite |
|---|---|---|
| Longueur minimale exigée par le code | 32 caractères, valeurs d'exemple refusées | `p0-config.test.ts` |
| Absence de valeur de secours | Fait : en production, sans secret conforme l'API répond 503 partout | `p0-config.test.ts` |
| Présent en Production, longueur réelle | **EN ATTENTE VERCEL** | VERCEL-02, A1 |
| Présent en Preview, différent de la production | **EN ATTENTE VERCEL** | VERCEL-02, B2 |
| Généré de façon sûre | Non vérifiable après coup | Recommandation : le régénérer au déploiement (`openssl rand -hex 32`), ce qui invalide aussi toute session ouverte par le défaut critique |

Si A1 montre un secret absent ou court : **ne pas déployer** avant de l'avoir posé.

## 4. D3 — Région

| Point | État | Preuve |
|---|---|---|
| Région de la base | `aws-eu-central-1` (Francfort) | Relevé Neon de ChatGPT |
| Région des fonctions dans le dépôt | `fra1`, une seule région, aucune région de secours | `vercel.json` ; `p0-config.test.ts` |
| `fra1` est la région voisine de `aws-eu-central-1` | Fait | `p0-config.test.ts` (`regionCheck`) |
| Le réglage est accepté par la plateforme | Fait : déploiements de prévisualisation réussis avec ce réglage (`c2b843f`, `427e470`, `482c4c5`) | Statuts GitHub |
| Région **effective** d'un déploiement | **EN ATTENTE VERCEL** | `GET <prévisualisation>/api/health` → `"region":"fra1"` |
| Production aujourd'hui | `iad1` (États-Unis), environ 96 ms par requête SQL | `/api/health` et `/api/status`, 12 novembre |

La réserve « région choisie sans confirmation » est **levée** par le relevé Neon : `fra1` est à conserver.

## 5. D5 — Tâches planifiées

| Point | État | Preuve |
|---|---|---|
| Deux tâches : `/api/jobs/daily` à 04:30 UTC, `/api/jobs/reminders` à 14:00 UTC | Dans le dépôt | `vercel.json` |
| Authentification | Secret `CRON_SECRET`, comparé à temps constant ; sans secret configuré : 503 | `p0-api-robustesse.test.ts` |
| Durée | 60 s au plus par fonction ; la passe travaille 35 s puis se poursuit par un nouvel appel | `p0-passe-quotidienne.test.ts` |
| Reprise, double exécution | Une passe par jour, bail, jeton, verrou en base ; huit règles retirées une à une, toutes détectées | `docs/chantiers/preuves/P0_4_passe_quotidienne.txt` |
| Appel de l'API à elle-même | Prouvé en local avec un vrai serveur HTTP | idem |
| **Sur la plateforme** | **NON VALIDÉ** : aucun journal accessible, et la production exécute encore l'ancien code | VERCEL-02, A4 |
| Production aujourd'hui | Passe quotidienne : dernière trace le 2026-09-23, « partielle ». Alertes : en erreur. Sauvegarde : périmée, 0 fichier | `/api/status`, 12 novembre |

## 6. Fait nouveau : quota de déploiements atteint

Le 13 novembre à 01:33 UTC, le statut Vercel du commit `6292ccb` est : « Deployment rate limited —
retry in 24 hours ». Le déploiement précédent (`482c4c5`, 01:22 UTC) avait réussi.

| Conséquence | Détail |
|---|---|
| Plus de prévisualisation pendant la durée du blocage | Les commits `6292ccb` et suivants n'ont pas de prévisualisation ; le statut « Vercel » de la demande de fusion est rouge pour cette seule raison |
| **Un déploiement de production serait bloqué lui aussi** | Ne pas fusionner pendant le blocage : la fusion ne mettrait rien en ligne |
| Cause à établir | Le dépôt est relié à deux projets Vercel : chaque envoi déclenche deux déploiements. La branche a reçu sept envois en deux jours, soit quatorze déploiements : cela n'explique pas à lui seul un quota journalier, d'autres déploiements du compte ont compté |

À traiter dans VERCEL-02, point Q. De son côté, l'agent regroupe désormais ses envois.

## 7. D4 — Variables attendues par environnement

« Présente » se lit dans le tableau de bord (nom et portées) ou dans le diagnostic du § 2.

| Variable | Production | Preview | Remarque |
|---|---|---|---|
| `DATABASE_URL` | requise | **à ne pas partager** | Une prévisualisation ne la lit jamais (test) ; retirer la portée Preview par propreté |
| `PREVIEW_DATABASE_URL` | — | requise | Branche Neon de prévisualisation ; sans elle l'API de prévisualisation répond 503 |
| `JWT_SECRET` | requise, 32 caractères | requise, **valeur différente** | § 3 |
| `CRON_SECRET` | requise | requise, valeur différente | Sert aussi à lire le diagnostic |
| `ADMIN_EMAILS` | requise | utile | Adresse à confirmer : `LEVEE_RESERVES_NEON.md`, § 6.1 |
| `APP_URL` | requise | facultative | Origines autorisées, liens des e-mails |
| `RESEND_API_KEY`, `MAIL_FROM` | requises | **à ne pas partager** | Sans clé, une prévisualisation n'envoie aucun e-mail |
| `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | à retirer | instance de développement AFRISUPPLY | `LEVEE_RESERVES_CLERK.md` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | à retirer | — | Inutile |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | selon décision | **à ne pas partager** | Jamais la clé réelle sur une prévisualisation |
| `BACKUP_S3_*` (4 variables) | absentes aujourd'hui | — | Sans elles, aucune sauvegarde n'est conservée |
| `SENTRY_DSN` | absente aujourd'hui | — | Suivi d'erreurs non configuré |
| `API_URL` | — | — | Ce n'est pas une variable Vercel : c'est un secret GitHub du déclencheur du matin |
| `SEED_DEMO`, `ALLOW_INSECURE_CONFIG`, `VENDOR_AUTO_APPROVE` | **absentes** | absentes | Leur présence en production est une erreur ou un avertissement de configuration |

## 8. Fiche d'intervention VERCEL-02 — pour ChatGPT et le titulaire

**A. Lectures sur la production (aucune modification)**

| # | Où | Relevé |
|---|---|---|
| A1 | Settings → Environment Variables → `JWT_SECRET` | Présente en Production ? Nombre de caractères (compter sans copier) |
| A2 | Même écran | Pour chaque variable du § 7 : présente ou non, et ses portées |
| A3 | Settings → Functions, et General | Région réglée dans le tableau de bord (le fichier `vercel.json` l'emporte), offre du compte |
| A4 | Logs, 7 jours, `/api/jobs/daily` puis `/api/jobs/notify` | Code de réponse, durée, message d'erreur |
| A5 | Cron Jobs | Les deux tâches et leur dernier résultat |

**B. Réglages en portée Preview uniquement**

| # | Variable | Valeur |
|---|---|---|
| B1 | `PREVIEW_DATABASE_URL` | Branche Neon de prévisualisation (`LEVEE_RESERVES_NEON.md`, O2) |
| B2 | `JWT_SECRET` | Nouvelle valeur aléatoire, différente de la production |
| B3 | `CRON_SECRET` | Nouvelle valeur aléatoire, différente de la production |
| B4 | Clés Clerk | `LEVEE_RESERVES_CLERK.md`, points 4 et 5 |
| B5 | Retirer la portée Preview de `DATABASE_URL`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `BACKUP_S3_*` | Une prévisualisation n'utilise aucune ressource de production |

**C. Preuves attendues sur la prévisualisation**

1. `GET /api/health` → 200, `"db":"neon"`, `"env":"preview"`, `"region":"fra1"`.
2. `GET /api/status` → `checks.schema.state = "a_jour"` (29/29), `checks.database.colocated = true`, `latencyMs` inférieur à 10.
3. `GET /api/status/config` → `sessionSecret.ok = true`, `database.host` = point d'accès de la branche de prévisualisation (N1), bloc `clerk` conforme.

**M. E-mails (production) — décision du titulaire**

Vérifier un domaine d'envoi chez le prestataire d'e-mails (enregistrements DNS du domaine de la
société), puis régler `MAIL_FROM` sur une adresse de ce domaine. Aujourd'hui l'expéditeur est
l'adresse d'essai du prestataire : seuls les messages adressés au titulaire de son compte sont remis.
Preuves : `GET /api/status` → `checks.mail.testSender = false` ; un e-mail de confirmation reçu dans
une boîte extérieure ; la tâche d'alertes « ok » le lendemain.

**S. Sauvegardes (production) — décision du titulaire**

Les quatre variables `BACKUP_S3_*` demandent un espace de stockage externe, donc une ressource à
créer. Procédure : `docs/SAUVEGARDE_HORS_SITE.md`. Sans elles, la seule sauvegarde est l'historique de Neon (N10).

**Q. Quota de déploiements**

Relever l'usage du compte (Usage → Deployments) et le rôle de chacun des deux projets reliés au
dépôt. Si l'un des deux ne sert à rien : couper ses déploiements automatiques, ce qui divise la
consommation par deux.

**P. Facultatif — laisser l'intégration continue vérifier la prévisualisation**

Activer « Protection Bypass for Automation » dans Vercel, puis enregistrer le secret produit comme
secret GitHub du dépôt, directement de Vercel vers GitHub. L'agent ajoutera alors une tâche qui
vérifie chaque prévisualisation (santé, schéma, région, parcours du navigateur) sans que ce secret
passe par une conversation.

**Interdits** : copier une valeur de variable dans une conversation ou dans le dépôt ; modifier une
variable de portée Production sans décision explicite ; déclencher un déploiement de production.
