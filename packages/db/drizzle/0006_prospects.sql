CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"phone" text,
	"email" text,
	"contact_name" text,
	"status" text DEFAULT 'a_contacter' NOT NULL,
	"notes" text,
	"next_action_at" date,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "prospects_kind_idx" ON "prospects" USING btree ("kind","status");