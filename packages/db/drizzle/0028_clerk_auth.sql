ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clerk_id" text UNIQUE;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
