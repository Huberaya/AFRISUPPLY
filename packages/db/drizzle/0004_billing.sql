CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"restaurant_id" uuid,
	"payload" jsonb,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "subscription_status" text DEFAULT 'trialing' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "founder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "commission_invoices" ADD CONSTRAINT "commission_invoices_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_invoices_vendor_period" ON "commission_invoices" USING btree ("vendor_id","period");