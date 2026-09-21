ALTER TYPE "public"."alert_kind" ADD VALUE 'saisie';--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
-- Les alertes créées avant ce chantier ne doivent pas être renvoyées rétroactivement par e-mail :
-- on les considère comme « déjà annoncées » (elles restent visibles dans la cloche).
UPDATE "alerts" SET "notified_at" = now() WHERE "notified_at" IS NULL;