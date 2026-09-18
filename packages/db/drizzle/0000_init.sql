CREATE TYPE "public"."alert_kind" AS ENUM('rupture', 'stock_bas', 'hausse_prix', 'opportunite', 'fournisseur', 'ecart_livraison');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('red', 'orange', 'green', 'blue');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('reception', 'consommation', 'ajustement', 'perte');--> statement-breakpoint
CREATE TYPE "public"."order_channel" AS ENUM('email', 'whatsapp', 'telephone', 'plateforme');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('brouillon', 'preparee', 'envoyee', 'confirmee', 'livree_partiel', 'livree', 'annulee');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('trial', 'starter', 'pro', 'business');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('feculents', 'frais', 'viandes_poissons', 'epicerie', 'boissons', 'emballages');--> statement-breakpoint
CREATE TYPE "public"."unit" AS ENUM('kg', 'g', 'L', 'mL', 'piece', 'botte', 'sac', 'carton');--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"unit_price_eur" numeric(10, 4) NOT NULL,
	"source" text DEFAULT 'manuel' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(12, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"selling_price_eur" numeric(10, 2),
	"target_margin_pct" numeric(5, 2) DEFAULT '70',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "restaurant_members" (
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"day" date NOT NULL,
	"portions" integer NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_discrepancies" ADD CONSTRAINT "delivery_discrepancies_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_discrepancies" ADD CONSTRAINT "delivery_discrepancies_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_preferred_supplier_id_suppliers_id_fk" FOREIGN KEY ("preferred_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_offer_id_supplier_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."supplier_offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_offer_id_supplier_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."supplier_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorder_rules" ADD CONSTRAINT "reorder_rules_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorder_rules" ADD CONSTRAINT "reorder_rules_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_members" ADD CONSTRAINT "restaurant_members_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_members" ADD CONSTRAINT "restaurant_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_dedupe" ON "alerts" USING btree ("restaurant_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "forecasts_restaurant_idx" ON "forecasts" USING btree ("restaurant_id","computed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_unique" ON "inventory_items" USING btree ("restaurant_id","product_id");--> statement-breakpoint
CREATE INDEX "orders_restaurant_idx" ON "orders" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_ref" ON "orders" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "price_history_offer_idx" ON "price_history" USING btree ("offer_id","recorded_at");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "products_restaurant_idx" ON "products" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_ing_unique" ON "recipe_ingredients" USING btree ("recipe_id","product_id");--> statement-breakpoint
CREATE INDEX "recipes_restaurant_idx" ON "recipes" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reorder_rules_unique" ON "reorder_rules" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_members_pk" ON "restaurant_members" USING btree ("restaurant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_unique" ON "sales" USING btree ("restaurant_id","recipe_id","day");--> statement-breakpoint
CREATE INDEX "movements_item_idx" ON "stock_movements" USING btree ("inventory_item_id","created_at");--> statement-breakpoint
CREATE INDEX "offers_restaurant_idx" ON "supplier_offers" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "offers_product_idx" ON "supplier_offers" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_unique" ON "supplier_offers" USING btree ("supplier_id","product_id","pack_label");--> statement-breakpoint
CREATE INDEX "suppliers_restaurant_idx" ON "suppliers" USING btree ("restaurant_id");