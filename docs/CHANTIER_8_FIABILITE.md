# Chantier 8 — Fiabiliser la production

Objectif : pouvoir facturer des restaurateurs sans craindre une panne silencieuse, une fuite ou une demande RGPD sans réponse.

## Livré

| Brique | Où | Ce que ça fait |
|---|---|---|
| **Suivi des erreurs** | `apps/api/src/lib/ops.ts` (`captureException`), `apps/web/src/lib/monitoring.ts` | Toute 500 API et toute erreur JS front est envoyée à Sentry via son API HTTP (aucun SDK, 0 dépendance). Activer avec `SENTRY_DSN` (API) et `VITE_SENTRY_DSN` (web). Sans DSN : silencieux. |
| **Écran d'erreur front** | `components/ErrorBoundary.tsx` | Plus de page blanche : message clair + bouton Recharger, erreur remontée. |
| **Page de statut** | `GET /api/status` (200/503), page `/statut` | Base joignable + latence, dernier job du matin (`ok` / `stale` > 30 h / `degraded`), mail/Sentry/cron configurés, version + commit. Branchez un moniteur externe (UptimeRobot, Better Stack — gratuit) sur `/api/status` : alerte si ≠ 200. |
| **Historique des jobs** | table `job_runs`, `GET /api/status/jobs` (secret cron) | Chaque exécution du matin : durée, envoyés/total, erreurs par restaurant. Échecs aussi envoyés à Sentry. |
| **Rate limiting** | `rateLimit()` sur login (10/min), inscription (5/min), leads (5/min) | 429 + `Retry-After`. Mémoire par instance : suffisant contre le brute-force basique. |
| **En-têtes de sécurité** | `securityHeaders` | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS en prod. |
| **Journal d'audit** | table `audit_log` | `login.failed` (e-mail + IP), `account.export`, `account.delete`. |
| **RGPD** | `GET /api/account/export`, `DELETE /api/account`, Paramètres → « Mes données » | Export JSON complet (profil + chaque restaurant : fournisseurs, prix, stock, mouvements, commandes, livraisons, ventes, recettes, alertes, règles). Suppression : mot de passe + « SUPPRIMER » ; efface les restaurants dont l'utilisateur est seul propriétaire (cascade SQL). |
| **CGV/CGU** | `/cgv` | Version 1.0 : objet, essai, prix, résiliation, limites des prévisions, données, disponibilité 99,5 %, responsabilité. À faire relire avant la 1ʳᵉ facture. |
| **Migrations au déploiement** | `scripts/deploy-migrate.mjs` dans le `buildCommand` Vercel | Applique les migrations Drizzle sur Neon à chaque build si `DATABASE_URL` est présent. `SKIP_MIGRATE=1` pour désactiver. Migration `0002_ops` appliquée en prod. |
| **Tests e2e** | `apps/api/src/test/e2e.test.ts` (12 tests, app réelle + PGlite mémoire, zéro mock) | ① inscription/connexion/isolation multi-restaurant ② onboarding → stock ③ fournisseur → offre → commande → réception (stock ↑) ④ ventes → prévision → panier → alertes ⑤ cron + statut + rate-limit + export/suppression RGPD. **50 tests au total.** |

## Runbook (quoi faire quand…)

**`/statut` rouge, base KO** → console Neon : projet suspendu (quota gratuit) ou mot de passe changé → mettre à jour `DATABASE_URL` sur Vercel, redéployer.

**Mail du matin « stale »** → Vercel → Cron Jobs → *Run* manuellement ; regarder *Logs* → `api/index`. Vérifier que `CRON_SECRET` existe. `GET /api/status/jobs` avec le secret pour l'historique.

**Un restaurant signale une erreur** → Sentry : filtrer par tag `restaurantId` ; l'événement contient la route, l'utilisateur et la stack.

**Demande RGPD par e-mail** → demander au client de passer par Paramètres → Mes données. Si le compte est inaccessible : `SELECT` par e-mail dans `users`, export manuel via l'API avec un token généré, puis `DELETE FROM users WHERE email=…` (cascade).

**Rollback** → Vercel → Deployments → déploiement précédent → *Promote to Production* (instantané). Les migrations sont additives : pas de rollback SQL nécessaire.

**Restaurer des données** → Neon → Branches → *Restore* (point-in-time, rétention par défaut 6 h en gratuit — passer à 7 j dans Settings → Storage dès le premier client payant).

## Rotation des secrets (à faire maintenant)
Trois secrets ont transité par le chat de développement :
1. **Neon** : Roles → `neondb_owner` → Reset password → coller la nouvelle URL dans Vercel `DATABASE_URL` → Redeploy.
2. **GitHub PAT** : Settings → Developer settings → Tokens → Delete.
3. **Vercel token** : Account Settings → Tokens → Delete.
`JWT_SECRET` et `CRON_SECRET` générés pour Vercel n'ont pas circulé ailleurs que dans ce chat : à régénérer aussi par prudence (changer `JWT_SECRET` déconnecte tous les utilisateurs).

## Reste à activer (comptes à créer, 10 min)
- [ ] sentry.io → 2 projets (Node, React) → coller `SENTRY_DSN` et `VITE_SENTRY_DSN` dans Vercel.
- [ ] UptimeRobot → moniteur HTTPS sur `https://<app>/api/status`, intervalle 5 min, alerte e-mail/SMS.
- [ ] Resend → domaine vérifié → `RESEND_API_KEY` (sinon aucun mail du matin ne part en prod).
- [ ] Neon → rétention PITR 7 jours.
