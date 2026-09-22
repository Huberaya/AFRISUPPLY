# Vérification du déploiement Vercel — AFRISUPPLY

**Date de la vérification** : 22 septembre 2026 (soir)
**Question posée** : « est-ce que tout a bien été déployé sur Vercel ? »
**Commit de ce rapport** : `a6097e2` (correctifs) — vérification faite sur `6fad9b5` en ligne.
**Réponse courte** : **OUI** — tout ce qui est poussé sur `main` est en ligne et répond.
Mais « en ligne » n'est pas « complet » : **13 variables d'environnement manquent** à la
production, donc trois fonctions (sauvegarde hors site, encaissement, suivi d'erreurs) sont
**présentes dans le code et inactives en ligne**. Et la vérification a fait apparaître **trois
vrais défauts invisibles en local** : deux défauts serverless (disque éphémère, cadences de
supervision) **et un défaut de chaîne de déploiement** — la production n'exécutait pas les
sources, mais un bundle précompilé resté en arrière. Les trois sont corrigés et prouvés ci-dessous.

---

## 1. Ce qui est réellement en ligne

| Point vérifié | Résultat | Preuve |
|---|---|---|
| Projet | un seul projet visible : **`afrisupply-api`** | API Vercel `/v9/projects` (jeton fourni) |
| Domaine de production | `afrisupply-api-zeta.vercel.app` | réponse HTTP 200 |
| **Commit en production** | **`6fad9b5`** — identique à `main` et à mon dépôt local | `/api/status` → `commit: 6fad9b5` |
| État du déploiement | **READY** (17 h 24) | API Vercel `/v6/deployments` |
| Région | `iad1` | `/api/status` |
| Base de données | **Neon, connectée** | `/api/health` → `200`, `db: neon` |
| Interface web | servie sur `/` et `/catalogue` | requêtes réelles |

**Conclusion** : il n'y a **aucun retard de déploiement**. Tout ce qui a été poussé est en ligne.
**Mais** le code *exécuté* avait un train de retard sur le code *poussé* (bundle précompilé, §5) :
c'est corrigé, et le déploiement régénère désormais le bundle à chaque mise en ligne.

### Deux déploiements en échec, expliqués

| Déploiement | Cause | État |
|---|---|---|
| `7d801f2` (×2, **ERROR**) | `npm ci --include=dev` sortait en code 1 pendant l'installation | **réparé** par `3a39658` ; les déploiements suivants sont READY |

Rien à faire de votre côté : ces échecs sont **antérieurs** au déploiement actuel.

## 2. Ce qui est configuré, et ce qui manque

**8 variables de production présentes** (dont `DATABASE_URL` avec le mot de passe Neon, les
secrets d'authentification, `RESEND_API_KEY` : l'envoi d'e-mails est bien branché en ligne).

**13 variables absentes** — chacune correspond à une fonction présente dans le code mais **inactive
en production** :

| Fonction | Variables manquantes | Conséquence en ligne aujourd'hui |
|---|---|---|
| Sauvegarde **hors site** (chantier 13) | `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | la sauvegarde locale existe mais vit sur un disque **éphémère** ; aucune copie durable hors du serveur |
| **Encaissement** Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` | `/api/billing/health` répond honnêtement `ready:false`, `mode:'manuel'` : aucun faux abonnement, aucune fausse facture |
| **Suivi d'erreurs** | `SENTRY_DSN` | état annoncé « non configuré » |
| **SMS** | `TWILIO_ACCOUNT_SID` | relances par e-mail uniquement, état annoncé |
| **Support** | `SUPPORT_EMAIL` | adresse par défaut |
| **Sécurité des appels navigateur** | `ALLOWED_ORIGINS` | liste d'origines non restreinte par variable |

Aucune de ces absences ne « casse » l'application : chacune est **annoncée** (l'exploitation et la
page publique d'état disent explicitement « non configuré » au lieu de simuler un succès).

## 3. Les tâches planifiées

| Tâche | Planification | Prochain passage |
|---|---|---|
| `daily` (relances, essais, **sauvegarde**) | `30 4 * * *` | **23/09 à 04 h 30 UTC** |
| `reminders`, `alerts-notify` | `0 14 * * *` | quotidien |

**Le `backup: never` vu en ligne a une explication, et ce n'est pas un bug d'enregistrement** :
le dernier passage du cron (22/09 à 05 h 21 UTC) est **antérieur** au déploiement du code des
sauvegardes. J'ai testé l'hypothèse « un échec de sauvegarde passerait inaperçu » : elle est
**réfutée** (le test montre qu'un échec écrit bien une ligne en erreur avec sa cause). Le prochain
passage du 23/09 produira les premières lignes réelles.

## 4. Ce que la production a révélé — deux vrais défauts, corrigés

C'est le vrai apport de cette vérification : **deux défauts invisibles en local**, parce qu'ils
n'existent qu'en serverless.

| Défaut | Cause | Correctif | Preuve |
|---|---|---|---|
| La sauvegarde quotidienne ne s'écrivait **nulle part** : sur Vercel le disque du projet est **en lecture seule**, `<cwd>/.backups` est inécrivable | `backupDir()` supposait un disque inscriptible à côté du code | repli automatique sur `tmpdir()`/`afrisupply-backups` dès que `VERCEL` est défini sans `BACKUP_DIR` ; le caractère **éphémère est annoncé** (champ `ephemere`, note lisible, **problème listé dans l'exploitation** : « seule la copie hors site est durable ») | test dédié : dossier non inécrivable → ligne `job_runs` en erreur **avec la cause**, la tâche quotidienne continue |
| L'exploitation **criait au loup chaque jour** : `reminders` et `alerts-notify` étaient surveillées à **3 h** alors que le plan Hobby n'autorise **qu'un cron par jour** | seuils hérités d'un rythme de croisière, pas du plan réellement utilisé | seuils **26 h** (`reminders`, `alerts-notify`) et **30 h** (`daily`, `backup`, `offsite-backup`), surchargeables par `JOB_MAX_HOURS_<JOB>` ; `offsite-backup` n'est supervisé **que si** le hors site est configuré | `ops-backup` **30/30**, `chantier12_verif.py` **70/70** (plus de fausse alerte après une passe saine) |

Ces correctifs sont dans le commit **`a6097e2`** : `apps/api/src/lib/backup.ts`,
`apps/api/src/lib/ops-health.ts`, `apps/api/src/routes/ops.ts`, tests `ops-backup.test.ts` (30/30)
et `backup-echec-visible.test.ts` (5/5, nouveau), scripts de vérification 12 et 13.

**Vérifications après correctif** : `chantier13_verif.py` **23/23** contre une API configurée en
« simulée Vercel » (le dossier `/tmp/afrisupply-backups` est bien celui annoncé, le hors site est
bien supervisé) · `chantier12_verif.py` **70/70** · typecheck 0 · lint 0.

## 5. Découverte n°3 — la production ne tournait pas sur les sources (bundle précompilé)

En revérifiant la production **après** le déploiement des correctifs, `/api/status` annonçait toujours
`reminders` et `alerts-notify` surveillées à **3 h**, alors que le code déployé dit **26 h**. Un seuil
qui ne bouge pas après un déploiement, c'est le signe que le code exécuté n'est pas celui qu'on croit.

**Cause** : Vercel n'exécute pas `apps/api/src`. La fonction déployée est **`api/index.js`, un bundle
précompilé et committé** (`npm run build:api`), que la chaîne de déploiement **ne régénérait pas**. Le
commit affiché (`9dd6e41`) était bien celui du dépôt, mais le code exécuté était celui du dernier bundle
fabriqué à la main, au commit `b4e9523` : mes deux correctifs étaient **poussés, déployés… et
inopérants**. Dit autrement : pendant ce temps, la production écrivait encore ses sauvegardes dans un
dossier inécrivable et surveillait les tâches à 3 h.

**Deux garde-fous ont fonctionné** :

- `scripts/check-bundle.mjs` (présent dans `npm run verify` **et** dans la CI) est passé au rouge en
  indiquant exactement la marche à suivre : « lancez `npm run build:api` et committez `api/index.js` » ;
- la comparaison d'un **comportement observable** (les seuils affichés par `/api/status`) avec les
  sources — c'est elle qui a révélé l'écart, pas le commit affiché.

**Correctifs, en deux niveaux** :

| Niveau | Action | Effet |
|---|---|---|
| Immédiat | `npm run build:api` → `api/index.js` régénéré (seuils 26 h et repli `tmpdir()` vérifiés **dans le bundle**) | la production exécute enfin le code testé |
| **Cause racine** | `vercel.json` : le `buildCommand` **régénère le bundle à chaque déploiement** (`… && node api/build.mjs`) | la production **ne peut plus** servir un code différent des sources, même si le bundle n'est pas committé |

**Leçon** : « le commit en ligne est le bon » ne prouve pas que **le code en ligne** est le bon. Ce qui le
prouve, c'est de confronter un comportement observable à sa valeur dans les sources — et d'avoir un
garde-fou automatique entre les deux.

## 6. Les ✗ d'un premier passage, expliqués et levés

Un premier passage de `chantier12_verif.py` contre une API configurée en « simulée Vercel »
avait produit des échecs (employé renvoyé en 401, trois tâches « en problème », tâche quotidienne
« degraded »). **Diagnostic : mon environnement de test, pas le code.** Sans clé Resend, aucun
e-mail ne peut partir, donc la tâche quotidienne se déclarait en dégradé — à juste titre. Sur une
base neuve et une configuration standard, **le même script passe 70/70**. Leçon retenue :
ne jamais conclure à une régression sur la base d'un environnement volontairement dégradé.

## 7. Ce qu'il reste à faire — et qui n'est pas du code

1. **Créer le seau chez un hébergeur** (Cloudflare R2 ou Scaleway recommandés : données en Europe,
   pas de frais de sortie), puis poser les **4 variables** `BACKUP_S3_*` sur Vercel.
2. **Lancer une fois les trois gestes** dans l'exploitation : sauvegarder → envoyer hors site →
   essayer de restaurer **depuis la copie externe**, et lire le rapport (procédure complète dans
   `docs/SAUVEGARDE_HORS_SITE.md`).
3. **Stripe** : clés + prix pour passer de l'encaissement manuel à l'encaissement réel.
4. **Réinitialiser le mot de passe Neon** (il a circulé) et **révoquer les jetons** GitHub et
   Vercel utilisés pendant ce chantier.
5. **`ALLOWED_ORIGINS`** : fixer la liste des origines autorisées en production.
6. **Recette terrain** : 3 restaurateurs devant l'écran, sans aide (c'est le seul point que ni
   les tests ni la vérification du déploiement ne peuvent trancher).

## 8. Réponse en une phrase

**Oui, tout est déployé et la production est saine et honnête** — l'application répond, la base est
connectée, le commit en ligne est exactement celui du dépôt, et la vérification a même permis de
trouver puis de corriger deux défauts propres au serveur ; **ce qui manque n'est pas du code, c'est
de la configuration** : un seau de sauvegarde, Stripe, et un mot de passe à changer.
