CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"to" text NOT NULL,
	"kind" text NOT NULL,
	"order_id" uuid,
	"vendor_id" uuid,
	"restaurant_id" uuid,
	"body" text NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vendor_reminded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notif_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notif_order_idx" ON "notifications" USING btree ("order_id");