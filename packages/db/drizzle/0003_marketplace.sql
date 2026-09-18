CREATE TYPE "public"."group_buy_status" AS ENUM('ouvert', 'atteint', 'cloture', 'annule');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('en_attente', 'actif', 'suspendu');--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "group_buy_participations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_buy_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"packs" integer NOT NULL,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "vendor_members" (
	"vendor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_members_vendor_id_user_id_pk" PRIMARY KEY("vendor_id","user_id")
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vendor_decision_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vendor_note" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "vendor_id" uuid;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buy_participations" ADD CONSTRAINT "group_buy_participations_group_buy_id_group_buys_id_fk" FOREIGN KEY ("group_buy_id") REFERENCES "public"."group_buys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buy_participations" ADD CONSTRAINT "group_buy_participations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buy_participations" ADD CONSTRAINT "group_buy_participations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buys" ADD CONSTRAINT "group_buys_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buys" ADD CONSTRAINT "group_buys_vendor_offer_id_vendor_offers_id_fk" FOREIGN KEY ("vendor_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buys" ADD CONSTRAINT "group_buys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_members" ADD CONSTRAINT "vendor_members_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_members" ADD CONSTRAINT "vendor_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_offers" ADD CONSTRAINT "vendor_offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commissions_vendor_period_idx" ON "commissions" USING btree ("vendor_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "gbp_unique" ON "group_buy_participations" USING btree ("group_buy_id","restaurant_id");--> statement-breakpoint
CREATE INDEX "group_buys_zone_idx" ON "group_buys" USING btree ("zone","status");--> statement-breakpoint
CREATE INDEX "vendor_offers_vendor_idx" ON "vendor_offers" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_offers_product_idx" ON "vendor_offers" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_offers_unique" ON "vendor_offers" USING btree ("vendor_id","product_id","pack_label");