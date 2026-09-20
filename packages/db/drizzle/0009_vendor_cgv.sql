ALTER TABLE "vendors" ADD COLUMN "cgv_version" text;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "cgv_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "cgv_accepted_by" text;