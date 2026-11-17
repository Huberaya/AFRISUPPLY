-- =============================================================
-- AFRISUPPLY — rôle applicatif à privilèges minimaux (CANDIDAT — levée des réserves, chantier C)
--
-- CE FICHIER N'EST PAS UNE MIGRATION : il n'est dans aucun dossier lu par l'outil de migration et
-- n'est jamais exécuté automatiquement. Il se joue à la main, par le titulaire de la base, d'abord sur
-- la branche de prévisualisation (fiche NEON-03 de docs/audits/LEVEE_RESERVES_NEON.md).
--
-- Objet : l'application se connecte aujourd'hui avec le rôle propriétaire de la base, qui peut tout
-- (créer et supprimer des tables, contourner toute RLS). Ce rôle-ci ne peut que lire et écrire des
-- lignes dans les tables existantes : ni structure, ni rôles, ni contournement de RLS.
--
-- Le mot de passe n'est pas ici. Création du rôle de connexion, À FAIRE EN SQL (et non par la console
-- Neon : un rôle créé par la console reçoit des privilèges étendus) :
--     CREATE ROLE afrisupply_app LOGIN PASSWORD '<généré, jamais copié dans une conversation>'
--       NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
-- puis jouer ce fichier avec le rôle propriétaire. Le fichier est rejouable sans effet de bord.
-- =============================================================

-- Le rôle, s'il n'existe pas encore (sans connexion : les tests et un premier essai n'en ont pas besoin).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'afrisupply_app') THEN
    CREATE ROLE afrisupply_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;

-- Reprise P0-M : si le rôle existe déjà (par exemple créé par la console Neon, qui lui donne des
-- privilèges étendus), on retire ces privilèges au lieu de les laisser en place. Sans cette ligne,
-- un rôle préexistant SUPERUSER ou BYPASSRLS gardait ses pouvoirs après l'installation du fichier.
-- (LOGIN / NOLOGIN et le mot de passe ne sont pas touchés ici : voir l'en-tête.)
ALTER ROLE afrisupply_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT NOREPLICATION;

-- Rien par défaut : on retire ce que « tout le monde » reçoit d'office sur les schémas et sur la base.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM afrisupply_app;
-- Reprise P0-M : le schéma du journal des migrations reçoit la même discipline (avant : seul USAGE
-- était accordé, sans retirer un éventuel CREATE hérité de PUBLIC sur Neon). Gardé si le schéma
-- existe (base déjà migrée) : sur une base vide, il n'y a rien à retirer et le fichier reste rejouable.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
    EXECUTE 'REVOKE CREATE ON SCHEMA drizzle FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON SCHEMA drizzle FROM afrisupply_app';
  END IF;
END
$$;
-- Tables temporaires : PostgreSQL en donne le droit à tous ; l'application n'en crée aucune.
-- Reprise P0-M : CREATE sur la base (créer des schémas) est aussi retiré à PUBLIC, pas seulement au rôle.
DO $$
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('REVOKE CREATE ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('REVOKE CREATE ON DATABASE %I FROM afrisupply_app', current_database());
  -- Le rôle doit pouvoir se connecter à la base (CONNECT est donné à PUBLIC par défaut, mais on
  -- l'accorde explicitement pour ne pas dépendre des réglages par défaut de la plateforme).
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO afrisupply_app', current_database());
END
$$;

-- Séquences de numérotation (commandes AFS-…, factures AFR-…, litiges LIT-…). L'application les créait
-- elle-même à la première utilisation ; ce rôle ne peut rien créer, elles doivent donc exister d'avance.
-- Sans effet si elles existent déjà : leur compteur n'est pas touché.
CREATE SEQUENCE IF NOT EXISTS order_ref_seq;
CREATE SEQUENCE IF NOT EXISTS subscription_invoice_seq;
CREATE SEQUENCE IF NOT EXISTS claim_ref_seq;

-- Lire et écrire des lignes dans les tables de l'application, rien d'autre.
GRANT USAGE ON SCHEMA public TO afrisupply_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO afrisupply_app;
-- UPDATE sur une séquence = droit de la réaligner (setval) après la restauration d'une sauvegarde.
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO afrisupply_app;

-- Journal des migrations : lecture seule (l'application y lit l'état du schéma pour /api/status).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA drizzle TO afrisupply_app';
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO afrisupply_app';
  END IF;
END
$$;

-- Tables créées plus tard par une migration (jouée par le rôle propriétaire) : mêmes droits, d'office.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO afrisupply_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO afrisupply_app;
-- Reprise P0-M : même règle pour le schéma du journal (une table future y reste lisible, jamais inscriptible).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT SELECT ON TABLES TO afrisupply_app';
  END IF;
END
$$;
