ALTER TABLE "orders" ADD COLUMN "stripe_checkout_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "stripe_payouts_enabled" boolean DEFAULT false NOT NULL;