# Déploiement — Tout sur Vercel + Neon

```
 navigateur ──► Vercel ──┬── /            fichiers statiques (apps/web, Vite)
                         └── /api/*       fonction serverless Node (api/index.ts → apps/api Hono)  ──► Neon (Postgres)
 Vercel Cron (06:30 Paris) ── GET /api/jobs/daily (Authorization: Bearer CRON_SECRET) ──┘
```
Un seul projet Vercel, un seul `git push`. Même schéma que vos projets Supabase+Vercel, Neon remplaçant la base et `apps/api` remplaçant Auth/PostgREST/RLS.

## 1. Neon — fait le 18/09/2026
Migrations Drizzle appliquées et démo « Chez Awa » seedée (awa@chezawa.fr / demo1234). Toujours utiliser l'URL **pooler** avec `sslmode=require`.
⚠️ Le mot de passe a transité par le chat : **Neon → Roles → neondb_owner → Reset password**, puis mettre à jour la variable sur Vercel.

## 2. Vercel — 5 minutes
1. **Add New Project** → dépôt `Huberaya/AFRISUPPLY` → Root Directory : **laisser la racine** (le `vercel.json` racine gère build web + fonction API). Framework preset : *Other*.
2. **Environment Variables** (Production + Preview) :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | chaîne Neon pooler |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 24` — Vercel l'envoie automatiquement au cron en `Authorization: Bearer` |
| `APP_URL` | `https://<votre-projet>.vercel.app` (liens du mail) |
| `ADMIN_EMAILS` | votre e-mail (liste des leads) |
| `RESEND_API_KEY`, `MAIL_FROM` | optionnels — sans clé, aucun mail ne part |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | optionnels (assistant) |
| `NODE_ENV` | `production` |

3. **Deploy**. Vérifier `https://<projet>.vercel.app/api/health` → `{"ok":true,"db":"neon"}`, puis le site `/` et la connexion démo sur `/app`.
4. Onglet **Cron Jobs** : `/api/jobs/daily` à `30 4 * * *` (UTC) apparaît ; bouton *Run* pour tester. Les logs sont dans *Logs* → fonction `api/index`.

## 3. Migrations futures
La fonction serverless **n'applique pas** les migrations au démarrage (cold start). Après un changement de schéma :
```bash
npm run db:generate                      # génère packages/db/drizzle/00xx_*.sql
DATABASE_URL=… npm run db:migrate        # applique sur Neon, avant/après le push
```
(Option : ajouter `npm run db:migrate` au `buildCommand` de `vercel.json` avec `DATABASE_URL` disponible au build.)

## 4. Limites Vercel à connaître
- Fonction : 60 s max (Hobby) / 300 s (Pro) — le job quotidien prend ~8 s par restaurant : OK jusqu'à ~6 restaurants en Hobby, passer en Pro ou appeler `?restaurantId=` par restaurant au-delà.
- Cron Hobby : précision « dans l'heure » ; Pro : à la minute.
- Le mode « mail fichier » (`.outbox/`) n'écrit pas sur Vercel (système en lecture seule) → configurer Resend.

## 5. Checklist mise en prod
- [ ] Mot de passe Neon régénéré, PAT GitHub révoqué
- [ ] Domaine `app.afrisupply.fr` ajouté au projet Vercel, `APP_URL` mis à jour
- [ ] Resend : domaine vérifié pour `MAIL_FROM`
- [ ] Mot de passe du compte démo changé si l'URL est publique
- [ ] Neon : rétention PITR ≥ 7 jours

## Vérifié depuis l'environnement de dev
Handler `api/index.ts` appelé comme le ferait Vercel (Request → Response), connecté à Neon : `/api/health` → `db: neon`, login démo, dashboard, cron sans secret → 401, cron `Authorization: Bearer` → 200 en 8 s.
