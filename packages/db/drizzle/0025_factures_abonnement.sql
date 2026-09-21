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
--> statement-breakpoint
ALTER TABLE "billing_events" ADD COLUMN "status" text DEFAULT 'recu' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_events" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_invoices_restaurant_idx" ON "subscription_invoices" USING btree ("restaurant_id","issued_at");