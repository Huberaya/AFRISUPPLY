# Vercel : matrice des environnements et des secrets (chantier P0-G)

13 novembre 2026. **L'agent n'a lu aucune variable Vercel** : le connecteur est refusé. Ce document dit
ce que le code exige et garantit ; la présence réelle de chaque variable reste à relever (colonne « État réel »).

## 1. Matrice

| Variable | Production | Preview | Development | État réel |
|---|---|---|---|---|
| `DATABASE_URL` | requise | **ne doit pas être partagée** ; ignorée par le code | facultative | non vérifié |
| `PREVIEW_DATABASE_URL` | ignorée par le code | requise : base propre, rôle `afrisupply_app` | — | non vérifié ; aujourd'hui : copie de la production, à remplacer |
| `JWT_SECRET` | requise, 32 caractères, **à ne pas modifier** | requise, valeur propre à la prévisualisation | valeur locale | non vérifié |
| `CRON_SECRET` | requise | requise, valeur propre | valeur locale | non vérifié |
| `ADMIN_EMAILS` | requise | adresse de test | — | non vérifié |
| `APP_URL` | requise | facultative | — | non vérifié |
| `RESEND_API_KEY`, `MAIL_FROM` | requises ; domaine vérifié | clé **distincte** ; domaine vérifié | absentes (e-mails écrits sur disque) | adresse d'essai en production (`/api/status`) |
| `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | à retirer (neutralisées par le code) | instance AFRISUPPLY de développement | facultatives | relevé indépendant : clés de développement en production |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | à retirer : jamais lue par le site | — | — | présente en production (relevé indépendant) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | selon décision | **jamais la clé réelle** | — | non vérifié |
| `BACKUP_S3_*` | absentes aujourd'hui (aucune sauvegarde conservée) | **jamais le stockage de production** | — | 0 fichier (`/api/status`) |
| `SENTRY_DSN` | absente aujourd'hui | — | — | non configuré (`/api/status`) |
| `MIGRATE_ON_BUILD` | **absente** | absente (le rôle minimal ne migre pas) | — | non vérifié |
| `SEED_DEMO`, `ALLOW_INSECURE_CONFIG`, `VENDOR_AUTO_APPROVE` | **absentes** | absentes | — | non vérifié |

## 2. Les douze vérifications demandées

| # | Vérification | Résultat | Preuve | Statut de preuve |
|---|---|---|---|---|
| 1 | Variables lues par le code | Recensées par lecture automatique du code de l'API | test « toute variable lue par le code figure dans le diagnostic » | test automatisé |
| 2 | Le diagnostic couvre les variables sensibles sans valeur | 43 variables : présente ou non | `levee-reserves-config.test.ts` | test automatisé |
| 3 | Règles de `JWT_SECRET` | 32 caractères au moins, valeurs d'exemple refusées, aucun repli en production (503) | `p0-config.test.ts` | test automatisé |
| 4 | Aucun secret révélé, même en erreur | Réponse comparée aux valeurs réelles des secrets du test ; erreurs du prestataire d'e-mails remplacées par un motif | `levee-reserves-config.test.ts`, `levee-blocages-mail.test.ts` | test automatisé |
| 5 | Environnements distingués | Production, prévisualisation, développement : par `VERCEL_ENV`, jamais par `NODE_ENV` seul | `levee-reserves-config.test.ts` | test automatisé |
| 6, 7 | Matrice et configuration Preview isolée | § 1 et § 3 | — | préparé, **non appliqué** |
| 8 | `DATABASE_URL` inutilisable sur Preview | Ignorée ; refusée si `PREVIEW_DATABASE_URL` lui est identique | test « une base par environnement » | test automatisé |
| 9 | `PREVIEW_DATABASE_URL` inutilisable en production | Ignorée, même si `DATABASE_URL` manque | même test | test automatisé |
| 10 | `MIGRATE_ON_BUILD=apply` jamais par inadvertance | Sans la variable, un build ne fait que contrôler ; une prévisualisation ne touche jamais la base de production | `p0-config.test.ts` | test automatisé |
| 11 | Tâches planifiées sans secret | 401 ; 503 si aucun secret n'est configuré ; jamais accepté dans l'adresse pour le diagnostic | `p0-api-robustesse.test.ts` | test automatisé |
| 12 | Secrets non partagés entre environnements | **Ne peut pas être garanti par le code**, qui ne voit qu'un environnement à la fois | — | à constater dans Vercel |

## 3. Configuration Preview isolée — à appliquer par le titulaire ou ChatGPT, portée Preview uniquement

1. `PREVIEW_DATABASE_URL` : la base propre (`LEVEE_RESERVES_NEON.md`, § 8), rôle `afrisupply_app`.
2. `JWT_SECRET` et `CRON_SECRET` : deux valeurs aléatoires nouvelles, générées directement dans Vercel.
3. Clés Clerk de l'application AFRISUPPLY de développement (`CLERK_VALIDATION_PREVIEW.md`).
4. Clé d'envoi d'e-mails distincte et `MAIL_FROM` sur le domaine vérifié (`RESEND_VALIDATION_PREVIEW.md`).
5. Retirer la portée Preview de `DATABASE_URL`, de la clé d'envoi de production, de `STRIPE_SECRET_KEY`, de `BACKUP_S3_*`.
6. Ne pas poser `MIGRATE_ON_BUILD`.

Preuve : `GET <prévisualisation>/api/status/config` — `sessionSecret.ok = true`, `database.role = "afrisupply_app"`,
`database.host` différent de celui de la production, `clerk.instance.same = true`, `mail.testSender = false`.
Rien de tout cela ne touche une variable de portée Production.
