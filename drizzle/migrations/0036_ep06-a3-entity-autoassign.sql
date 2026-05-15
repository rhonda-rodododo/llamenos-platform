-- EP06-A3: Add auto-assign fields to entity type definitions + rename ban phone column

-- Rename bans.phone_plain → bans.phone_display (already phone_display on main)
ALTER TABLE "bans" RENAME COLUMN "phone_plain" TO "phone_display";

-- Add auto-assign columns to entity_type_definitions
ALTER TABLE "entity_type_definitions" ADD COLUMN "auto_assign" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "entity_type_definitions" ADD COLUMN "auto_assign_threshold" integer DEFAULT 30;
--> statement-breakpoint
ALTER TABLE "entity_type_definitions" ADD COLUMN "required_specializations" text[] NOT NULL DEFAULT '{}'::text[];
