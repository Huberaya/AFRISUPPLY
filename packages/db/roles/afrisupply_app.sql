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

-- Rien par défaut : on retire ce que « tout le monde » reçoit d'office sur le schéma et sur la base.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM afrisupply_app;
-- Tables temporaires : PostgreSQL en donne le droit à tous ; l'application n'en crée aucune.
DO $$
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('REVOKE CREATE ON DATABASE %I FROM afrisupply_app', current_database());
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
GRANT USAGE ON SCHEMA drizzle TO afrisupply_app;
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO afrisupply_app;

-- Tables créées plus tard par une migration (jouée par le rôle propriétaire) : mêmes droits, d'office.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO afrisupply_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO afrisupply_app;
