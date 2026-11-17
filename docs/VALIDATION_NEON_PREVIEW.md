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

À compléter par la personne qui les a faits. L'agent ne les a pas retranscrits : il ne peut ni les
relire ni les vérifier sur Neon, et ne reporte pas ici un chiffre qu'il n'a pas sous les yeux.

| Date | Par qui | Branche ou projet | Relevé | Valeur |
|---|---|---|---|---|
| | | | | |

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
