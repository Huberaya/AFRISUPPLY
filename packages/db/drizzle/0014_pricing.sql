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
--> statement-breakpoint
CREATE TABLE "vendor_price_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_offer_id" uuid NOT NULL,
	"min_packs" integer NOT NULL,
	"pack_price_eur" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor_customer_prices" ADD CONSTRAINT "vendor_customer_prices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_customer_prices" ADD CONSTRAINT "vendor_customer_prices_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_customer_prices" ADD CONSTRAINT "vendor_customer_prices_vendor_offer_id_vendor_offers_id_fk" FOREIGN KEY ("vendor_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_price_tiers" ADD CONSTRAINT "vendor_price_tiers_vendor_offer_id_vendor_offers_id_fk" FOREIGN KEY ("vendor_offer_id") REFERENCES "public"."vendor_offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_prices_vendor_idx" ON "vendor_customer_prices" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "customer_prices_restaurant_idx" ON "vendor_customer_prices" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "price_tiers_offer_idx" ON "vendor_price_tiers" USING btree ("vendor_offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_tiers_unique" ON "vendor_price_tiers" USING btree ("vendor_offer_id","min_packs");