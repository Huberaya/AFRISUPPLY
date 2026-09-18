CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"score" integer,
	"message" text,
	"page" text,
	"status" text DEFAULT 'nouveau' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid,
	"event" text NOT NULL,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "invite_code" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "restaurant_id" uuid;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "invite_code" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "onboarding_done" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_restaurant_idx" ON "feedback" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_restaurant_at_idx" ON "usage_events" USING btree ("restaurant_id","at");