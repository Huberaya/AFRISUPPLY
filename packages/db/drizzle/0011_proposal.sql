ALTER TABLE "orders" ADD COLUMN "proposal" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "proposal_at" timestamp with time zone;