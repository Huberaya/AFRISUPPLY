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
2. **Environment Variables**. La portée compte : une variable de production ne doit pas être offerte aux prévisualisations.

| Variable | Portée | Valeur |
|---|---|---|
| `DATABASE_URL` | **Production uniquement** | chaîne Neon pooler de la base de production |
| `PREVIEW_DATABASE_URL` | **Preview uniquement** | chaîne d'une base ou d'une branche Neon **dédiée** aux prévisualisations (jamais la production) |
| `JWT_SECRET` | Production, et une **autre valeur** pour Preview | `openssl rand -hex 32` (32 caractères minimum) |

Les autres variables (même tableau, colonne « Portée » = Production ; à dupliquer en Preview avec des valeurs de test si l'on veut une prévisualisation complète) :

| Variable | Valeur |
|---|---|
| `CRON_SECRET` | `openssl rand -hex 24` — Vercel l'envoie automatiquement au cron en `Authorization: Bearer` |
| `APP_URL` | `https://<votre-projet>.vercel.app` (liens du mail) |
| `ADMIN_EMAILS` | votre e-mail (liste des leads) |
| `RESEND_API_KEY`, `MAIL_FROM` | optionnels — sans clé, aucun mail ne part |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | optionnels (assistant) |
| `NODE_ENV` | `production` |
| `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | optionnels — connexion Clerk ; même instance des deux côtés, instance de production (`pk_live_` / `sk_live_`) |

**Ce que fait l'application si une variable manque ou est dangereuse** (chantiers P0.2 / P0.4) :
- `JWT_SECRET` absent, court ou d'exemple en production → l'API répond **503 sur toutes les routes** (sauf `/api/health`, qui indique `config: "a_corriger"`). Elle ne signe jamais une session avec une valeur de repli.
- prévisualisation sans `PREVIEW_DATABASE_URL` → l'API de prévisualisation répond 503 ; elle n'utilise jamais `DATABASE_URL`.
- `CLERK_SECRET_KEY` absent → la connexion Clerk est refusée (la connexion par mot de passe fonctionne).

3. **Deploy**. Vérifier `https://<projet>.vercel.app/api/health` → `{"ok":true,"db":"neon"}`, puis le site `/` et la connexion démo sur `/app`.
4. Onglet **Cron Jobs** : `/api/jobs/daily` à `30 4 * * *` (UTC) apparaît ; bouton *Run* pour tester. Les logs sont dans *Logs* → fonction `api/index`.
5. **Région des fonctions = région de la base.** Par défaut les fonctions tournent en `iad1` (États-Unis). Avec une base Neon en Europe, chaque requête SQL coûte un aller-retour transatlantique (mesuré : ~96 ms au lieu de 1 à 5 ms). Le dépôt fixe la région dans `vercel.json` (`"regions": ["fra1"]`, Francfort — la région de la base annoncée par les mentions légales) ; si la base est ailleurs, changer cette ligne (elle l'emporte sur *Settings → Functions → Function Region*), puis vérifier `GET /api/status` → `checks.database.colocated: true` et `latencyMs` < 10.

## 3. Migrations
Règle (chantier P0.4, `scripts/deploy-migrate.mjs`) :

| Situation | Ce que fait le build |
|---|---|
| Prévisualisation sans `PREVIEW_DATABASE_URL` | **aucune connexion à une base** (`DATABASE_URL` est ignoré) |
| Prévisualisation avec `PREVIEW_DATABASE_URL` (base dédiée) | contrôle en lecture seule de cette base ; avec `MIGRATE_ON_BUILD=apply` en portée Preview : l'aligne |
| Production | **contrôle en lecture seule** : si la base est en retard sur le code, le build échoue et la version en ligne reste en place |
| Production avec `MIGRATE_ON_BUILD=apply` posé pour ce déploiement | applique les migrations, puis construit |

La fonction serverless n'applique jamais de migration à l'exécution. Après un changement de schéma :
```bash
npm run db:generate                               # génère packages/db/drizzle/00xx_*.sql
DATABASE_URL=… npm run migrate:status -w packages/db   # LIT l'état de la base (aucune écriture)
DATABASE_URL=… npm run db:migrate                 # APPLIQUE sur la base désignée — opération à autoriser et à tracer
```
L'état réel de la base se lit aussi sans console : `GET /api/status` → `checks.schema`
(`a_jour`, `en_retard`, `en_avance`, `divergente`, `non_initialisee`, avec le nombre de migrations attendues et appliquées).

## 4. Limites Vercel à connaître
- Fonction : 60 s max (`vercel.json`). Avec des fonctions loin de la base, la passe quotidienne prend ~8 à 11 s par restaurant : elle ne tenait donc plus dans une invocation au-delà de 5 ou 6 restaurants, et s'arrêtait sans trace (constaté en production : aucune passe complète entre le 2026-09-23 et le chantier P0.4).
- **Passe quotidienne par tranches (chantier P0.4).** Une invocation travaille 35 s (`DAILY_BUDGET_MS`), écrit où elle en est, puis l'API se rappelle elle-même pour la suite ; chaque restaurant n'est traité qu'une fois par jour. Un second appel le même jour répond `alreadyComplete` sans rien refaire ; `?force=1` relance volontairement une passe. Filets si la suite ne part pas : le cron des rappels (14:00 UTC) reprend une passe inachevée, et le workflow GitHub « Daily digest » (secrets `API_URL` et `CRON_SECRET`) rappelle la route jusqu'à la fin.
- Lire l'état d'une passe : `GET /api/status` (`checks.jobs.daily` : `ok`, ou `degraded` avec « interrompue » / « incomplete ») ; détail par restaurant et par étape dans `GET /api/status/jobs` (secret des tâches planifiées) et dans l'écran « Exploitation ».
- Cron Hobby : précision « dans l'heure » ; Pro : à la minute.
- Sauvegardes : le disque d'une fonction est effacé avec elle. Sans `BACKUP_S3_*`, aucune sauvegarde applicative n'est conservée (voir `docs/SAUVEGARDE_HORS_SITE.md`).
- Le mode « mail fichier » (`.outbox/`) n'écrit pas sur Vercel (système en lecture seule) → configurer Resend.

## 5. Checklist mise en prod
- [ ] Mot de passe Neon régénéré, PAT GitHub révoqué
- [ ] Domaine `app.afrisupply.fr` ajouté au projet Vercel, `APP_URL` mis à jour
- [ ] Resend : domaine vérifié pour `MAIL_FROM`
- [ ] Mot de passe du compte démo changé si l'URL est publique
- [ ] Neon : rétention PITR ≥ 7 jours

## 6. E-mails et alertes — journal de livraison, reprises

**Chaque envoi laisse une trace en base.** `sendMail()` écrit une ligne dans la table `notifications` avec `channel = 'email'` (la table déjà utilisée par les envois WhatsApp/SMS) : la ligne est créée **avant** l'appel au prestataire avec `error = 'tentative'`, puis close avec `ok = true` et l'identifiant du prestataire (`provider_id`) en cas de remise, ou `ok = false` et le motif typé. `kind` porte le type d'envoi (`vendor_order`, `alert_immediate`, `daily_digest`, `invoice`, `invite`, `claim`…). Un envoi simulé (aucun prestataire) n'est jamais noté remis. Le journal n'empêche jamais un envoi de partir : si la base est indisponible, l'e-mail part quand même et un avertissement est écrit dans les journaux de la fonction.

Pourquoi ce journal : douze envois du produit sont écrits `void sendMail(…)` — résultat jeté — dont la notification de **nouvelle commande** au fournisseur. Sans journal, un envoi refusé par le prestataire ou coupé net par la plateforme ne laissait aucune trace durable : les compteurs visibles dans `/api/status` sont en mémoire et repartent à zéro à chaque instance de fonction.

Lire l'état des envois (lecture seule) :

```sql
select kind, ok, error, count(*) as n
from notifications
where channel = 'email' and created_at > now() - interval '1 day'
group by 1, 2, 3 order by n desc;
```

**Un seul balayage d'alertes à la fois.** Le cron horaire, la route `/api/jobs/notify` et l'appel opportuniste de `/api/jobs/reminders` peuvent se chevaucher. Le balayage tient désormais un bail dans `job_runs` (`job = 'alerts-notify'`, ligne `running` portant `summary.bailJusqua`) sous verrou advisory `4207002` — distinct de celui de la passe quotidienne (`4207001`). Un second passage dans la fenêtre répond `skippedBecause: "another_sweep_running"` sans rien envoyer. Durée du bail : `NOTIFY_LEASE_MS` (défaut **75 s** sur Vercel, la fonction étant arrêtée à 60 s, et **10 min** ailleurs). Un bail expiré n'arrête pas la reprise : le passage suivant le reprend et le referme.

**Ce qui est repris tout seul, et ce qui ne l'est pas.** Les alertes de stock sont reprises par le cron horaire tant que `alerts.notified_at` est vide, et le récap quotidien tant que `restaurants.last_digest_at` n'est pas à jour : ces deux envois sont rejoués sans doublon. En revanche un e-mail transactionnel refusé (facture, commande, invitation) n'est pas renvoyé de lui-même : le journal dit qu'il a échoué et pourquoi, mais une reprise automatique exigerait une file d'attente conservant le contenu du message (migration à prévoir). Les motifs `mail_rate_limited`, `mail_provider_error` et `mail_network_error` sont passagers — l'envoi peut être rejoué. Les motifs de configuration (`mail_not_configured`, `mail_key_invalid`, `mail_domain_not_verified`, `mail_from_invalid`) frappent **tous** les messages : réessayer ne sert à rien tant que le domaine d'envoi n'est pas vérifié chez le prestataire (`docs/audits/RESEND_DIAGNOSTIC.md`).

**Vérifier la remise côté prestataire.** Une ligne réussie porte l'identifiant renvoyé par le prestataire (`provider_id`) ; il se retrouve dans les journaux du compte d'envoi et permet de distinguer « accepté par le prestataire » de « remis dans la boîte du destinataire ». Aucun envoi réel n'est fait par les tests : le prestataire y est simulé par un serveur local, et un envoi réel de contrôle reste à faire sur une prévisualisation propre (`docs/audits/RESEND_VALIDATION_PREVIEW.md`).

## Vérifié depuis l'environnement de dev
Handler `api/index.ts` appelé comme le ferait Vercel (Request → Response), connecté à Neon : `/api/health` → `db: neon`, login démo, dashboard, cron sans secret → 401, cron `Authorization: Bearer` → 200 en 8 s.
