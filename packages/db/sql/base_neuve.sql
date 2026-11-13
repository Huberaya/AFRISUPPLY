-- =============================================================
-- AFRISUPPLY — base neuve : 29 migrations et leur journal (dernière : 0028_clerk_auth)
-- FICHIER GÉNÉRÉ par scripts/base-neuve.mjs — ne pas modifier à la main.
--
-- À jouer UNE fois, avec le rôle propriétaire, sur une base VIDE (base de test, prévisualisation).
-- Il ne contient aucune donnée. Il refuse de s'appliquer à une base qui contient déjà des tables.
-- Ce n'est pas une migration : rien ne l'exécute automatiquement.
-- =============================================================
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema IN ('public', 'drizzle')) THEN
    RAISE EXCEPTION 'Cette base contient déjà des tables : ce script ne s''applique qu''à une base neuve.';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);

-- ---------- 01/29 · 0000_init ----------
CREATE TYPE "public"."alert_kind" AS ENUM('rupture', 'stock_bas', 'hausse_prix', 'opportunite', 'fournisseur', 'ecart_livraison');
CREATE TYPE "public"."alert_severity" AS ENUM('red', 'orange', 'green', 'blue');
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager', 'staff');
CREATE TYPE "public"."movement_type" AS ENUM('reception', 'consommation', 'ajustement', 'perte');
CREATE TYPE "public"."order_channel" AS ENUM('email', 'whatsapp', 'telephone', 'plateforme');
CREATE TYPE "public"."order_status" AS ENUM('brouillon', 'preparee', 'envoyee', 'confirmee', 'livree_partiel', 'livree', 'annulee');
CREATE TYPE "public"."plan" AS ENUM('trial', 'starter', 'pro', 'business');
CREATE TYPE "public"."product_category" AS ENUM('feculents', 'frais', 'viandes_poissons', 'epicerie', 'boissons', 'emballages');
CREATE TYPE "public"."unit" AS ENUM('kg', 'g', 'L', 'mL', 'piece', 'botte', 'sac', 'carton');
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"product_id" uuid,
	"supplier_id" uuid,
	"action_url" text,
	"payload" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by" uuid,
	"is_late" boolean DEFAULT false NOT NULL,
	"has_discrepancy" boolean DEFAULT false NOT NULL,
	"invoice_url" text,
	"notes" text
);
CREATE TABLE "delivery_discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"ordered_qty" numeric(12, 3) NOT NULL,
	"received_qty" numeric(12, 3) NOT NULL,
	"reason" text,
	"claim_message" text,
	"resolved" boolean DEFAULT false NOT NULL
);
CREATE TABLE "forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"horizon_days" integer NOT NULL,
	"predicted_need" numeric(12, 3) NOT NULL,
	"current_stock" numeric(12, 3) NOT NULL,
	"recommended_order" numeric(12, 3) NOT NULL,
	"days_of_stock_left" numeric(6, 1),
	"confidence" numeric(3, 2),
	"explanation" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"critical_level" numeric(12, 3) DEFAULT '0' NOT NULL,
	"target_level" numeric(12, 3),
	"avg_daily_use" numeric(12, 3),
	"preferred_supplier_id" uuid,
	"last_counted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"offer_id" uuid,
	"pack_label" text,
	"packs" integer NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price_eur" numeric(10, 4) NOT NULL,
	"line_total_eur" numeric(10, 2) NOT NULL,
	"received_qty" numeric(12, 3)
);
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"status" "order_status" DEFAULT 'brouillon' NOT NULL,
	"channel" "order_channel" DEFAULT 'whatsapp' NOT NULL,
	"expected_at" date,
	"total_eur" numeric(10, 2) DEFAULT '0' NOT NULL,
	"delivery_fee_eur" numeric(10, 2) DEFAULT '0' NOT NULL,
	"source" text DEFAULT 'manuel' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"unit_price_eur" numeric(10, 4) NOT NULL,
	"source" text DEFAULT 'manuel' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"category" "product_category" NOT NULL,
	"base_unit" "unit" NOT NULL,
	"origin" text,
	"shelf_life_days" integer,
	"seasonality" text,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(12, 4) NOT NULL
);
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"selling_price_eur" numeric(10, 2),
	"target_margin_pct" numeric(5, 2) DEFAULT '70',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "reorder_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"threshold" numeric(12, 3) NOT NULL,
	"reorder_qty" numeric(12, 3) NOT NULL,
	"supplier_strategy" text DEFAULT 'best' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "restaurant_members" (
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"city" text,
	"postal_code" text,
	"address" text,
	"cuisine" text,
	"covers_per_day" integer,
	"plan" "plan" DEFAULT 'trial' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug")
);
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"day" date NOT NULL,
	"portions" integer NOT NULL
);
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"type" "movement_type" NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_cost_eur" numeric(10, 4),
	"order_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "supplier_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"pack_label" text NOT NULL,
	"pack_qty" numeric(10, 3) NOT NULL,
	"pack_price_eur" numeric(10, 2) NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"city" text,
	"categories" "product_category"[] DEFAULT '{}'::product_category[] NOT NULL,
	"lead_time_hours" integer DEFAULT 48 NOT NULL,
	"delivery_days" integer[] DEFAULT '{1,2,3,4,5}'::int[] NOT NULL,
	"min_order_eur" numeric(10, 2) DEFAULT '0' NOT NULL,
	"delivery_fee_eur" numeric(10, 2) DEFAULT '0' NOT NULL,
	"preferred_channel" "order_channel" DEFAULT 'whatsapp' NOT NULL,
	"rating" numeric(2, 1),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "delivery_discrepancies" ADD CONSTRAINT "delivery_discrepancies_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_discrepancies" ADD CONSTRAINT "delivery_discrepancies_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_preferred_supplier_id_suppliers_id_fk" FOREIGN KEY ("preferred_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_offer_id_supplier_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."supplier_offers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_offer_id_supplier_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."supplier_offers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "products" ADD CONSTRAINT "products_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reorder_rules" ADD CONSTRAINT "reorder_rules_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reorder_rules" ADD CONSTRAINT "reorder_rules_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "restaurant_members" ADD CONSTRAINT "restaurant_members_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "restaurant_members" ADD CONSTRAINT "restaurant_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sales" ADD CONSTRAINT "sales_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sales" ADD CONSTRAINT "sales_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "alerts_dedupe" ON "alerts" USING btree ("restaurant_id","dedupe_key");
CREATE INDEX "forecasts_restaurant_idx" ON "forecasts" USING btree ("restaurant_id","computed_at");
CREATE UNIQUE INDEX "inventory_unique" ON "inventory_items" USING btree ("restaurant_id","product_id");
CREATE INDEX "orders_restaurant_idx" ON "orders" USING btree ("restaurant_id","created_at");
CREATE UNIQUE INDEX "orders_ref" ON "orders" USING btree ("reference");
CREATE INDEX "price_history_offer_idx" ON "price_history" USING btree ("offer_id","recorded_at");
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");
CREATE INDEX "products_restaurant_idx" ON "products" USING btree ("restaurant_id");
CREATE UNIQUE INDEX "recipe_ing_unique" ON "recipe_ingredients" USING btree ("recipe_id","product_id");
CREATE INDEX "recipes_restaurant_idx" ON "recipes" USING btree ("restaurant_id");
CREATE UNIQUE INDEX "reorder_rules_unique" ON "reorder_rules" USING btree ("inventory_item_id");
CREATE UNIQUE INDEX "restaurant_members_pk" ON "restaurant_members" USING btree ("restaurant_id","user_id");
CREATE UNIQUE INDEX "sales_unique" ON "sales" USING btree ("restaurant_id","recipe_id","day");
CREATE INDEX "movements_item_idx" ON "stock_movements" USING btree ("inventory_item_id","created_at");
CREATE INDEX "offers_restaurant_idx" ON "supplier_offers" USING btree ("restaurant_id");
CREATE INDEX "offers_product_idx" ON "supplier_offers" USING btree ("product_id");
CREATE UNIQUE INDEX "offers_unique" ON "supplier_offers" USING btree ("supplier_id","product_id","pack_label");
CREATE INDEX "suppliers_restaurant_idx" ON "suppliers" USING btree ("restaurant_id");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('ac27d590f325313bb32ed65eafd3c1f2a7fafacded23baebf683ae0bb3ff3607', 1789726217155);

-- ---------- 02/29 · 0001_leads ----------
CREATE TYPE "public"."lead_status" AS ENUM('nouveau', 'contacte', 'demo', 'pilote', 'client', 'perdu');
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"city" text,
	"cuisine" text,
	"covers_per_day" integer,
	"message" text,
	"plan_interest" text,
	"source" text DEFAULT 'site' NOT NULL,
	"utm" jsonb,
	"status" "lead_status" DEFAULT 'nouveau' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('bcf5523a7368536f8e6813b72200971f4dba97da71d65e6e4508cc2e6dce5402', 1789736365004);

-- ---------- 03/29 · 0002_ops ----------
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_email" text,
	"action" text NOT NULL,
	"target" text,
	"meta" jsonb
);
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"summary" jsonb,
	"error" text
);
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job","started_at");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('4947b04ec3e4c69e71c3e1f8a9e0f70feaed5a9dc6b93ab317788fc1c94e550b', 1789747199683);

-- ---------- 04/29 · 0003_marketplace ----------
CREATE TYPE "public"."group_buy_status" AS ENUM('ouvert', 'atteint', 'cloture', 'annule');
CREATE TYPE "public"."vendor_status" AS ENUM('en_attente', 'actif', 'suspendu');
CREATE TABLE "commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_total_eur" numeric(10, 2) NOT NULL,
	"pct" numeric(4, 2) NOT NULL,
	"amount_eur" numeric(10, 2) NOT NULL,
	"period" text NOT NULL,
	"invoiced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commissions_order_id_unique" UNIQUE("order_id")
);
CREATE TABLE "group_buy_participations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_buy_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"packs" integer NOT NULL,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "group_buys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"vendor_offer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"zone" text NOT NULL,
	"target_packs" integer NOT NULL,
	"discount_pct" numeric(4, 2) NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"delivery_date" date,
	"status" "group_buy_status" DEFAULT 'ouvert' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "vendor_members" (
	"vendor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_members_vendor_id_user_id_pk" PRIMARY KEY("vendor_id","user_id")
);
CREATE TABLE "vendor_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"pack_label" text NOT NULL,
	"pack_qty" numeric(10, 3) NOT NULL,
	"pack_price_eur" numeric(10, 2) NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"city" text,
	"delivery_zones" text[] DEFAULT '{}'::text[] NOT NULL,
	"categories" "product_category"[] DEFAULT '{}'::product_category[] NOT NULL,
	"lead_time_hours" integer DEFAULT 48 NOT NULL,
	"delivery_days" integer[] DEFAULT '{1,2,3,4,5}'::int[] NOT NULL,
	"min_order_eur" numeric(10, 2) DEFAULT '0' NOT NULL,
	"delivery_fee_eur" numeric(10, 2) DEFAULT '0' NOT NULL,
	"commission_pct" numeric(4, 2) DEFAULT '3.00' NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"whatsapp" text,
	"status" "vendor_status" DEFAULT 'en_attente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_slug_unique" UNIQUE("slug")
);
ALTER TABLE "orders" ADD COLUMN "vendor_id" uuid;
ALTER TABLE "orders" ADD COLUMN "vendor_decision_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "vendor_note" text;
ALTER TABLE "suppliers" ADD COLUMN "vendor_id" uuid;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_buy_participations" ADD CONSTRAINT "group_buy_participations_group_buy_id_group_buys_id_fk" FOREIGN KEY ("group_buy_id") REFERENCES "public"."group_buys"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_buy_participations" ADD CONSTRAINT "group_buy_participations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_buy_participations" ADD CONSTRAINT "group_buy_participations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "group_buys" ADD CONSTRAINT "group_buys_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_buys" ADD CONSTRAINT "group_buys_vendor_offer_id_vendor_offers_id_fk" FOREIGN KEY ("vendor_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "group_buys" ADD CONSTRAINT "group_buys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "vendor_members" ADD CONSTRAINT "vendor_members_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendor_members" ADD CONSTRAINT "vendor_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "commissions_vendor_period_idx" ON "commissions" USING btree ("vendor_id","period");
CREATE UNIQUE INDEX "gbp_unique" ON "group_buy_participations" USING btree ("group_buy_id","restaurant_id");
CREATE INDEX "group_buys_zone_idx" ON "group_buys" USING btree ("zone","status");
CREATE INDEX "vendor_offers_vendor_idx" ON "vendor_offers" USING btree ("vendor_id");
CREATE INDEX "vendor_offers_product_idx" ON "vendor_offers" USING btree ("product_id");
CREATE UNIQUE INDEX "vendor_offers_unique" ON "vendor_offers" USING btree ("vendor_id","product_id","pack_label");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('c9f957865e4f838cdb76af9e4966e6f6982c66f1e1b4ed654f5628caf442845a', 1789763670378);

-- ---------- 05/29 · 0004_billing ----------
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"restaurant_id" uuid,
	"payload" jsonb,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "commission_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"period" text NOT NULL,
	"orders" integer NOT NULL,
	"base_eur" numeric(10, 2) NOT NULL,
	"amount_eur" numeric(10, 2) NOT NULL,
	"stripe_invoice_id" text,
	"status" text DEFAULT 'emise' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "restaurants" ADD COLUMN "stripe_subscription_id" text;
ALTER TABLE "restaurants" ADD COLUMN "subscription_status" text DEFAULT 'trialing' NOT NULL;
ALTER TABLE "restaurants" ADD COLUMN "current_period_end" timestamp with time zone;
ALTER TABLE "restaurants" ADD COLUMN "founder" boolean DEFAULT false NOT NULL;
ALTER TABLE "vendors" ADD COLUMN "stripe_customer_id" text;
ALTER TABLE "commission_invoices" ADD CONSTRAINT "commission_invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "commission_invoices_vendor_period" ON "commission_invoices" USING btree ("vendor_id","period");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('92bb52777dbbb30605eb474554a780384ebd22e28ce63914e41e5e43c1af337e', 1789767276143);

-- ---------- 06/29 · 0005_pilots ----------
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"score" integer,
	"message" text,
	"page" text,
	"status" text DEFAULT 'nouveau' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid,
	"event" text NOT NULL,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "leads" ADD COLUMN "invite_code" text;
ALTER TABLE "leads" ADD COLUMN "invited_at" timestamp with time zone;
ALTER TABLE "leads" ADD COLUMN "restaurant_id" uuid;
ALTER TABLE "restaurants" ADD COLUMN "invite_code" text;
ALTER TABLE "restaurants" ADD COLUMN "onboarding_done" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "feedback_restaurant_idx" ON "feedback" USING btree ("restaurant_id","created_at");
CREATE INDEX "usage_restaurant_at_idx" ON "usage_events" USING btree ("restaurant_id","at");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('49bbb9484f4624d6d9a1ab4924c0dfcf635d3adbf099d58269542032e48c7c58', 1789773259009);

-- ---------- 07/29 · 0006_prospects ----------
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"phone" text,
	"email" text,
	"contact_name" text,
	"status" text DEFAULT 'a_contacter' NOT NULL,
	"notes" text,
	"next_action_at" date,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "prospects_kind_idx" ON "prospects" USING btree ("kind","status");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('b3f3c295e0e3ace89ba7a7217b254bfe26e71238beb134a71d0a533de2f8fba5', 1789774197639);

-- ---------- 08/29 · 0007_shopping_lists ----------
CREATE TABLE "shopping_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"text" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "shopping_lists_restaurant_idx" ON "shopping_lists" USING btree ("restaurant_id");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('703d19e29989a2157460b43adba2adc05c6dbd694d314f382e6718074b315f40', 1789814268663);

-- ---------- 09/29 · 0008_notifications ----------
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"to" text NOT NULL,
	"kind" text NOT NULL,
	"order_id" uuid,
	"vendor_id" uuid,
	"restaurant_id" uuid,
	"body" text NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "orders" ADD COLUMN "vendor_reminded_at" timestamp with time zone;
CREATE INDEX "notif_created_idx" ON "notifications" USING btree ("created_at");
CREATE INDEX "notif_order_idx" ON "notifications" USING btree ("order_id");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('07178f6e5364395956baccb59006555a9f012dc47dc657867d9957854a0fcac8', 1789885479210);

-- ---------- 10/29 · 0009_vendor_cgv ----------
ALTER TABLE "vendors" ADD COLUMN "cgv_version" text;
ALTER TABLE "vendors" ADD COLUMN "cgv_accepted_at" timestamp with time zone;
ALTER TABLE "vendors" ADD COLUMN "cgv_accepted_by" text;
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('030962a3bbf26fe5931d4ab1f76478f5f6c3865cc8d8cc2f334ea1101bd872c7', 1789928429602);

-- ---------- 11/29 · 0010_fulfillment ----------
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"actor" text,
	"label" text NOT NULL,
	"meta" jsonb
);
ALTER TABLE "orders" ADD COLUMN "fulfillment" text;
ALTER TABLE "orders" ADD COLUMN "prepared_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "vendor_delivered_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "delivery_slot" text;
ALTER TABLE "orders" ADD COLUMN "driver_name" text;
ALTER TABLE "orders" ADD COLUMN "proof_receiver_name" text;
ALTER TABLE "orders" ADD COLUMN "proof_photo" text;
ALTER TABLE "orders" ADD COLUMN "proof_signature" text;
ALTER TABLE "orders" ADD COLUMN "proof_note" text;
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('20b6d5e574016cd70c90d06d7d4f66ac2af111c8a7bfd94c12055ca9cccce2eb', 1789929885979);

-- ---------- 12/29 · 0011_proposal ----------
ALTER TABLE "orders" ADD COLUMN "proposal" jsonb;
ALTER TABLE "orders" ADD COLUMN "proposal_at" timestamp with time zone;
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('0719883c17b093fb47b6f20a0fc693bbda210aab6ac2374ac745a512eb0887c0', 1789969701714);

-- ---------- 13/29 · 0012_recurring ----------
CREATE TABLE "recurring_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weekdays" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"mode" text DEFAULT 'auto' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notes" text,
	"last_run_at" timestamp with time zone,
	"last_order_id" uuid,
	"next_run_on" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "recurring_orders" ADD CONSTRAINT "recurring_orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recurring_orders" ADD CONSTRAINT "recurring_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recurring_orders" ADD CONSTRAINT "recurring_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "recurring_restaurant_idx" ON "recurring_orders" USING btree ("restaurant_id");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('68ffebae1f6a3cb80eb1bc33a47ae76758f164301588bf319763a192a21005d9', 1789970909707);

-- ---------- 14/29 · 0013_claims ----------
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"discrepancy_id" uuid,
	"reference" text NOT NULL,
	"product_name" text NOT NULL,
	"kind" text NOT NULL,
	"ordered_qty" numeric(12, 3),
	"received_qty" numeric(12, 3),
	"claimed_eur" numeric(10, 2) NOT NULL,
	"message" text,
	"photo" text,
	"status" text DEFAULT 'ouvert' NOT NULL,
	"resolution" text,
	"credit_eur" numeric(10, 2),
	"vendor_message" text,
	"vendor_responded_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "claims" ADD CONSTRAINT "claims_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "claims" ADD CONSTRAINT "claims_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "claims" ADD CONSTRAINT "claims_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "claims" ADD CONSTRAINT "claims_discrepancy_id_delivery_discrepancies_id_fk" FOREIGN KEY ("discrepancy_id") REFERENCES "public"."delivery_discrepancies"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "claims" ADD CONSTRAINT "claims_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "claims_vendor_idx" ON "claims" USING btree ("vendor_id");
CREATE INDEX "claims_restaurant_idx" ON "claims" USING btree ("restaurant_id");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('559ef739d72766a7baca69b8d46eff6268f4d6fcbda6e3bac4ef7634b83213da', 1789972026462);

-- ---------- 15/29 · 0014_pricing ----------
CREATE TABLE "vendor_customer_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"vendor_offer_id" uuid,
	"pack_price_eur" numeric(10, 2),
	"discount_pct" numeric(5, 2),
	"valid_until" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "vendor_price_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_offer_id" uuid NOT NULL,
	"min_packs" integer NOT NULL,
	"pack_price_eur" numeric(10, 2) NOT NULL
);
ALTER TABLE "vendor_customer_prices" ADD CONSTRAINT "vendor_customer_prices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendor_customer_prices" ADD CONSTRAINT "vendor_customer_prices_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendor_customer_prices" ADD CONSTRAINT "vendor_customer_prices_vendor_offer_id_vendor_offers_id_fk" FOREIGN KEY ("vendor_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendor_price_tiers" ADD CONSTRAINT "vendor_price_tiers_vendor_offer_id_vendor_offers_id_fk" FOREIGN KEY ("vendor_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "customer_prices_vendor_idx" ON "vendor_customer_prices" USING btree ("vendor_id");
CREATE INDEX "customer_prices_restaurant_idx" ON "vendor_customer_prices" USING btree ("restaurant_id");
CREATE INDEX "price_tiers_offer_idx" ON "vendor_price_tiers" USING btree ("vendor_offer_id");
CREATE UNIQUE INDEX "price_tiers_unique" ON "vendor_price_tiers" USING btree ("vendor_offer_id","min_packs");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('81ebd880b34a645687ff73c5a7b33ee45aec2ed9f31556f0a69786462eb5dd83', 1789974188784);

-- ---------- 16/29 · 0015_integrite_securite ----------
-- Chantiers 1 & 2 (audit AFRISUPPLY).
--
-- 1) Intégrité de la réception et des statuts de commande :
--    l'ancienne version acceptait deux réceptions sur la même commande (stock doublé :
--    72 kg → 122 kg constatés en audit). On nettoie d'abord, on ajoute le marqueur
--    `received_at`, on rattrape les commandes déjà réceptionnées, puis on pose le verrou.
DELETE FROM "deliveries" d
USING "deliveries" d2
WHERE d."order_id" = d2."order_id"
  AND (d."received_at" > d2."received_at"
       OR (d."received_at" = d2."received_at" AND d.id > d2.id));
ALTER TABLE "orders" ADD COLUMN "received_at" timestamp with time zone;
-- Rattrapage : les commandes livrées avant cette version sont marquées comme réceptionnées,
-- afin que la nouvelle garde applicative (409 order_already_received) les protège elles aussi.
UPDATE "orders" o
SET "received_at" = d."received_at"
FROM "deliveries" d
WHERE d."order_id" = o."id" AND o."received_at" IS NULL;
-- Verrou de base : une commande = une seule livraison (protection contre le double clic
-- et contre deux personnes qui réceptionnent en même temps dans la cuisine).
CREATE UNIQUE INDEX "deliveries_order_unique" ON "deliveries" USING btree ("order_id");
-- 2) Sécurité : sessions révocables et réinitialisation de mot de passe.
--    `users.token_version` est vérifié à chaque requête : un changement de mot de passe ou une
--    déconnexion globale invalide immédiatement tous les jetons déjà émis.
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id","created_at");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('9a64d9303ad10095d6858b9a3cba5a1c719c41a6838c511295c2bc50fb54cf27', 1789982858841);

-- ---------- 17/29 · 0016_reviews ----------
CREATE TABLE "vendor_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"on_time" boolean,
	"conform" boolean,
	"comment" text,
	"vendor_reply" text,
	"vendor_replied_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "vendor_reviews" ADD CONSTRAINT "vendor_reviews_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendor_reviews" ADD CONSTRAINT "vendor_reviews_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendor_reviews" ADD CONSTRAINT "vendor_reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendor_reviews" ADD CONSTRAINT "vendor_reviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "vendor_reviews_vendor_idx" ON "vendor_reviews" USING btree ("vendor_id");
CREATE UNIQUE INDEX "vendor_reviews_order_unique" ON "vendor_reviews" USING btree ("order_id");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('028d2c73f2b44274a9830607062c22fb68bebb0b5610016d17755c3d9258f45f', 1789984309349);

-- ---------- 18/29 · 0017_prix_facture ----------
ALTER TABLE "order_lines" ADD COLUMN "invoiced_unit_price_eur" numeric(10, 4);
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('d7a27240aa034dd8e14ab51ee8de39443c59a32094d305123ae1a21d895ee519', 1789985764879);

-- ---------- 19/29 · 0018_routes ----------
CREATE TABLE "vendor_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weekday" integer NOT NULL,
	"zones" text[] DEFAULT '{}'::text[] NOT NULL,
	"slots" text[] DEFAULT '{}'::text[] NOT NULL,
	"cutoff_days_before" integer DEFAULT 1 NOT NULL,
	"cutoff_time" text DEFAULT '14:00' NOT NULL,
	"capacity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "orders" ADD COLUMN "route_id" uuid;
ALTER TABLE "vendor_routes" ADD CONSTRAINT "vendor_routes_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "vendor_routes_vendor_idx" ON "vendor_routes" USING btree ("vendor_id","weekday");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('a55a2efaa47618ee6aa91db3bd109fd306d69d84118373393e5cf0488b806e69', 1789988945108);

-- ---------- 20/29 · 0019_credit ----------
CREATE TABLE "vendor_credit_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"payment_days" integer DEFAULT 0 NOT NULL,
	"credit_limit_eur" numeric(10, 2),
	"blocked" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "orders" ADD COLUMN "payment_days" integer;
ALTER TABLE "orders" ADD COLUMN "due_at" date;
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "paid_amount_eur" numeric(10, 2);
ALTER TABLE "orders" ADD COLUMN "payment_method" text;
ALTER TABLE "vendor_credit_terms" ADD CONSTRAINT "vendor_credit_terms_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vendor_credit_terms" ADD CONSTRAINT "vendor_credit_terms_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "credit_terms_unique" ON "vendor_credit_terms" USING btree ("vendor_id","restaurant_id");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('fdb6a3f220a2250690fadd4aca8ee5d8896be7d07ac231eda7acf89790e571e1', 1789991444069);

-- ---------- 21/29 · 0020_online_payment ----------
ALTER TABLE "orders" ADD COLUMN "stripe_checkout_id" text;
ALTER TABLE "orders" ADD COLUMN "stripe_payment_intent_id" text;
ALTER TABLE "vendors" ADD COLUMN "stripe_account_id" text;
ALTER TABLE "vendors" ADD COLUMN "stripe_payouts_enabled" boolean DEFAULT false NOT NULL;
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('c6f10b580312c7e50a5fbb49cdf2df45dce0e6bb6d5c204cc4a4d59cd25ee19d', 1789993728178);

-- ---------- 22/29 · 0021_forecast_events ----------
CREATE TABLE "forecast_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"label" text NOT NULL,
	"multiplier" numeric(4, 2) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "forecast_events" ADD CONSTRAINT "forecast_events_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "forecast_events_unique" ON "forecast_events" ("restaurant_id","day");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('bc587fb055183f49caf292dea3e8973fe0037fe4e43604d28350d9a06e77d798', 1790028628736);

-- ---------- 23/29 · 0022_rate_limits ----------
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('fd6112aaba3390e4deee18cb6e4ed00a1ac8a2ba5a0568d1aaabe30c6bd147f2', 1790030238668);

-- ---------- 24/29 · 0023_feedback_published ----------
ALTER TABLE "feedback" ADD COLUMN "published" boolean DEFAULT false NOT NULL;
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('1b28d50c4845479ebda313b84864ba4e525e1c702cee8749cae1d0e721e9696d', 1790031619865);

-- ---------- 25/29 · 0024_verification_email ----------
CREATE TABLE "email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_verifications_token_hash_unique" UNIQUE("token_hash")
);
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "email_verifications_user_idx" ON "email_verifications" USING btree ("user_id","created_at");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('eae527b12cfb61bac4e73349f66a43526fc983d4cffae5b852fb2623f2b71f18', 1790050000000);

-- ---------- 26/29 · 0025_canaux_notifications ----------
ALTER TYPE "public"."alert_kind" ADD VALUE 'saisie';
ALTER TABLE "alerts" ADD COLUMN "notified_at" timestamp with time zone;
-- Les alertes créées avant ce chantier ne doivent pas être renvoyées rétroactivement par e-mail :
-- on les considère comme « déjà annoncées » (elles restent visibles dans la cloche).
UPDATE "alerts" SET "notified_at" = now() WHERE "notified_at" IS NULL;
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('b11978e394a5fd4c8dbd87524e512e579e117470fba7e316bb0ce243c21ba126', 1790051000000);

-- ---------- 27/29 · 0026_factures_abonnement ----------
CREATE TABLE "subscription_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"plan" text NOT NULL,
	"founder" boolean DEFAULT false NOT NULL,
	"amount_eur" numeric(10, 2) NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '20' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'stripe' NOT NULL,
	"status" text DEFAULT 'payee' NOT NULL,
	"stripe_invoice_id" text,
	"hosted_url" text,
	"paid_at" timestamp with time zone,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_by" uuid,
	CONSTRAINT "subscription_invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "subscription_invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
ALTER TABLE "billing_events" ADD COLUMN "status" text DEFAULT 'recu' NOT NULL;
ALTER TABLE "billing_events" ADD COLUMN "error" text;
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "subscription_invoices_restaurant_idx" ON "subscription_invoices" USING btree ("restaurant_id","issued_at");
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('4afbcc3ea59131d01759140e406db2d1e46280f1a2287a07c582fd2deded85b4', 1790052000000);

-- ---------- 28/29 · 0027_facturation_fournisseur ----------
ALTER TABLE "vendors" ADD COLUMN "stripe_default_payment_method" text;
ALTER TABLE "vendors" ADD COLUMN "billing_email" text;
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('7a6d4ae229c8d38eb6867e6ff5794d3775c2c75068a0f456266a53bbd5e07ab5', 1790053000000);

-- ---------- 29/29 · 0028_clerk_auth ----------
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clerk_id" text UNIQUE;
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ('296c884a715a12d586771665e869cdbb8bb52667dd56a37656714aabfe8f5da1', 1790054000000);

COMMIT;
