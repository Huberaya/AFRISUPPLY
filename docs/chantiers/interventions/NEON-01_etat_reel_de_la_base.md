# Fiche d'intervention NEON-01 — État réel de la base de production (lecture seule)

| | |
|---|---|
| Chantiers | P0.2-E (Neon et RLS), P0.4 (migrations), P0.2-A (traces du défaut critique) |
| Nature | **Lecture seule.** Aucune écriture, aucune modification du schéma, des données ou du journal des migrations |
| Qui | Le titulaire du compte Neon, accompagné par ChatGPT |
| Durée | 10 à 15 minutes |
| État | À réaliser — rien de ce qui suit n'a été exécuté |

## Pourquoi cette intervention

L'agent de développement n'a aucun accès à Neon. Tout ce qu'il sait de la base vient du dépôt
(29 fichiers de migration, 48 tables, **aucune politique RLS**, aucun rôle PostgreSQL déclaré).
Le dépôt ne prouve pas l'état de la base : une migration écrite n'est pas une migration appliquée,
et un rôle supposé n'est pas le rôle réellement utilisé. Cette fiche sert à constater les faits.

## Ce qu'on cherche à établir

1. Le rôle PostgreSQL utilisé par l'application et ses privilèges (super-utilisateur ? contourne la RLS ? propriétaire des tables ?).
2. Les migrations réellement appliquées (attendu : 29, la dernière étant `0028_clerk_auth`).
3. La présence ou non de RLS et de politiques, table par table (attendu d'après le dépôt : aucune).
4. Les traces d'usage de la route critique `clerk-sync` et l'état des liens Clerk déjà posés.
5. L'état de confirmation des adresses des exploitants (condition de leurs droits après la correction).
6. La région de la base (pour la comparer à la région des fonctions Vercel).
7. Le volume que la passe quotidienne doit traiter, et ce qu'elle a réellement laissé comme traces.
8. La protection des données par Neon lui-même (durée de l'historique restaurable) : aujourd'hui,
   c'est la **seule** sauvegarde — la page de statut de la production annonce « 0 fichier » de
   sauvegarde applicative.

## Vérifications préalables

- Être sur le **projet et la branche de production** dans la console Neon (le nom de la base attendu par l'application est celui de `DATABASE_URL` côté Vercel).
- Ouvrir l'éditeur SQL. Ne pas utiliser d'autre outil.
- Noter la **région** affichée par la console pour ce projet (elle ne se lit pas en SQL).
  Mesuré le 2026-11-12 depuis la production : environ 96 ms par requête SQL, fonctions en `iad1`
  (États-Unis). La région relevée ici décide de la région des fonctions (fiche VERCEL-01, point V11).
- Noter, dans la console (elles ne se lisent pas en SQL non plus) : l'**offre** du projet, et la durée
  de l'**historique restaurable** (Settings → Storage → « History retention », ou l'écran « Restore »).

## Opérations — à copier telles quelles, dans l'ordre

Tout le bloc s'exécute dans une transaction en lecture seule : si une instruction tentait d'écrire,
PostgreSQL la refuserait. La dernière ligne annule la transaction.

```sql
BEGIN;
SET TRANSACTION READ ONLY;

-- Q1. Qui parle à la base, avec quels privilèges ?
SELECT current_database() AS base, current_user AS role_courant, session_user AS role_de_session, version();
SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin
FROM pg_roles WHERE rolname NOT LIKE 'pg\_%' ORDER BY rolname;

-- Q2. Journal des migrations (attendu : 29 lignes ; dernière valeur de created_at : 1790054000000)
SELECT count(*) AS migrations_appliquees, max(created_at) AS derniere FROM drizzle.__drizzle_migrations;
SELECT id, left(hash, 16) AS debut_empreinte, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;

-- Q3. Tables, propriétaire, RLS (attendu d'après le dépôt : 48 tables, rls_active = false partout)
SELECT c.relname AS table_name, pg_get_userbyid(c.relowner) AS proprietaire,
       c.relrowsecurity AS rls_active, c.relforcerowsecurity AS rls_forcee
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1;

-- Q4. Politiques RLS (attendu d'après le dépôt : aucune ligne)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies ORDER BY 1, 2, 3;

-- Q5. Droits accordés sur les tables, par rôle
SELECT grantee, count(DISTINCT table_name) AS tables, string_agg(DISTINCT privilege_type, ', ' ORDER BY privilege_type) AS droits
FROM information_schema.role_table_grants WHERE table_schema = 'public' GROUP BY 1 ORDER BY 1;

-- Q6. Contraintes de la table des comptes (attendu : users_clerk_id_key, users_email_unique ou équivalent)
SELECT conname, contype FROM pg_constraint WHERE conrelid = 'public.users'::regclass ORDER BY 1;

-- Q7. Volumétrie — des comptages uniquement, aucune donnée personnelle
SELECT 'users' AS t, count(*) FROM users
UNION ALL SELECT 'restaurants', count(*) FROM restaurants
UNION ALL SELECT 'restaurant_members', count(*) FROM restaurant_members
UNION ALL SELECT 'vendors', count(*) FROM vendors
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'audit_log', count(*) FROM audit_log
UNION ALL SELECT 'job_runs', count(*) FROM job_runs
ORDER BY 1;

-- Q8. Liens Clerk déjà posés (la route corrigée refuse tout lien dont l'adresse ne correspond pas ;
--     ce comptage dit s'il y a des liens à examiner)
SELECT count(*) AS comptes,
       count(*) FILTER (WHERE clerk_id IS NOT NULL) AS relies_a_clerk,
       count(*) FILTER (WHERE clerk_id IS NOT NULL AND clerk_id NOT LIKE 'user\_%') AS identifiants_clerk_suspects,
       count(*) FILTER (WHERE clerk_id IS NOT NULL AND password_hash IS NOT NULL) AS relies_avec_mot_de_passe,
       count(*) FILTER (WHERE email_verified_at IS NULL) AS adresses_non_confirmees
FROM users;

-- Q9. Usage passé de la route clerk-sync (du 2026-09-23, date de sa mise en ligne, à aujourd'hui)
SELECT date_trunc('day', at) AS jour, count(*) AS appels,
       count(DISTINCT actor_email) AS comptes_distincts,
       count(DISTINCT meta->>'clerkId') AS identifiants_clerk_distincts
FROM audit_log WHERE action = 'auth.clerk_sync' GROUP BY 1 ORDER BY 1;
-- Détail, adresses masquées : un même compte ouvert avec plusieurs identifiants Clerk, ou un
-- identifiant qui ne commence pas par « user_ », est le signe d'un usage anormal.
SELECT at, left(actor_email, 2) || '***' || substring(actor_email from '@.*$') AS compte, meta->>'clerkId' AS identifiant_clerk
FROM audit_log WHERE action = 'auth.clerk_sync' ORDER BY at DESC LIMIT 200;

-- Q10. Exploitants : remplacer les adresses par celles de la variable ADMIN_EMAILS de Vercel.
--      Après la correction, les droits d'exploitant exigent adresse_confirmee = true.
SELECT left(email, 2) || '***' || substring(email from '@.*$') AS compte,
       email_verified_at IS NOT NULL AS adresse_confirmee, clerk_id IS NOT NULL AS relie_a_clerk,
       password_hash IS NOT NULL AS a_un_mot_de_passe, created_at, last_login_at
FROM users WHERE lower(email) = ANY (ARRAY['adresse1@exemple.fr', 'adresse2@exemple.fr']);

-- Q11. Tâches planifiées : derniers passages enregistrés
SELECT job, status, count(*) AS passages, max(finished_at) AS dernier FROM job_runs GROUP BY 1, 2 ORDER BY 1, 2;
SELECT job, status, started_at, duration_ms, left(coalesce(error, ''), 160) AS erreur FROM job_runs ORDER BY started_at DESC LIMIT 30;

-- Q12. Passe quotidienne : ce qu'elle doit traiter, et ses dernières traces
--      (mesure : environ 115 requêtes SQL par restaurant ; à 96 ms l'une, 11 secondes par restaurant)
SELECT count(*) AS restaurants,
       count(*) FILTER (WHERE subscription_status = 'trialing') AS en_essai,
       count(*) FILTER (WHERE subscription_status = 'active') AS abonnes,
       count(*) FILTER (WHERE created_at > now() - interval '30 days') AS crees_depuis_30_jours
FROM restaurants;
SELECT status, started_at, finished_at, duration_ms,
       summary->>'count' AS restaurants_traites, summary->>'sent' AS mails_envoyes, summary->>'errors' AS en_erreur,
       left(coalesce(error, ''), 200) AS erreur
FROM job_runs WHERE job = 'daily' ORDER BY started_at DESC LIMIT 10;

ROLLBACK;
```

Hors SQL, dans la console Neon :

- **Q13.** Offre du projet ; durée de l'historique restaurable ; date du dernier essai de restauration
  s'il y en a eu un (création d'une branche à partir d'un instant passé). Ne rien créer ni restaurer
  pendant cette intervention : on relève seulement les réglages.

## Risques

Aucun pour les données : la transaction est en lecture seule et annulée. Le seul risque est de
copier un résultat contenant une donnée personnelle dans un canal non maîtrisé — les requêtes
masquent les adresses e-mail pour l'éviter.

## Opérations interdites pendant cette intervention

- Toute instruction `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`.
- Toute modification de `drizzle.__drizzle_migrations`.
- La réinitialisation d'un mot de passe de rôle, la création ou la suppression d'une branche.
- La copie de la chaîne de connexion dans une conversation.

## Preuves attendues en retour

Pour chaque requête Q1 à Q12 : le tableau de résultat (copie texte ou capture), plus la région du
projet, son offre et la durée de l'historique restaurable (Q13).
Aucune valeur secrète n'est demandée.

## Comment le résultat sera vérifié et utilisé

| Résultat | Lecture | Suite |
|---|---|---|
| Q1 : `rolsuper` ou `rolbypassrls` vrai, ou rôle propriétaire des tables | L'application contourne toute RLS : une RLS écrite ne protégerait rien avec ce rôle | Décision d'architecture (voir ci-dessous) |
| Q2 : 29 lignes, dernière = 1790054000000 | Base à jour avec le code | Le contrôle au build passera |
| Q2 : moins de 29, ou valeurs inconnues | Base en retard ou historique divergent | Fiche NEON-02 (application d'une migration) à préparer **avant** tout déploiement |
| Q3/Q4 : aucune RLS, aucune politique | Conforme au dépôt : l'isolation repose sur le code seul | Décision d'architecture (voir ci-dessous) |
| Q8/Q9 : identifiants suspects ou comptes ouverts par plusieurs identifiants | La route critique a peut-être été utilisée | Fiche d'incident : comptes à vérifier, sessions à révoquer |
| Q10 : `adresse_confirmee = false` | L'exploitant perdra ses droits au déploiement de la correction | Confirmer son adresse (lien de confirmation) avant ou juste après le déploiement |
| Région ≠ région des fonctions (`iad1` = côte est des États-Unis) | Chaque requête SQL traverse la distance entre les deux | Régler la région des fonctions (VERCEL-01, V11) |
| Q12 : plus de 5 restaurants | Avec la latence actuelle, la passe ne tient pas dans une invocation de 60 s — ce qui explique l'absence de trace depuis le 2026-09-23 | La branche de correction découpe et reprend la passe ; la région règle la cause |
| Q12 : dernières lignes `daily` en `partial`, colonne `erreur` remplie | Des mails du matin sont refusés | Lire le motif dans la colonne `erreur`. Hypothèse à confirmer par ce motif : l'expéditeur d'essai `onboarding@resend.dev` (constaté sur la page de statut) ne délivre, d'après la documentation du prestataire, qu'à l'adresse du titulaire du compte Resend (voir « E-mails » dans le rapport de suivi) |
| Q13 : historique de quelques heures | Une erreur découverte le lendemain n'est plus rattrapable par Neon | Allonger l'historique (offre), et activer la copie hors site des sauvegardes (VERCEL-01, V12) |

## Décision d'architecture à instruire avec ChatGPT (RLS)

Aujourd'hui, le cloisonnement entre restaurants est assuré par le code de l'API et vérifié par les
tests (`apps/api/src/test/p0-cloisonnement.test.ts` : 1 491 tentatives croisées sans effet). Il n'y a
pas de seconde barrière dans la base. Deux options, à trancher après lecture de Q1 à Q5 :

- **A — rester sans RLS pour le pilote**, avec les tests de cloisonnement comme garde permanente en
  intégration continue. Risque résiduel : une future route qui oublierait le filtre par restaurant
  et que le balayage ne couvrirait pas.
- **B — ajouter la RLS en défense en profondeur.** Cela demande un rôle applicatif distinct du
  propriétaire des tables (sans `BYPASSRLS`), un contexte d'identité posé par requête
  (`SET LOCAL app.restaurant_id` dans une transaction) et la réécriture des accès hors restaurant
  (tâches planifiées, exploitant, grossistes). C'est un chantier à part entière (environ 45 tables,
  toutes les routes), à mener sur une branche Neon dédiée avant toute application en production.

L'agent ne déclarera aucune protection RLS « en place » tant que Q3 et Q4 ne l'auront pas montrée.
