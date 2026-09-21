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
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_discrepancy_id_delivery_discrepancies_id_fk" FOREIGN KEY ("discrepancy_id") REFERENCES "public"."delivery_discrepancies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claims_vendor_idx" ON "claims" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "claims_restaurant_idx" ON "claims" USING btree ("restaurant_id");