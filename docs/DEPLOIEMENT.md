# Déploiement — Neon + Render (API) + Vercel (web)

```
 navigateur ──► Vercel (apps/web, statique)  ──rewrite /api/*──►  Render (apps/api, Hono/Node)  ──►  Neon (Postgres)
                                                                       ▲
 GitHub Actions cron (06:30) ── POST /api/jobs/daily (X-Cron-Secret) ──┘
```
Le front appelle `/api` en relatif : Vercel réécrit vers Render → même origine, pas de CORS ni de cookie tiers.

## 1. Neon (fait le 18/09/2026)
- Projet Neon eu-central-1, base `neondb`, **migrations Drizzle appliquées** (`0000_init`, `0001_leads`) et **démo « Chez Awa » seedée** (awa@chezawa.fr / demo1234).
- Utiliser toujours l'URL **pooler** (`…-pooler…neon.tech`) avec `sslmode=require` (`channel_binding=require` accepté).
- ⚠️ Le mot de passe a transité par le chat : **Neon → Roles → neondb_owner → Reset password**, puis mettre à jour `DATABASE_URL` sur Render.
- Rejouer localement : `DATABASE_URL=… npm run db:migrate` / `npm run db:seed`. L'API applique aussi les migrations au démarrage (`AUTO_MIGRATE=true`).

## 2. Render — API
1. Render → **New → Blueprint** → dépôt `Huberaya/AFRISUPPLY` (lit `render.yaml`, région Frankfurt, health `/api/health`).
2. Renseigner les variables `sync: false` : `DATABASE_URL` (Neon), `APP_URL` (URL Vercel, à compléter après l'étape 3), `ADMIN_EMAILS`, `RESEND_API_KEY` (optionnel), `LLM_API_KEY` (optionnel). `JWT_SECRET` et `CRON_SECRET` sont générés par Render — **copier `CRON_SECRET`** pour l'étape 4.
3. Vérifier `https://afrisupply-api.onrender.com/api/health` → `{"ok":true,"db":"neon"}`.
   Si vous nommez le service autrement, adapter la destination dans `apps/web/vercel.json`.

Plan *free* : le service s'endort après 15 min ; le premier appel du matin (cron) prend ~30 s — acceptable ; pour les démos clients, préférer *starter*.

## 3. Vercel — site + app web
1. Vercel → **Add New Project** → même dépôt → **Root Directory : `apps/web`** (le `vercel.json` fait l'install/build depuis la racine du monorepo).
2. Aucune variable requise. Déployer, puis reporter l'URL obtenue dans `APP_URL` sur Render (liens du mail du matin) et redéployer l'API.
3. Domaine : `app.afrisupply.fr` → Vercel ; l'API peut rester sur `*.onrender.com` (elle n'est appelée que via le rewrite).

## 4. Cron quotidien (GitHub Actions)
Copier `docs/cron-daily.yml.example` → `.github/workflows/cron-daily.yml` (depuis l'interface GitHub) et créer les secrets **`API_URL`** = `https://afrisupply-api.onrender.com` et **`CRON_SECRET`** (valeur Render). Test manuel : onglet Actions → *Daily digest* → *Run workflow*.

## 5. Checklist mise en prod
- [ ] Mot de passe Neon régénéré, PAT GitHub révoqué
- [ ] `SEED_DEMO=false` en prod (déjà dans le blueprint) — la démo existe déjà en base
- [ ] `RESEND_API_KEY` + domaine vérifié chez Resend pour `MAIL_FROM` (sinon les mails ne partent pas : mode fichier)
- [ ] `ADMIN_EMAILS` = votre e-mail pour voir les leads du site (`GET /api/admin/leads`)
- [ ] Sauvegardes : Neon conserve l'historique (PITR) ; activer 7 j minimum dans Settings → Storage
- [ ] Changer le mot de passe du compte démo si l'URL est publique

## Vérifié depuis l'environnement de dev
API lancée avec `DATABASE_URL` Neon : `/api/health` → `db: neon`, login démo, dashboard, `POST /api/jobs/daily?dryRun=1` → 33 alertes calculées, digest « sent » (dry-run) en ~8 s.
