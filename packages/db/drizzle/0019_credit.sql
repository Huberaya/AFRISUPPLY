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
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_days" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "due_at" date;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_amount_eur" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "vendor_credit_terms" ADD CONSTRAINT "vendor_credit_terms_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_credit_terms" ADD CONSTRAINT "vendor_credit_terms_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_terms_unique" ON "vendor_credit_terms" USING btree ("vendor_id","restaurant_id");