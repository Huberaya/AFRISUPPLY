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
--> statement-breakpoint
ALTER TABLE "recurring_orders" ADD CONSTRAINT "recurring_orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_orders" ADD CONSTRAINT "recurring_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_orders" ADD CONSTRAINT "recurring_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_restaurant_idx" ON "recurring_orders" USING btree ("restaurant_id");