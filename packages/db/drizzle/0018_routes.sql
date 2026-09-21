CREATE TABLE "vendor_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weekday" integer NOT NULL,
	"zones" text[] DEFAULT '{}'::text[] NOT NULL,
	"slots" text[] DEFAULT '{}'::text[] NOT NULL,
	"cutoff_days_before" integer DEFAULT 1 NOT NULL,
	"cutoff_time" text DEFAULT '14:00' NOT NULL,
	"capacity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "route_id" uuid;--> statement-breakpoint
ALTER TABLE "vendor_routes" ADD CONSTRAINT "vendor_routes_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendor_routes_vendor_idx" ON "vendor_routes" USING btree ("vendor_id","weekday");