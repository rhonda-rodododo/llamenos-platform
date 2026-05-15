-- Fix schema drift: add missing hub_id to oauth_states and align FK definitions

ALTER TABLE "oauth_states" ADD COLUMN IF NOT EXISTS "hub_id" text;
--> statement-breakpoint
ALTER TABLE "oauth_states" DROP CONSTRAINT IF EXISTS "oauth_states_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Recreate a2p_registrations FK to match schema definition
ALTER TABLE "a2p_registrations" DROP CONSTRAINT IF EXISTS "a2p_registrations_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "a2p_registrations" ADD CONSTRAINT "a2p_registrations_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Recreate signal_registrations FK to match schema definition
ALTER TABLE "signal_registrations" DROP CONSTRAINT IF EXISTS "signal_registrations_hub_id_hubs_id_fk";
--> statement-breakpoint
ALTER TABLE "signal_registrations" ADD CONSTRAINT "signal_registrations_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
