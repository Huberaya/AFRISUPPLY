# Levée des réserves — Neon, rôle PostgreSQL, RLS (chantier C)

État au 13 novembre 2026, commit `6292ccb` et suivant. Aucun secret ni aucune donnée personnelle dans ce document.
L'agent n'a aucun accès à Neon : tout ce qui concerne la base réelle vient du relevé de ChatGPT ou
reste à relever (fiche NEON-03, § 7).

**Résumé.** Le code est cohérent avec la base relevée (29 migrations, aucune ajoutée). Un rôle
applicatif à privilèges minimaux est prêt et **prouvé sur les 658 tests de l'API** ; cet essai a
trouvé et corrigé une instruction de structure exécutée à chaque commande. L'absence de RLS est
justifiée pour la fusion, avec un plan en trois étapes. Trois constats du relevé pèsent sur la
fusion : aucune adresse confirmée (l'exploitant perdrait ses écrans d'administration), deux
événements `auth.clerk_sync` à qualifier, et une branche de prévisualisation dont le contenu est à vérifier.

## 1. Relevé indépendant (communiqué par ChatGPT, non relu par l'agent)

| Constat | Lecture pour la fusion |
|---|---|
| Projet `Afrisupply` (`holy-hill-17097233`), région `aws-eu-central-1` | Cohérent avec `vercel.json` (`fra1`, Francfort) |
| 29 migrations sur la branche de production, 29 sur la branche de prévisualisation | Égal au code candidat : le contrôle du build passera. **Aucune migration n'est ajoutée par la branche** |
| 0 table sous RLS, 0 politique | Conforme au dépôt (§ 5) |
| Rôle `neondb_owner` avec `BYPASSRLS` ; aucun rôle applicatif | L'application peut tout sur la base (§ 3 et § 4) |
| 96 utilisateurs, 0 relié à Clerk | Couper Clerk en production ne touche personne |
| **0 utilisateur avec adresse confirmée** | **L'exploitant perdrait ses écrans d'administration au déploiement** (§ 6.1) |
| 2 événements `auth.clerk_sync` au journal d'audit | La route critique a servi deux fois : à qualifier (§ 6.2) |

## 2. Ce que le code attend de la base

- **Connexion** : `DATABASE_URL` en production, `PREVIEW_DATABASE_URL` sur une prévisualisation (jamais l'autre). Le rôle PostgreSQL est celui de la chaîne de connexion ; le code n'en change pas.
- **Migrations** : 29, journal dans `drizzle.__drizzle_migrations`. Au build de production : contrôle en lecture seule, échec si la base est en retard. Rien n'est appliqué sans `MIGRATE_ON_BUILD=apply`. Sur Vercel, l'application n'applique aucune migration à l'exécution.
- **Transactions** : pilote `@neondatabase/serverless` (connexions mutualisées). Deux chemins seulement ouvrent une transaction (verrou de la passe quotidienne, réception d'une livraison).

## 3. Privilèges réellement nécessaires

| Besoin | Privilège | Qui en a besoin |
|---|---|---|
| Lire et écrire des lignes dans les 48 tables | `SELECT, INSERT, UPDATE, DELETE` | Toute l'application, tâches planifiées comprises |
| Numéros de commande, de facture, de litige | `USAGE, SELECT, UPDATE` sur trois séquences | Commandes, abonnements, litiges ; `UPDATE` sert à réaligner après une restauration |
| État du schéma | `SELECT` sur `drizzle.__drizzle_migrations` | `/api/status`, contrôle du build |
| Verrou de la passe quotidienne | aucun privilège particulier | Passe quotidienne |
| Créer ou modifier des tables | propriétaire | **Migrations uniquement** — jamais l'application |
| Contourner la RLS, créer des rôles | — | **Personne** |

**Défaut trouvé en établissant ce tableau.** Chaque commande, facture d'abonnement et litige
exécutait `create sequence if not exists` avant de tirer son numéro : une instruction de structure à
chaque numéro. Avec un rôle limité, 70 tests échouaient (« permission denied for schema public »).
Corrigé : la séquence n'est créée que si elle manque (`apps/api/src/lib/reference.ts`). Effet
secondaire : une requête SQL de moins par commande.

## 4. Rôle applicatif à privilèges minimaux — candidat, prouvé hors de Neon

`packages/db/roles/afrisupply_app.sql` — **ce n'est pas une migration** ; il n'est jamais exécuté
automatiquement. Il crée les trois séquences si elles manquent et donne au rôle `afrisupply_app`
les seuls privilèges du § 3.

| Preuve | Résultat |
|---|---|
| Suite complète de l'API rejouée avec ce rôle (`AFS_DB_MINIMAL_ROLE=true npm test -w apps/api`) | 658 tests réussis sur 658 |
| Avant la correction du § 3, même commande | 70 échecs — l'essai détecte bien un besoin de structure |
| Ce que le rôle ne peut pas faire (testé) | créer, modifier, supprimer ou vider une table ; créer une séquence ou un rôle ; activer la RLS ; écrire dans le journal des migrations |
| Intégration continue | tâche « API sous le rôle PostgreSQL minimal » ; le parcours du navigateur tourne aussi avec ce rôle |

Limite : la preuve est faite sur la base PostgreSQL embarquée des tests, pas sur Neon. Elle établit
ce que l'application demande à la base ; elle ne dit rien des réglages propres à Neon.

## 5. Isolation et RLS

**Aujourd'hui.** L'isolation entre restaurants et entre grossistes est assurée par le code : chaque
requête est filtrée par l'identifiant tiré de la session. Preuves : `p0-cloisonnement.test.ts`
(22 tests, 1 491 essais croisés, tâches planifiées comprises) et `p0-roles.test.ts` (79 tests).

**Tables concernées** (48 au total) :

| Famille | Nombre | Tables |
|---|---|---|
| Portent `restaurant_id` | 28 | `restaurant_members`, `products`, `suppliers`, `supplier_offers`, `price_history`, `inventory_items`, `stock_movements`, `orders`, `deliveries`, `recipes`, `sales`, `alerts`, `reorder_rules`, `forecasts`, `forecast_events`, `leads`, `group_buy_participations`, `billing_events`, `subscription_invoices`, `feedback`, `usage_events`, `shopping_lists`, `notifications`, `recurring_orders`, `claims`, `vendor_customer_prices`, `vendor_reviews`, `vendor_credit_terms` |
| Portent `vendor_id` seul | 6 | `vendor_members`, `vendor_offers`, `group_buys`, `commissions`, `commission_invoices`, `vendor_routes` |
| Rattachées par une table parente | 5 | `order_lines`, `order_events` (commande), `delivery_discrepancies` (livraison), `recipe_ingredients` (recette), `vendor_price_tiers` (offre) |
| Comptes et jetons | 3 | `users`, `email_verifications`, `password_resets` |
| Racines et plateforme | 6 | `restaurants`, `vendors`, `prospects`, `rate_limits`, `job_runs`, `audit_log` |

Huit tables de la première famille portent aussi `vendor_id` (relation restaurant–grossiste) :
`suppliers`, `orders`, `notifications`, `recurring_orders`, `claims`, `vendor_customer_prices`,
`vendor_reviews`, `vendor_credit_terms`.

**Pourquoi pas de RLS avant la fusion.**

1. Avec le rôle actuel (propriétaire, `BYPASSRLS`), une politique RLS ne s'appliquerait pas : elle serait décorative. Le rôle minimal est le préalable.
2. Une politique par restaurant suppose que la base connaisse le restaurant de la requête, donc que chaque requête HTTP s'exécute dans une transaction qui porte ce réglage. Deux chemins seulement le font aujourd'hui : c'est une reprise de l'accès aux données de 24 fichiers de routes et des tâches planifiées, qui parcourent tous les restaurants.
3. Une politique fausse rend des lignes invisibles : c'est une panne. Ce n'est pas un changement à joindre à une correction de sécurité urgente.

**Plan proposé.** (1) Rôle minimal sur la prévisualisation, puis en production sur décision.
(2) RLS en seconde barrière sur les 28 tables à `restaurant_id`, la suite de cloisonnement servant
de porte. (3) Tables rattachées et tables des grossistes, puis `FORCE ROW LEVEL SECURITY`.

**Décision demandée** : accepter la fusion sans RLS, l'isolation restant assurée et prouvée au niveau du code.

## 6. Trois constats qui pèsent sur la fusion

### 6.1 Aucune adresse confirmée : l'exploitant perdrait ses écrans d'administration

La branche n'accorde les droits d'exploitant qu'à une adresse **confirmée** (correction du défaut
R009). Avec 0 adresse confirmée, l'exploitant garde son espace mais perd les écrans
d'administration au déploiement — dont l'écran « Exploitation », utile ce jour-là.

À faire **avant** la fusion, dans la production actuelle (la fonction y existe déjà) : l'exploitant
se connecte, clique « Renvoyer le lien » dans le bandeau de confirmation, puis ouvre le lien reçu.

Risque : l'e-mail n'arrivera vraisemblablement pas tant que l'envoi n'est pas rétabli. La production envoie depuis l'adresse d'essai du prestataire
(`onboarding@resend.dev`), qui ne remet qu'au titulaire du compte du prestataire. C'est l'explication
la plus probable des 0 adresses confirmées, de la tâche d'alertes en erreur et des passes
quotidiennes « partielles » — **à confirmer** par les lectures N5 et N6. Solution : `RESEND_DIAGNOSTIC.md`, § 5. Il n'existe pas d'autre voie : confirmer une adresse par une écriture en base est interdit.

### 6.2 Deux événements `auth.clerk_sync`

La route critique a été appelée deux fois avec succès. Soit ce sont des essais du titulaire, soit
c'est un usage du défaut. Lecture N4. Quelle que soit la réponse : changer `JWT_SECRET` au moment du
déploiement invalide toutes les sessions existantes, y compris une session obtenue par ce défaut
(décision du titulaire ; chacun devra se reconnecter).

### 6.3 Contenu de la branche de prévisualisation

Une branche Neon est par défaut une copie de sa branche d'origine. Si la branche de prévisualisation
a été tirée de la production, elle contient les 96 comptes réels : toute prévisualisation
travaillerait sur une copie de données personnelles. Lecture N8.

## 7. Fiche d'intervention NEON-03 — pour ChatGPT

| | |
|---|---|
| Objet | Confirmer le relevé, qualifier les trois constats du § 6, essayer le rôle minimal sur la prévisualisation |
| Nature | Lectures (N1 à N10), puis opérations sur la **branche de prévisualisation uniquement** (O1, O2) |
| Interdits | Toute écriture sur la branche de production ; toute migration ; coller un mot de passe, une chaîne de connexion ou une adresse e-mail dans une conversation ou dans le dépôt |

**Lectures (aucune écriture)**

| # | Où | Requête ou relevé | Attendu, et ce que cela décide |
|---|---|---|---|
| N1 | Console Neon | Nom d'hôte du point d'accès (`ep-…`) de la branche de production et de la branche de prévisualisation | À comparer à `database.host` du diagnostic `GET /api/status/config` : c'est l'identification formelle de la base de chaque environnement |
| N2 | Les deux branches | `select count(*) from drizzle.__drizzle_migrations;` | 29 et 29 |
| N3 | Avec la chaîne de connexion de l'application | `select current_user, rolsuper, rolbypassrls, rolcreaterole from pg_roles where rolname = current_user;` | Rôle réellement utilisé |
| N4 | Production | `select at, action, target, meta - 'ip' as meta from audit_log where action like 'auth.clerk_sync%' order by at;` puis, pour chaque `target` : `select created_at, last_login_at, clerk_id is not null as relie from users where id = '<target>';` | Dates et comptes reconnus par le titulaire : essais. Sinon : incident, comptes à examiner |
| N5 | Production | `select action, meta->>'transport' as transport, meta->>'delivered' as remis, count(*) from audit_log where action like 'email.verif%' group by 1,2,3 order by 1;` | Des envois « remis = false » ou aucune ligne `email.verified` : la remise des e-mails ne fonctionne pas |
| N6 | Production | `select job, status, started_at, duration_ms, left(error, 300) as erreur from job_runs order by started_at desc limit 20;` | Le motif exact de l'échec des alertes et des passes partielles |
| N7 | Production | `select email_verified_at is not null as adresse_confirmee, last_login_at from users where lower(email) = lower('<adresse de l''exploitant>');` | Doit valoir `true` avant la fusion |
| N8 | Prévisualisation | `select (select count(*) from users) as comptes, (select count(*) from restaurants) as restaurants, (select count(*) from orders) as commandes;` | Si ce sont les chiffres de la production : la remplacer par une branche sans données, ou la purger |
| N9 | Production | `select sequencename, last_value from pg_sequences where schemaname = 'public';` | Lesquelles des trois séquences existent déjà |
| N10 | Console Neon | Durée de conservation de l'historique (restauration à un instant donné) | C'est aujourd'hui la seule sauvegarde de la production |

**Opérations sur la branche de prévisualisation (après accord)**

- **O1 — rôle minimal.** En SQL (pas par la console : un rôle créé par la console reçoit des privilèges étendus) : `CREATE ROLE afrisupply_app LOGIN PASSWORD '<généré>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;` puis jouer `packages/db/roles/afrisupply_app.sql` avec le rôle propriétaire.
- **O2 — brancher la prévisualisation dessus.** `PREVIEW_DATABASE_URL` (portée Preview) = chaîne de connexion de la branche de prévisualisation avec ce rôle. Ne pas poser `MIGRATE_ON_BUILD=apply` : ce rôle ne peut pas migrer, et la branche est déjà à 29.
- **Preuves** : `GET <prévisualisation>/api/status/config` → `database.role = "afrisupply_app"`, `superuser: false`, `bypassRls: false`, `canCreateTables: false`, `migrations.state = "a_jour"` ; puis le parcours du navigateur sur la prévisualisation.

**Aucune écriture sur la production.** Une version précédente de cette fiche proposait, en dernier
recours, de confirmer l'adresse de l'exploitant par une écriture en base (opération O3). **Elle est
retirée** : une adresse ne se confirme que par le lien reçu par e-mail. Si l'e-mail n'arrive pas, c'est
l'envoi qu'il faut rétablir (`RESEND_DIAGNOSTIC.md`).

Le passage de la **production** au rôle minimal n'est pas un préalable à la fusion : il se décide après l'essai sur la prévisualisation.

## 8. Prévisualisation propre (mise à jour du 13 novembre — chantier P0-B)

**Relevé indépendant** : la branche de prévisualisation actuelle est une copie de la production
(96 comptes, 89 restaurants, 50 commandes, 29 migrations de part et d'autre). Elle contient donc des
données personnelles réelles. **Plus aucun essai ne doit y être fait.** Elle n'est ni purgée ni supprimée sans décision.

**48 tables dans le code, 49 sur Neon.** La 49e est le journal des migrations (`drizzle.__drizzle_migrations`),
hors du schéma `public`. À confirmer par : `select table_schema, count(*) from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema') group by 1;` — attendu : `public` 48, `drizzle` 1. Toute autre réponse désigne une table inconnue du code, à signaler.

| # | Geste (console Neon, ChatGPT) | Contrôle |
|---|---|---|
| P1 | Créer une base **vide qui ne dérive pas de la production** : de préférence un projet Neon distinct ; à défaut une branche « schéma seul » si l'offre la propose. Ne pas vider la branche copiée : ses données resteraient dans son historique | Le nom d'hôte diffère de celui de la production |
| P2 | Éditeur SQL, rôle propriétaire : jouer `packages/db/sql/base_neuve.sql` (les 29 migrations et leur journal, aucune donnée ; il refuse une base qui contient déjà des tables) | `select count(*) from drizzle.__drizzle_migrations;` → 29 |
| P3 | Vérifier qu'elle est vide | `select (select count(*) from users) + (select count(*) from restaurants) + (select count(*) from orders) + (select count(*) from audit_log);` → 0 |
| P4 | Créer le rôle en SQL (§ 7, O1), puis jouer `packages/db/roles/afrisupply_app.sql` | `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb from pg_roles where rolname = 'afrisupply_app';` → quatre fois `false` |
| P5 | `PREVIEW_DATABASE_URL`, portée Preview uniquement : cette base, ce rôle. Redéployer la prévisualisation | — |
| P6 | Lire `GET <prévisualisation>/api/status/config` | `database.role = "afrisupply_app"`, `superuser`, `bypassRls`, `createRole`, `canCreateTables` à `false`, `migrations.state = "a_jour"`, `database.host` ≠ production |
| P7 | Parcours du navigateur sur la prévisualisation (données fictives en `@parcours.test`) | Ensuite : `select count(*) from users where email not like '%@parcours.test';` → 0 |

Ce qui est prouvé hors de Neon : le fichier de base neuve produit exactement le schéma de l'outil de
migration (colonnes, index, contraintes et types comparés), et les privilèges du rôle sont couverts
table par table (`apps/api/src/test/levee-blocages-role.test.ts`, 12 tests). **Sur Neon : EN ATTENTE EXTERNE.**
