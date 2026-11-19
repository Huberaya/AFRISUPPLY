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
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO afrisupply_app;
-- DELETE est refusé par défaut ; seules les tables avec suppression physique métier le reçoivent.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['forecast_events', 'group_buy_participations', 'inventory_items', 'order_lines', 'products', 'prospects', 'rate_limits', 'recipe_ingredients', 'recipes', 'recurring_orders', 'reorder_rules', 'restaurant_members', 'restaurants', 'shopping_lists', 'supplier_offers', 'users', 'vendor_customer_prices', 'vendor_offers', 'vendor_price_tiers', 'vendor_routes']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname = t) THEN
      EXECUTE format('GRANT DELETE ON TABLE public.%I TO afrisupply_app', t);
    END IF;
  END LOOP;
  -- Retirer explicitement DELETE de toutes les autres tables déjà présentes, y compris celles créées
  -- avant cette version du script. Les 20 tables ci-dessus sont ensuite ré-autorisées.
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
             AND c.relname <> ALL (ARRAY['forecast_events', 'group_buy_participations', 'inventory_items', 'order_lines', 'products', 'prospects', 'rate_limits', 'recipe_ingredients', 'recipes', 'recurring_orders', 'reorder_rules', 'restaurant_members', 'restaurants', 'shopping_lists', 'supplier_offers', 'users', 'vendor_customer_prices', 'vendor_offers', 'vendor_price_tiers', 'vendor_routes'])
  LOOP
    EXECUTE format('REVOKE DELETE ON TABLE public.%I FROM afrisupply_app', t);
  END LOOP;
END
$$;
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
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO afrisupply_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM afrisupply_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO afrisupply_app;
-- Reprise P0-M : même règle pour le schéma du journal (une table future y reste lisible, jamais inscriptible).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT SELECT ON TABLES TO afrisupply_app';
  END IF;
END
$$;

-- =============================================================
-- Journaux immuables — audit des privilèges (reprise P0-M, 17 novembre)
--
-- Constat : le droit d'écrire des lignes était accordé en bloc sur les 48 tables. Le rôle applicatif
-- pouvait donc MODIFIER et SUPPRIMER une trace d'audit, un historique de prix, un mouvement de stock :
-- exactement ce qu'un journal est censé rendre impossible. Un jeton volé, ou une requête maladroite,
-- suffisait à effacer la piste.
--
-- Ce que le code fait réellement de ces tables (relevé sur toutes les sources hors tests) :
--   audit_log        1 insertion (lib/ops.ts), 4 lectures — aucune modification, aucune suppression
--   price_history    9 insertions simples — aucune modification, aucune suppression
--   stock_movements  7 insertions simples — aucune modification, aucune suppression
--   order_events     1 insertion simple  — aucune modification, aucune suppression
--   usage_events     1 insertion simple  — aucune modification, aucune suppression
--   forecasts        1 insertion simple  — aucune modification, aucune suppression
-- Elles ne reçoivent donc que SELECT et INSERT : lire et ajouter, jamais réécrire ni effacer.
--
-- Deux tables à part : `sales` et `vendor_credit_terms` sont écrites par un UPSERT
-- (« INSERT … ON CONFLICT DO UPDATE », qui exige le droit UPDATE) mais ne sont jamais supprimées par
-- l'application. On leur retire DELETE et on leur laisse UPDATE.
--
-- Piège évité : retirer UPDATE à une table écrite par UPSERT la casse. Le relevé ci-dessus distingue
-- les insertions simples des UPSERT ; `sales` en est un (routes/intelligence.ts, routes/quick.ts).
--
-- Le bloc est rejouable et sans effet sur une base où ces tables n'existent pas encore.
-- =============================================================
DO $$
DECLARE
  t text;
BEGIN
  -- Journaux : lire et ajouter, rien d'autre.
  FOREACH t IN ARRAY ARRAY['audit_log', 'price_history', 'stock_movements', 'order_events', 'usage_events', 'forecasts']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = t) THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON TABLE public.%I FROM afrisupply_app', t);
      EXECUTE format('REVOKE UPDATE, DELETE ON TABLE public.%I FROM PUBLIC', t);
    END IF;
  END LOOP;

  -- UPSERT : UPDATE reste nécessaire, DELETE ne l'est pas.
  FOREACH t IN ARRAY ARRAY['sales', 'vendor_credit_terms']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = t) THEN
      EXECUTE format('REVOKE DELETE ON TABLE public.%I FROM afrisupply_app', t);
      EXECUTE format('REVOKE DELETE ON TABLE public.%I FROM PUBLIC', t);
    END IF;
  END LOOP;
END
$$;
