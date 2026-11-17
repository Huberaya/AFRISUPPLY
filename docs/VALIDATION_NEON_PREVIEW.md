# Neon : base de prévisualisation sans donnée réelle et rôle minimal — validation

| | |
|---|---|
| Date | 17 novembre 2026 |
| SHA contrôlé | arbre de `be6d05b86b99b34ddc3ab7592b7e3d6a0f80d3f6` complété par le commit qui porte ce fichier (à lire sur la demande de fusion n° 1) |
| Environnement des preuves | Base PostgreSQL embarquée (poste de l'agent et CI), données fictives. **Aucune preuve n'a été produite sur Neon** : l'agent n'y a aucun accès |
| Statut d'ensemble | **EN ATTENTE EXTERNE** |
| Écritures sur Neon | aucune ; aucune migration ajoutée ni exécutée |

Les statuts sont définis dans `VALIDATION_ETAT_INITIAL_FUSION.md`. La procédure détaillée, pas à pas,
reste celle de `docs/audits/LEVEE_RESERVES_NEON.md` (§ 7, fiche NEON-03, et § 8) : ce document-ci dit
où en est sa validation.

## 1. Ce qui est prouvé hors de Neon

| Point | Preuve | Statut |
|---|---|---|
| Le script de base neuve crée exactement le schéma des 29 migrations : tables, colonnes, types, index, contraintes | `apps/api/src/test/levee-blocages-role.test.ts` ; `npm run check:base-neuve` (CI) | PROUVÉ — base embarquée |
| Il ne contient aucune donnée, et refuse une base qui contient déjà des tables | même fichier de tests | PROUVÉ — base embarquée |
| Le rôle `afrisupply_app` : ni super-utilisateur, ni création de rôles, de bases, de tables ou de tables temporaires ; lecture et écriture de lignes sur les 48 tables ; journal des migrations en lecture seule | 12 tests, table par table | PROUVÉ — base embarquée |
| Toute l'API fonctionne avec ce seul rôle | suite complète de l'API rejouée sous le rôle (tâche CI « rôle minimal ») ; parcours du navigateur rejoué sous le rôle | PROUVÉ — base embarquée |
| Le schéma du code ne contient rien d'absent des migrations | `npm run check:schema` (CI), ajouté dans cette mission | PROUVÉ |
| L'outil de migration avait perdu son repère après la migration n° 28 | instantané ajouté (`VALIDATION_ETAT_INITIAL_FUSION.md`, § 5.2) | CORRIGÉ |
| Une prévisualisation ne lit jamais la base de production, et inversement | test « une base par environnement » (`levee-reserves-config.test.ts`) | PROUVÉ — test |
| Un build de prévisualisation ne migre rien sans demande explicite ; un build de production contrôle en lecture seule | `scripts/deploy-migrate.mjs` et ses tests | PROUVÉ — test |
| Nombre de migrations | 29 dans le code ; 29 relevées sur Neon le 13 novembre (relevé indépendant) | PROUVÉ à cette date |

## 2. Ce qui reste à constater sur Neon

| # | Point | Preuve attendue | Statut |
|---|---|---|---|
| 1 | Une base de prévisualisation **qui ne dérive pas de la production** existe | nom d'hôte différent de celui de la production ; projet ou branche créés vides | EN ATTENTE EXTERNE |
| 2 | Elle porte les 29 migrations et rien d'autre | `select count(*) from drizzle.__drizzle_migrations;` → 29 ; 48 tables dans `public`, 1 dans `drizzle` | EN ATTENTE EXTERNE |
| 3 | Elle ne contient aucune donnée réelle | compteurs à 0 avant le premier essai ; après les essais, aucune adresse hors du domaine `parcours.test` | EN ATTENTE EXTERNE |
| 4 | Le rôle `afrisupply_app` y est créé en SQL, avec les quatre attributs à `false` | requête de la fiche (§ 8, P4) | EN ATTENTE EXTERNE |
| 5 | La prévisualisation s'y connecte avec ce rôle | `GET <prévisualisation>/api/status/config` : `database.role = "afrisupply_app"`, `superuser`, `bypassRls`, `createRole`, `canCreateTables` à `false`, `migrations.state = "a_jour"`, `database.host` différent de la production | EN ATTENTE EXTERNE |
| 6 | L'ancienne branche Neon, copie de la production (96 comptes, 89 restaurants, 50 commandes au 13 novembre), n'est plus utilisée par aucun déploiement | variable `PREVIEW_DATABASE_URL` relue dans Vercel | EN ATTENTE EXTERNE |
| 7 | Sort de cette copie | décision du titulaire : la conserver, ou la supprimer. Tant qu'elle existe, elle contient des données personnelles | **BLOQUÉ** — décision |

## 3. Données d'essai : la procédure, sans aucune donnée réelle

Rien n'est copié depuis la production. Les données d'une prévisualisation propre viennent de trois sources, toutes fictives.

| Étape | Geste | Remarque |
|---|---|---|
| Schéma | Jouer `packages/db/sql/base_neuve.sql` avec le rôle propriétaire, dans la base vide | 29 migrations et leur journal ; aucune ligne dans les tables de l'application |
| Droits | Créer le rôle en SQL, puis jouer `packages/db/roles/afrisupply_app.sql` | Le fichier est rejouable |
| Données du parcours | Lancer le parcours du navigateur contre la prévisualisation (`VALIDATION_VERCEL_PREVIEW.md`, § 4) | Il crée lui-même ses comptes, restaurants, fournisseurs et commandes : adresses en `@parcours.test`, noms suffixés par l'heure du passage |
| Restaurant de démonstration (facultatif) | Depuis un poste, avec la chaîne de connexion de la prévisualisation : `npm run seed -w packages/db` | Données fictives, identifiants **publics** : à réserver à une prévisualisation protégée, jamais à la production. Non essayé sur Neon. Sur Vercel, la variable `SEED_DEMO` est sans effet : seul le serveur autonome la lit |
| Contrôle final | `select count(*) from users where email not like '%@parcours.test' and email not like '%@chezawa.fr';` → 0 | Toute autre réponse désigne une donnée qui ne vient pas des essais |

## 4. Relevés faits sur Neon après le 13 novembre

Relevés **déclarés par le titulaire le 17 novembre 2026**. L'agent n'a aucun accès à Neon : il les
retranscrit tels quels et ne les a ni relus ni vérifiés. Chacun reste à constater par la personne qui
dispose du tableau de bord (requêtes ci-dessous, sans aucune donnée personnelle dans le résultat).

| Date | Par qui | Branche ou projet | Relevé | Valeur |
|---|---|---|---|---|
| 17/11 | Titulaire (déclaré) | Projet `Afrisupply` `holy-hill-17097233`, `aws-eu-central-1`, PostgreSQL 18.7 | projet inchangé | déclaré |
| 17/11 | Titulaire (déclaré) | `preview-clean-20261117` = `br-mute-pond-b16h1clm`, point d'entrée `ep-bitter-pine-b1j8ghua`, parent `br-soft-snow-b1g7doab` | état `ready` ; 48 tables publiques à 0 ligne ; 29 migrations | déclaré |
| 17/11 | Titulaire (déclaré) | `br-summer-tree-b1xz2jon` (ancienne prévisualisation de la branche) | 48 tables publiques à 0 ligne ; 29 migrations conservées | déclaré |
| 17/11 | Titulaire (déclaré) | `br-soft-snow-b1g7doab` (production) | 96 comptes, 89 restaurants, 50 commandes ; 29 migrations ; aucune migration exécutée ; aucune écriture | déclaré |
| 17/11 | Titulaire (déclaré) | `vercel-dev` = `br-polished-rice-b1s02go9` | copie de la production (96 / 89 / 50) : **contient des données personnelles**, à ne pas nettoyer avant d'avoir établi quel projet Vercel l'utilise | déclaré |
| 17/11 | Titulaire (déclaré) | rôle `afrisupply_app` | **absent** ; `neondb_owner` a `BYPASSRLS = true` ; aucune RLS, aucune politique | déclaré |

Conséquence pour les conditions 10 et 11 : une base de prévisualisation propre **existe** (déclarée),
mais elle **dérive de la production** (parent `br-soft-snow-b1g7doab`) et le rôle minimal n'y est pas
encore installé. Les deux points restent EN ATTENTE EXTERNE tant que les requêtes ci-dessous n'ont pas
été jouées et leurs réponses rapportées.

## 4 bis. Installation du rôle minimal sur `br-mute-pond-b16h1clm` — commandes exactes

À jouer par le titulaire (ou l'intervenant Neon) **avec le rôle propriétaire** de la branche, jamais
sur la production. Aucun mot de passe ne figure ici et ne doit figurer dans aucune conversation.

**P1 — créer le rôle de connexion (SQL, et non la console : un rôle créé par la console reçoit des
privilèges étendus).** Le fichier `packages/db/roles/afrisupply_app.sql` crée le rôle sans connexion ;
pour un usage réel, le créer d'abord avec `LOGIN` et un mot de passe généré sur place :

```sql
CREATE ROLE afrisupply_app LOGIN PASSWORD '<généré sur place, jamais copié ici>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
```

**P2 — jouer le fichier de droits** (idempotent ; il retire aussi leurs privilèges à un rôle
préexistant qui en aurait trop, reprise P0-M) :

```bash
psql "<chaîne de connexion de br-mute-pond-b16h1clm, rôle propriétaire>" \
  -v ON_ERROR_STOP=1 -f packages/db/roles/afrisupply_app.sql
```

**P3 — constater les attributs du rôle** (les quatre premiers doivent être `false`) :

```sql
select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin
from pg_roles where rolname = 'afrisupply_app';
```

**P4 — constater les droits, table par table** (48 lignes attendues, toutes `r/w/d` à `true`,
et aucune table absente de la liste) :

```sql
select c.relname,
       has_table_privilege('afrisupply_app', c.oid, 'SELECT') as lecture,
       has_table_privilege('afrisupply_app', c.oid, 'INSERT') as insertion,
       has_table_privilege('afrisupply_app', c.oid, 'UPDATE') as modification,
       has_table_privilege('afrisupply_app', c.oid, 'DELETE') as suppression,
       has_table_privilege('afrisupply_app', c.oid, 'TRUNCATE') as troncature
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
```

**P5 — constater que rien d'autre n'est possible** (les trois requêtes doivent échouer) :

```sql
-- en tant qu'afrisupply_app :
create table essai_interdit (id int);            -- attendu : permission denied for schema public
truncate table restaurants;                      -- attendu : must be owner of table restaurants
select count(*) from drizzle.__drizzle_migrations;  -- attendu : 29 (lecture seule permise)
insert into drizzle.__drizzle_migrations (hash, created_at) values ('x', 0);  -- attendu : permission denied
```

**P6 — brancher la prévisualisation** : `PREVIEW_DATABASE_URL` en portée **Preview** avec ce rôle
(`VERCEL_MATRICE_ENVIRONNEMENTS.md`, § 3), puis `GET <prévisualisation>/api/status/config` :
`database.role = "afrisupply_app"`, `superuser`, `bypassRls`, `createRole`, `canCreateTables` à `false`,
`migrations.state = "a_jour"`, `database.host` différent de celui de la production.

## 5. Limites

- La base embarquée est un PostgreSQL à connexion unique. Sur Neon, l'application se connecte **en tant
  que** `afrisupply_app`, par un regroupement de connexions : c'est ce mode qui reste à constater.
- Les droits par défaut ne valent que pour les objets créés par le rôle qui a joué le fichier de droits.
  Si une migration future est jouée par un autre rôle, le fichier est à rejouer.
- Aucune politique de sécurité par ligne (RLS) : le cloisonnement entre restaurants est tenu par le code
  et par ses tests (1 491 essais d'accès croisé), non par la base. Chantier distinct.
- Le passage de la **production** au rôle minimal n'est pas un préalable à la fusion : il se décide
  après l'essai en prévisualisation.

## 6. Ce qui est demandé au titulaire et à l'intervenant Neon

| # | Geste | Responsable |
|---|---|---|
| 1 | Créer la base de prévisualisation vide (§ 2, points 1 à 4) | Intervenant Neon, sur accord du titulaire |
| 2 | Poser `PREVIEW_DATABASE_URL` en portée Preview, puis lire le diagnostic (point 5) | Titulaire |
| 3 | Décider du sort de la copie de la production (point 7) | Titulaire |
| 4 | Reporter les relevés au § 4 | Qui les a faits |

Interdits inchangés : aucune écriture sur la branche de production, aucune migration, aucun mot de
passe ni chaîne de connexion dans une conversation ou dans le dépôt. Une adresse ne se confirme que
par le lien reçu par e-mail, jamais par une écriture en base.
