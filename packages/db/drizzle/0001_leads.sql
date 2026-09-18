CREATE TYPE "public"."lead_status" AS ENUM('nouveau', 'contacte', 'demo', 'pilote', 'client', 'perdu');--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"city" text,
	"cuisine" text,
	"covers_per_day" integer,
	"message" text,
	"plan_interest" text,
	"source" text DEFAULT 'site' NOT NULL,
	"utm" jsonb,
	"status" "lead_status" DEFAULT 'nouveau' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");