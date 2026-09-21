# AFRISUPPLY

> **Achetez mieux. Gaspillez moins. Gagnez plus.**
> L'assistant d'approvisionnement intelligent des restaurants africains.

Monorepo TypeScript — **React 18 + Vite + Tailwind** (web) · **Hono** (API) · **Drizzle ORM** · **Neon Postgres** (prod) / **PGlite** (local et tests).

Voir aussi : [`ROADMAP_MISE_SUR_LE_MARCHE.md`](./ROADMAP_MISE_SUR_LE_MARCHE.md) · [`docs/`](./docs) (une fiche par chantier fonctionnel).

---

## Démarrage en 2 minutes (Node 20)

```bash
npm install
npm run dev          # API sur :8787 + web sur :3000 (proxy /api → API)
```

Ouvrir http://localhost:3000 — compte démo : **awa@chezawa.fr / demo1234**
(restaurant « Chez Awa », Nantes : référentiel produits africains, 5 fournisseurs, recettes, 60 jours de ventes, commandes).

Sans `DATABASE_URL`, l'API utilise **PGlite** (Postgres WASM). Migrations et seed démo s'appliquent au démarrage (`SEED_DEMO=true`) ; `SEED_DEMO=purge` **supprime et régénère** le restaurant démo (`npm run db:seed -- --force` fait de même). En production le seed démo est refusé sauf `ALLOW_DEMO_SEED=true` (identifiants publics assumés).

## Passer sur Neon

1. Créer un projet Neon → copier la chaîne de connexion **pooler**.
2. `cp .env.example .env` puis renseigner `DATABASE_URL` et `JWT_SECRET` (32 caractères minimum, `openssl rand -hex 32`).
3. `npm run db:migrate && npm run db:seed` (ou laisser `AUTO_MIGRATE=true` / `SEED_DEMO=true`). Optionnel : `LLM_API_KEY` (API compatible OpenAI) pour que l'assistant reformule ses réponses — sans clé, tout fonctionne en local.

Le code métier ne change pas : `getDb()` retourne le même client Drizzle dans les deux cas. Toutes les variables : **[`.env.example`](./.env.example)**.

---

## Structure

```
apps/
  web/            React 18 + Vite + Tailwind — 25+ pages (gestion, achat, marketplace, admin, site)
  api/            Hono (Node) — auth, endpoints métier, moteurs, jobs
packages/
  db/             Schéma Drizzle (46 tables), migrations SQL (drizzle/), seed démo, client Neon/PGlite
                  + data/ : référentiel 324 produits africains (alias), 31 recettes types
```

### Schéma (46 tables — extrait)

| Domaine | Tables |
|---|---|
| Comptes & tenancy | `users`, `restaurants`, `restaurant_members`, `audit_log`, `rate_limits` |
| Référentiel & fournisseurs | `products` (partagé + privés), `suppliers`, `supplier_offers`, `price_history` |
| Stock & mouvements | `inventory_items`, `stock_movements` |
| Commandes & livraisons | `orders`, `order_lines`, `deliveries`, `delivery_discrepancies`, `order_events` |
| Menu & prévision | `recipes`, `recipe_ingredients`, `sales`, `forecasts`, `forecast_events`, `alerts`, `reorder_rules` |
| Marketplace & logistique | `vendors`, catalogues, tournées/créneaux, substitutions, litiges/avoirs, avis, encours |
| Croissance & facturation | `leads`, `prospects`, pilots, abonnements Stripe, commissions |

Isolation multi-tenant : chaque table métier porte `restaurant_id`, filtré par le middleware `requireRestaurant` (la sécurité vit dans l'API — Neon n'a pas d'auth intégrée).

### API (`/api`) — extrait des routes

| Route | Rôle |
|---|---|
| `POST /auth/register` `POST /auth/login` `GET /auth/me` `POST /auth/logout` | Auth bcrypt + JWT **7 j révocable** (`tokenVersion`), posé en **cookie HttpOnly** (le web n'a jamais le jeton : S2) |
| `POST /auth/forgot-password` `POST /auth/reset-password` | Reset par e-mail (Resend ou boîte `.outbox` en dev) |
| `GET /dashboard` | Compteurs 🟢🟠🔴, dépenses 30 j, alertes, dernières commandes |
| `GET /stock` `POST /stock/:itemId/movements` `GET /stock/:itemId/movements` | Stock (conso/j, jours restants), mouvements signés + **journal** |
| `GET /products` `GET /compare/:productId?qty=` | Catalogue ; **comparateur au coût total** (colis + livraison + minimum de commande) |
| `GET /orders` `POST /orders` `POST /orders/:id/send` `POST /orders/:id/receive` | Commandes (plausibilité des quantités) ; réception → stock + prix + écarts + réclamation rédigée |
| `GET /forecast` `PUT /forecast/events` `GET /forecast/events` | **Prévision** 7 j explicable (saisonnalité, événements) ; soirées privatisées (coef de fréquentation) |
| `GET /smart-cart` `POST /smart-cart/checkout` | Panier intelligent multi-fournisseurs (livraison/minimum inclus) |
| `GET /sales` `POST /sales` | Ventes du jour par plat |
| `GET /assistant/examples` `POST /assistant/ask` | Assistant IA : chiffres locaux + reformulation LLM optionnelle |
| `POST /alerts/refresh` `GET /alerts` | Alertes : rupture (**non déclenchée si la livraison couvre le creux**), stock bas, prix, opportunités |
| `GET /reorder-rules` `POST /reorder-rules/run` | Auto-reorder (préparation seule, jamais d'envoi) |
| Marketplace, vitrine, billing, pilotes, admin… | `docs/` (chantiers 6-29) |

### Moteurs (`apps/api/src/lib/`)

Fonctions pures testées — `engines.ts` (stock, alertes, **comparateur coût total**, coûts recette, fiabilité fournisseur), `forecast.ts` (moyenne mobile par jour de semaine + tendance, **saisonnalité ×1,2**, **événements ×coef**, fermetures, panier), `limits.ts` (plausibilité des quantités).

---

## Sécurité & exploitation (audits successifs)

- **Session = cookie HttpOnly `afs_token`** — jamais dans `localStorage`, jamais lisible par le JavaScript (S2). Bearer accepté en plus pour les clients API/tests.
- **Rate-limit Postgres partagé** (`rate_limits`, UPSERT atomique) : 10 connexions/min/IP → **429**, y compris en environnement serverless (S1/B7). Repli mémoire uniquement si la base est injoignable.
- Mots de passe : politique stricte (dictionnaire, répétitions, longueur) · sessions **révocables** (changement de mot de passe + « déconnecter tous mes appareils ») · CORS liste blanche · en-têtes de sécurité · `audit_log` · secret JWT refusé faible en prod.
- Exploitation : Sentry optionnel (`SENTRY_DSN`), `/api/status`, job quotidien (`X-Cron-Secret`), RGPD export/suppression.

## Qualité — tests & CI

```bash
npm test --workspaces     # API (219 tests, 25 fichiers) + db (5) + web (5, Testing Library)
npm run typecheck         # 0 erreur
npm run lint
npm run build
```

CI GitHub Actions : [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) (typecheck → lint → tests → build) sur chaque push `main` et PR.

## E-mails (reset de mot de passe, notifications)

- `RESEND_API_KEY` renseigné → envoi réel via Resend (`MAIL_FROM` obligatoire, domaine vérifié).
- Sinon : boîte de sortie `MAIL_OUTBOX_DIR` (défaut `.outbox/`) en dev, journalisation en serverless.
- **Vérification staging** (critère de mise en production) : demander un reset sur l'env de staging avec `RESEND_API_KEY` de test + `MAIL_FROM` vérifié → l'e-mail doit arriver dans la boîte réelle en < 1 min, le lien doit réinitialiser et reconnecter.

## Ce qui est vérifié automatiquement (et rejouable en local)

Tout ce qui suit tourne en local **et** dans la CI (`.github/workflows/ci.yml`) :

| Commande | Ce qu'elle vérifie | Relevé du 21 septembre 2026 |
|---|---|---|
| `npm run lint` | ESLint (flat config, `react-hooks` inclus, aucun `any` implicite) | **0 erreur, 0 avertissement** |
| `npm run typecheck` | `tsc` sur `packages/db`, `apps/api`, `apps/web` (séquentiel) | ✅ 0 erreur |
| `npm test` | Vitest : base 5 · **API 359** · **web 67** | **431 tests verts** |
| `npm run build` | Bundle web (`vite build`) | ✅ |
| `npm run check:bundle` | Le bundle `api/index.js` correspond-il aux sources committées ? | ✅ |
| `npm run verifs:e2e` | 12 scripts de vérification **contre une API réelle** (parcours, réception, prix, alertes, e-mail, facturation, paiements, prévision, expérience, exploitation) | **507 vérifications · 12/12 scripts** |

`npm run verify` enchaîne lint → typecheck → tests → build → bundle.
Les scripts de bout en bout démarrent leur propre API (PGlite) et écrivent leurs preuves dans
`scripts/verifications/resultats/` : ils ne remplacent pas les tests unitaires, ils vérifient ce qui se
passe vraiment (mails déposés dans `.outbox`, PDF produits, rôles refusés, quotas HTTP, réception
idempotente, restauration de sauvegarde).

> Sur une machine à 2 Go de mémoire, `npm run verify` peut être tué par le noyau (exit 137) : chaque étape
> passe alors séparément. C'est une limite d'environnement, pas un échec produit.

## Ce qui n'est PAS encore branché (aucun faux « c'est fait »)

- **Paiement en ligne** : sans `STRIPE_SECRET_KEY` / `STRIPE_PRICE_*`, `/billing/checkout` répond 503 et
  l'écran l'affiche honnêtement ; le passage en formule payante se fait à la main par l'admin.
- **E-mail** : avec `RESEND_API_KEY` les mails partent réellement ; sans clé ils sont écrits dans `.outbox`
  (dev) et **refusés** en production — jamais de « envoyé » mensonger.
- **WhatsApp / SMS** : nécessite Twilio ; sans configuration, l'écran Réglages dit que rien n'a été envoyé.
- **Sauvegardes** : sauvegarde quotidienne par restaurant (gzip + empreinte SHA-256), essai de restauration
  réel dans une base neuve, refus d'écraser une base non vide, rotation, journal d'audit exportable.
  Ce qui reste : la copie **hors site** (S3) n'existe pas encore, et la restauration en production reste
  une procédure manuelle documentée.

---

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` / `dev:api` / `dev:web` | API + web en parallèle |
| `npm test` / `npm run typecheck` / `npm run lint` | Qualité (workspaces) |
| `npm run db:generate` | Génère une migration SQL après modification de `schema.ts` |
| `npm run db:migrate` / `npm run db:seed` | Applique / seed (`-- --force` = purge + régénération du démo) |
| `npm run build` | db + api + web |
| `npm run deploy:migrate` | Migrations au déploiement (Vercel) |

---

## Déploiement

- **Web** : Vercel (`vercel.json` fourni) — définir `API_URL` ou servir l'API sous le même domaine via rewrite `/api/*`.
- **API** : Node long-running (Railway, Fly.io, Render) ou Vercel Functions / Cloudflare Workers (le driver Neon serverless est compatible edge).

Tout sur Vercel (web statique + API en fonction serverless `api/index.ts`) + Neon : voir **`docs/DEPLOIEMENT.md`** (`vercel.json` racine, cron intégré).

---

## Origine du code

Extrait de [ethimarket](https://github.com/Huberaya/ethimarket) : stack, layout, auth-context, moteurs d'alertes / comparaison / prix, logique de commandes-réception. Abandonné : Supabase, certifications, Trust Center, RASFF, CRM, blog, admin (≈ 70 % du volume, hors périmètre restaurant).

## État du chantier 1 ✅ et suite

- [x] Monorepo, schéma, migrations, seed, client Neon/PGlite
- [x] Auth JWT, multi-restaurants, isolation par tenant
- [x] Dashboard, Stock, Fournisseurs, Comparateur, Commandes + Réception, Recettes, Alertes
- [x] Tests des moteurs, CI GitHub Actions, build prod
- [x] Chantier 2 : référentiel **324 produits** avec alias, **31 recettes types**, onboarding « Configurer ma carte », **import CSV** fournisseurs/prix avec aperçu, export — voir `docs/CHANTIER_2_DONNEES.md`
- [x] Chantier 3 : formulaires fournisseur/prix/recette, réglages & inventaire stock, envoi de commande WhatsApp/e-mail, modification/annulation, écarts de livraison, historique de prix — voir `docs/CHANTIER_3_GESTION.md`
- [x] Chantier 4 : prévision 7 j explicable, panier intelligent multi-fournisseurs, auto-reorder (préparation seule), assistant « Demander à l’IA » (moteur local + LLM optionnel) — voir `docs/CHANTIER_4_INTELLIGENCE.md`
- [x] Chantier 5 : site vitrine (`/`, `/tarifs`, `/fonctionnalites`, `/faq`, `/demander-un-acces`), offre 39/89/199 + pilote fondateur, leads + admin, script démo & plaquette — voir `docs/CHANTIER_5_MARQUE_OFFRE.md`
- [x] Chantier 9 : saisie express (phrase/dictée → ventes, comptage, réception, perte), inventaire rapide, photo de facture → stock + prix, PWA installable — `docs/CHANTIER_9_SAISIE_EXPRESS.md`
- [x] Chantier 10 : marketplace B2B (fournisseurs plateforme validés, catalogue, commande en un clic, confirmation vendeur), achats groupés par zone, commission 3 % — `docs/CHANTIER_10_MARKETPLACE.md`
- [x] Chantier 6 : facturation Stripe (essai 30 j, Checkout/Portal, relances, lecture seule après essai, fonctions par formule, factures de commission) — `docs/CHANTIER_6_FACTURATION.md`
- [x] Chantier 7 : programme pilote (invitations avec code fondateur, checklist semaine 1, retours/bugs/NPS, mesure d’usage, cockpit santé 🟢🟠🔴, rapport hebdo) — `docs/CHANTIER_7_PILOTES.md`
- Chantier 11 — Liste de courses en langage naturel : `docs/CHANTIER_11_LISTE_COURSES.md`
- Chantier 12 — Import de catalogue fournisseur (texte/Excel/photo) + prix express : `docs/CHANTIER_12_IMPORT_CATALOGUE.md`
- Chantier 13 — Vitrine publique (catalogue, fiche produit, panier, inscription au moment d’acheter) : `docs/CHANTIER_13_VITRINE.md`
- Chantier 14 — Invitation fournisseur pré-remplie (e-mail / WhatsApp, activation immédiate) : `docs/CHANTIER_14_INVITATION_FOURNISSEUR.md`
- Chantier 15 — Tableau de bord fournisseur « Analyses » (ventes, clients, demande non couverte) : `docs/CHANTIER_15_ANALYSES_FOURNISSEUR.md`
- Chantier 16 — Admin référentiel produits (ajout, alias, fusion, demandes grossistes) + PDF bon de commande / livraison : `docs/CHANTIER_16_REFERENTIEL_PDF.md`
- Chantier 17 — Tableau de bord fondateur `/app/admin` : `docs/CHANTIER_17_DASHBOARD_ADMIN.md`
- Chantier 18 — WhatsApp / SMS (Twilio) : nouvelle commande, rappel grossiste 4 h, suivi restaurant : `docs/CHANTIER_18_WHATSAPP_SMS.md`
- Chantier 22 — CGV fournisseur `/cgv-fournisseur`, acceptation versionnée : `docs/CHANTIER_22_CGV_FOURNISSEUR.md`
- Chantier 20 — Préparation & livraison (picking, étapes, preuve photo/signature) + suivi restaurant : `docs/CHANTIER_20_PREPARATION_LIVRAISON.md`
- Chantier 21 — Ruptures partielles & substitutions (proposition grossiste, acceptation 1 clic) : `docs/CHANTIER_21_RUPTURES_SUBSTITUTIONS.md`
- Chantier 24 — Recommander en 1 clic + commandes récurrentes hebdomadaires : `docs/CHANTIER_24_RECOMMANDER_RECURRENT.md`
- Chantier 26 — Litiges & avoirs (réclamation → réponse grossiste → escalade → arbitrage) : `docs/CHANTIER_26_LITIGES_AVOIRS.md`
- Chantier 28 — Tarifs par volume (paliers) & prix négociés par restaurant : `docs/CHANTIER_28_TARIFS_VOLUME_NEGOCIES.md`
- Chantier 19 — Tournées & créneaux de livraison : jours/zones/heure limite/capacité côté grossiste, choix de la date côté restaurant (`docs/CHANTIER_19_TOURNEES_CRENEAUX.md`)
- Chantier 24 bis — Récurrentes « me demander avant » : brouillon + validation en 1 clic (`docs/CHANTIER_24_BIS_RECURRENTES_A_VALIDER.md`)
- Chantier 29 — Encours & conditions de paiement : délais/plafonds par client, encaissements, rappels (`docs/CHANTIER_29_ENCOURS_PAIEMENT.md`)
- Chantier 25 — Paiement en ligne des commandes (Stripe Connect, commission à la source) (`docs/CHANTIER_25_PAIEMENT_EN_LIGNE.md`)
- Chantier 27 — Avis & fiabilité grossiste : note après livraison, réponse du grossiste, badges (`docs/CHANTIER_27_AVIS_FIABILITE.md`)
- [x] Admin → Prospection : carnet restaurants / fournisseurs (nom, adresse, téléphone, e-mail, contact, statut, relance, import tableur)
- [x] Chantier 8 : fiabilité prod (Sentry sans SDK, `/statut`, job_runs, rate-limit, en-têtes, audit, RGPD export/suppression, CGV, migrations au déploiement, 12 tests e2e) — `docs/CHANTIER_8_FIABILITE.md`
- [x] Chantier 4 bis : e-mail quotidien « Votre matin AFRISUPPLY » + job cron (alertes → auto-reorder → mail) — `docs/CHANTIER_4BIS_NOTIFICATIONS.md`
