# AFRISUPPLY

> **Achetez mieux. Gaspillez moins. Gagnez plus.**
> L'assistant d'approvisionnement intelligent des restaurants africains.

Monorepo TypeScript — **React + Vite** (web) · **Hono** (API) · **Drizzle ORM** · **Neon Postgres** (prod) / **PGlite** (local).

Voir aussi : [`ROADMAP_MISE_SUR_LE_MARCHE.md`](./ROADMAP_MISE_SUR_LE_MARCHE.md) (feuille de route + chantiers issus de l'audit de septembre 2026).

> **État réel du produit** (sans complaisance) : voir la section « Ce qui est vérifié automatiquement » ci-dessous,
> qui liste ce qui tourne, ce qui est testé, et ce qui n'est **pas** encore branché (clés de paiement, e-mail réel, SMS).

---

## Ce qui est vérifié automatiquement

Tout ce qui suit est exécuté par la CI (`.github/workflows/ci.yml`) **et** disponible en local :

| Commande | Ce qu'elle vérifie | Dernier relevé |
|---|---|---|
| `npm run lint` | ESLint (flat config, plugin `react-hooks` inclus) | **0 erreur, 0 avertissement** |
| `npm run typecheck` | `tsc` sur `packages/db`, `apps/api`, `apps/web` (séquentiel) | ✅ |
| `npm test` | Vitest : base de données 5 · API 273 · web 53 | **331 tests** |
| `npm run build` | Bundle web (`vite build`) | ✅ |
| `npm run check:bundle` | `api/index.js` (bundle Vercel **committé**) correspond-il aux sources ? | ✅ |
| `npm run verifs:e2e` | 11 scripts de vérification **contre une API réelle** (parcours, réception, prix, alertes, e-mail, facturation, paiements, prévision, expérience) | **437 vérifications** |

`npm run verify` enchaîne lint → typecheck → tests → build → bundle. Les scripts de bout en bout
(`scripts/verifications/`) démarrent leur propre API (PGlite) et écrivent leurs preuves dans
`scripts/verifications/resultats/` ; ils ne remplacent pas les tests unitaires, ils vérifient ce qui se passe vraiment
(mails déposés dans `.outbox`, PDF produits, rôles refusés, quotas HTTP).

### Ce qui n'est PAS encore branché (aucun faux « c'est fait »)

- **Paiement en ligne** : sans `STRIPE_SECRET_KEY` / `STRIPE_PRICE_*`, `/billing/checkout` répond 503 et le web l'affiche honnêtement ; le passage d'un client en formule payante se fait à la main par l'admin, en attendant la clé.
- **E-mail** : avec `RESEND_API_KEY` les mails partent réellement ; sans clé, ils sont écrits dans `.outbox` (dev) et **refusés** en production (jamais de « envoyé » mensonger).
- **WhatsApp / SMS** : nécessite Twilio ; sans configuration, l'écran Réglages dit que rien n'a été envoyé.
- **Sauvegardes / supervision** : `/api/status` expose l'état réel, mais aucune procédure de sauvegarde/restauration n'est encore documentée ni testée (chantier « Exploitation » à venir).

---

## Déploiement

Tout sur Vercel (web statique + API en fonction serverless `api/index.ts`) + Neon : voir **`docs/DEPLOIEMENT.md`** (`vercel.json` racine, cron intégré).

## Démarrage en 2 minutes (sans rien installer d'autre que Node 20)

```bash
npm install
npm run dev          # API sur :8787 + web sur :3000 (proxy /api → API)
```

Ouvrir http://localhost:3000 — compte démo : **awa@chezawa.fr / demo1234**
(restaurant « Chez Awa », Nantes : 324 références au catalogue, 38 produits suivis en stock, 5 fournisseurs,
10 recettes, 60 jours de ventes — lundi fermé, donc ~52 jours avec des ventes — et 12 commandes reçues).

Sans `DATABASE_URL`, l'API utilise **PGlite** (Postgres WASM embarqué dans `packages/db/.pglite`). Migrations et seed sont appliqués automatiquement au démarrage.

## Passer sur Neon

1. Créer un projet Neon → copier la chaîne de connexion **pooler**.
2. `cp .env.example .env` puis renseigner `DATABASE_URL` et `JWT_SECRET`. Optionnel : `LLM_API_KEY` (+ `LLM_BASE_URL`, `LLM_MODEL`, API compatible OpenAI) pour que l’assistant reformule ses réponses — sans clé, tout fonctionne en local.
3. `npm run db:migrate && npm run db:seed` (ou laisser `AUTO_MIGRATE=true` / `SEED_DEMO=true`).

Le code métier ne change pas : `getDb()` retourne le même client Drizzle dans les deux cas.

---

## Structure

```
apps/
  web/            React 18 + Vite + Tailwind — 54 écrans (restaurant, fournisseur, admin, vitrine)
  api/            Hono (Node) — auth JWT, endpoints métier, moteurs, jobs (matin, relances)
packages/
  db/             Schéma Drizzle (44 tables), migrations SQL versionnées, seed démo, client Neon/PGlite
                  + data/ : référentiel 324 produits africains, 31 recettes types
scripts/          build du bundle API, contrôle du bundle committé, vérifications de bout en bout (Python)
```

### Schéma (44 tables)

| Domaine | Tables |
|---|---|
| Comptes | `users`, `restaurants`, `restaurant_members` |
| Référentiel & fournisseurs | `products` (partagé + privés), `suppliers`, `supplier_offers`, `price_history` |
| Stock | `inventory_items`, `stock_movements` |
| Commandes | `orders`, `order_lines`, `deliveries`, `delivery_discrepancies` |
| Menu | `recipes`, `recipe_ingredients`, `sales` |
| Intelligence | `alerts`, `reorder_rules`, `forecasts` |

Isolation multi-tenant : chaque table métier porte `restaurant_id`, et l'API filtre systématiquement via le middleware `requireRestaurant` (équivalent applicatif de la RLS Supabase ; Neon n'ayant pas d'auth intégrée, la sécurité vit dans l'API).

### API (`/api`)

| Route | Rôle |
|---|---|
| `POST /auth/register` `POST /auth/login` `GET /auth/me` | Auth (bcrypt + JWT 7 j, cookie httpOnly ou Bearer) |
| `GET /dashboard` | Compteurs 🟢🟠🔴, dépenses 30 j & évolution, alertes, dernières commandes |
| `GET /stock` `POST /stock/:id/movements` | Stock avec conso/jour et jours restants ; inventaire/ajustement |
| `GET /suppliers` `GET /suppliers/:id` `POST /suppliers` | Fiches, fiabilité calculée (retards, écarts), dépenses |
| `GET /products` `GET /compare/:productId?qty=` | Catalogue ; **comparateur** multi-critères avec justification en français |
| `GET /orders` `POST /orders` `POST /orders/:id/send` `POST /orders/:id/receive` | Commandes ; **réception** → stock + prix + écarts + réclamation pré-rédigée |
| `GET /catalog?q=&category=` `POST /catalog/products` `POST /catalog/track` | Catalogue 324 refs (recherche par alias), produit privé, suivi stock |
| `GET /onboarding/templates` `POST /onboarding/apply` | Recettes types → recettes + stock |
| `POST /import/suppliers` (dryRun) `GET /export/offers.csv` `GET /import/template.csv` | **Import CSV** fournisseurs + prix, export |
| `GET /forecast` `POST /forecast/snapshot` | **Prévision** des besoins par produit sur N jours (explication texte par produit) |
| `GET /smart-cart` `POST /smart-cart/checkout` | **Panier intelligent** réparti par fournisseur → commandes « préparée » |
| `GET/PUT/DELETE /reorder-rules[/:itemId]` `POST /reorder-rules/run` | **Auto-reorder** (règles seuil → commande préparée + alerte, jamais d’envoi) |
| `GET /sales?day=` `POST /sales` | Ventes du jour par plat (déduction stock optionnelle) |
| `GET /assistant/examples` `POST /assistant/ask` | **Assistant IA** : intent + chiffres locaux, reformulation LLM si `LLM_API_KEY` |
| `PUT/DELETE /suppliers/:id` `POST /suppliers/:id/offers` `PUT/DELETE /offers/:id` | **Gestion fournisseurs & prix** (historique alimenté) |
| `POST/PUT/DELETE /recipes[/:id]` `PUT/DELETE /stock/:itemId` `POST /stock/inventory` | Recettes, réglages d'article, inventaire groupé |
| `GET /orders/:id/message` `PUT /orders/:id` `PUT /orders/:id/lines` | Message WhatsApp/e-mail prêt à envoyer, statut, lignes, annulation |
| `GET /discrepancies` `POST /discrepancies/:id/resolve` `GET /prices/:productId/history` | Écarts de livraison, historique de prix |
| `GET /public/plans` `POST /public/leads` (publics) · `GET/PUT /admin/leads` (`ADMIN_EMAILS`) | Offre commerciale, demandes d'accès du site |
| `GET /recipes` | **Coût matière**, marge, prix conseillé, ingrédients qui dérivent |
| `POST /alerts/refresh` `GET /alerts` `POST /alerts/:id/read` | **Moteur d'alertes** : rupture, stock bas, hausse de prix, opportunité |

### Moteurs (`apps/api/src/lib/engines.ts`)

Fonctions pures, testées (`npm test`), portées d'ethimarket (`alertsEngine`, `procurementComparator`, `pricingEngine`) et adaptées au domaine restaurant :

- `computeDailyUse` — consommation/jour = ventes × grammages recette (fenêtre 28 j)
- `stockStatus` / `daysOfStock` — 🟢🟠🔴 par seuil **et** par jours restants
- `alertsFromStock`, `alertsFromPrices`, `alertsFromOpportunities` — alertes dédupliquées, rédigées en FR
- `compareOffers` — score prix 50 % / délai vs urgence 30 % / fiabilité 20 %, pénalité rupture, justification
- `recipeCost`, `marginAnalysis` — coût matière, marge brute, prix conseillé
- `supplierReliability` — 100 − 60 × taux de retard − 40 × taux d'écart

---

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | API + web en parallèle |
| `npm run verify` | **Porte de sortie** : lint → typecheck → tests → build → contrôle du bundle |
| `npm run typecheck` / `npm test` / `npm run lint` | Qualité (un workspace à la fois, séquentiel) |
| `npm run check:bundle` | Échoue si `api/index.js` n'est plus le bundle des sources |
| `npm run verifs:e2e` | 11 scripts de vérification sur API réelle (~25 min, nécessite l'API sur :8787) |
| `npm run db:generate` | Génère une migration SQL après modification de `schema.ts` |
| `npm run db:migrate` / `npm run db:seed` | Applique / seed (PGlite ou Neon selon `DATABASE_URL`) |
| `npm run build` | Typecheck des workspaces + build web (`apps/web/dist`) |

## Déploiement

- **Web** : Vercel (`vercel.json` fourni) — définir `API_URL` ou servir l'API sous le même domaine via rewrite `/api/*`.
- **API** : Node long-running (Railway, Fly.io, Render) ou adaptation Hono → Vercel Functions / Cloudflare Workers (le driver Neon serverless est déjà compatible edge).
- **DB** : Neon (branche `main` = prod, branches Neon par PR pour les previews).

## Origine du code

Extrait de [ethimarket](https://github.com/Huberaya/ethimarket) : stack, layout, auth-context, moteurs d'alertes / comparaison / prix, logique de commandes-réception. Abandonné : Supabase, certifications, Trust Center, RASFF, CRM, blog, admin (≈ 70 % du volume, hors périmètre restaurant).

## Historique des chantiers (audit de septembre 2026)

L'audit complet (`AUDIT_AFRISUPPLY.md`, tenu hors dépôt) a donné un verdict « ⚠️ OUI, mais avec conditions » :
l'application fonctionne, mais plusieurs promesses n'étaient pas tenues. Les chantiers ci-dessous ont été menés
**un par un**, chacun avec ses tests et ses vérifications en direct, et un rapport de fin de chantier.

| # | Chantier | Statut | Commit |
|---|---|---|---|
| 1 | Intégrité de la réception et des statuts de commande | ✅ livré | `48826af` (poussé) |
| 2 | Sécurisation du déploiement et cloisonnement | ✅ livré | `48826af` (poussé) |
| 3 | Prix réellement facturé et détection de la hausse | ✅ livré | `48826af` (poussé) |
| 4 | Page Analyse réellement utile (comprendre ses coûts) | ✅ livré | `df5af01` |
| 5 | Accès et récupération de compte | ✅ livré | `2f2bfef` |
| 6 | Canaux réels : e-mail, WhatsApp, notifications | ✅ livré | `5b064b9` |
| 7 | Encaissement et offre commerciale honnête | ✅ livré | `8db3ecc` |
| 8 | Parcours client et moyens de paiement | ✅ livré | `d145e72` |
| 9 | Prévision robuste (audit 2) : cascade de sources, relances, saisonnalité | ✅ livré | `31caa76` |
| 10 | Qualité, CI et dette : rendre le dépôt fiable et vérifiable | ✅ livré | `f042307` |
| 11 | UX : navigation par tâches, dialogues intégrés, parcours guidé, mobile | ✅ livré | voir `git log` |
| — | Exploitation : sauvegardes, supervision, support | ⏳ à venir | — |

Les rapports détaillés (fichiers, fonctionnalités, tests, ce qui reste) accompagnent l'audit hors dépôt.

## Modules livrés avant l'audit

Documentation dans `docs/` (état vérifié par les tests et les scripts de vérification ci-dessus) :
référentiel produits et recettes types (`CHANTIER_2_DONNEES.md`), gestion fournisseurs/prix/recettes (`CHANTIER_3_GESTION.md`),
intelligence — prévision, panier intelligent, auto-reorder, assistant (`CHANTIER_4_INTELLIGENCE.md`),
site vitrine et offre (`CHANTIER_5_MARQUE_OFFRE.md`), facturation (`CHANTIER_6_FACTURATION.md`), pilotes (`CHANTIER_7_PILOTES.md`),
fiabilité (`CHANTIER_8_FIABILITE.md`), notifications (`CHANTIER_4BIS_NOTIFICATIONS.md`), saisie express (`CHANTIER_9_SAISIE_EXPRESS.md`),
marketplace B2B (`CHANTIER_10_MARKETPLACE.md`), liste de courses (`CHANTIER_11_LISTE_COURSES.md`),
import de catalogue (`CHANTIER_12_IMPORT_CATALOGUE.md`), vitrine produit (`CHANTIER_13_VITRINE.md`),
invitation fournisseur (`CHANTIER_14_INVITATION_FOURNISSEUR.md`), analyses fournisseur (`CHANTIER_15_ANALYSES_FOURNISSEUR.md`),
référentiel/PDF (`CHANTIER_16_REFERENTIEL_PDF.md`), tableau de bord fondateur (`CHANTIER_17_DASHBOARD_ADMIN.md`),
WhatsApp/SMS (`CHANTIER_18_WHATSAPP_SMS.md`), préparation & livraison (`CHANTIER_20_PREPARATION_LIVRAISON.md`),
ruptures partielles (`CHANTIER_21_RUPTURES_SUBSTITUTIONS.md`), CGV fournisseur (`CHANTIER_22_CGV_FOURNISSEUR.md`),
recommandation récurrente (`CHANTIER_24_RECOMMANDER_RECURRENT.md`), litiges & avoirs (`CHANTIER_26_LITIGES_AVOIRS.md`),
avis & fiabilité (`CHANTIER_27_AVIS_FIABILITE.md`), tarifs par volume (`CHANTIER_28_TARIFS_VOLUME_NEGOCIES.md`).
