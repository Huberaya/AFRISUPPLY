CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"actor" text,
	"label" text NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "prepared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vendor_delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_slot" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "driver_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "proof_receiver_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "proof_photo" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "proof_signature" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "proof_note" text;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");