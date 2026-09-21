-- Chantiers 1 & 2 (audit AFRISUPPLY).
--
-- 1) Intégrité de la réception et des statuts de commande :
--    l'ancienne version acceptait deux réceptions sur la même commande (stock doublé :
--    72 kg → 122 kg constatés en audit). On nettoie d'abord, on ajoute le marqueur
--    `received_at`, on rattrape les commandes déjà réceptionnées, puis on pose le verrou.
DELETE FROM "deliveries" d
USING "deliveries" d2
WHERE d."order_id" = d2."order_id"
  AND (d."received_at" > d2."received_at"
       OR (d."received_at" = d2."received_at" AND d.id > d2.id));--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
-- Rattrapage : les commandes livrées avant cette version sont marquées comme réceptionnées,
-- afin que la nouvelle garde applicative (409 order_already_received) les protège elles aussi.
UPDATE "orders" o
SET "received_at" = d."received_at"
FROM "deliveries" d
WHERE d."order_id" = o."id" AND o."received_at" IS NULL;--> statement-breakpoint
-- Verrou de base : une commande = une seule livraison (protection contre le double clic
-- et contre deux personnes qui réceptionnent en même temps dans la cuisine).
CREATE UNIQUE INDEX "deliveries_order_unique" ON "deliveries" USING btree ("order_id");--> statement-breakpoint
-- 2) Sécurité : sessions révocables et réinitialisation de mot de passe.
--    `users.token_version` est vérifié à chaque requête : un changement de mot de passe ou une
--    déconnexion globale invalide immédiatement tous les jetons déjà émis.
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"requested_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id","created_at");
