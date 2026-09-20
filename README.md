# AFRISUPPLY

> **Achetez mieux. Gaspillez moins. Gagnez plus.**
> L'assistant d'approvisionnement intelligent des restaurants africains.

Monorepo TypeScript — **React + Vite** (web) · **Hono** (API) · **Drizzle ORM** · **Neon Postgres** (prod) / **PGlite** (local).

Voir aussi : [`ROADMAP_MISE_SUR_LE_MARCHE.md`](./ROADMAP_MISE_SUR_LE_MARCHE.md) (les 10 chantiers).

---

## Déploiement

Tout sur Vercel (web statique + API en fonction serverless `api/index.ts`) + Neon : voir **`docs/DEPLOIEMENT.md`** (`vercel.json` racine, cron intégré).

## Démarrage en 2 minutes (sans rien installer d'autre que Node 20)

```bash
npm install
npm run dev          # API sur :8787 + web sur :3000 (proxy /api → API)
```

Ouvrir http://localhost:3000 — compte démo : **awa@chezawa.fr / demo1234**
(restaurant « Chez Awa », Nantes : 50 produits, 5 fournisseurs, 10 recettes, 60 jours de ventes, 12 commandes).

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
  web/            React 18 + Vite + Tailwind — 9 pages, layout à 6 onglets
  api/            Hono (Node) — auth JWT, endpoints métier, moteurs
packages/
  db/             Schéma Drizzle (16 tables), migrations SQL, seed démo, client Neon/PGlite
                  + data/ : référentiel 324 produits africains, 31 recettes types
```

### Schéma (16 tables)

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
| `POST /auth/register` `POST /auth/login` `GET /auth/me` | Auth (bcrypt + JWT 30 j, cookie httpOnly ou Bearer) |
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
| `npm run typecheck` / `npm test` / `npm run lint` | Qualité |
| `npm run db:generate` | Génère une migration SQL après modification de `schema.ts` |
| `npm run db:migrate` / `npm run db:seed` | Applique / seed (PGlite ou Neon selon `DATABASE_URL`) |
| `npm run build` | Build web (`apps/web/dist`) |

## Déploiement

- **Web** : Vercel (`vercel.json` fourni) — définir `API_URL` ou servir l'API sous le même domaine via rewrite `/api/*`.
- **API** : Node long-running (Railway, Fly.io, Render) ou adaptation Hono → Vercel Functions / Cloudflare Workers (le driver Neon serverless est déjà compatible edge).
- **DB** : Neon (branche `main` = prod, branches Neon par PR pour les previews).

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
- [x] Admin → Prospection : carnet restaurants / fournisseurs (nom, adresse, téléphone, e-mail, contact, statut, relance, import tableur)
- [x] Chantier 8 : fiabilité prod (Sentry sans SDK, `/statut`, job_runs, rate-limit, en-têtes, audit, RGPD export/suppression, CGV, migrations au déploiement, 12 tests e2e) — `docs/CHANTIER_8_FIABILITE.md`
- [x] Chantier 4 bis : e-mail quotidien « Votre matin AFRISUPPLY » + job cron (alertes → auto-reorder → mail) — `docs/CHANTIER_4BIS_NOTIFICATIONS.md`
