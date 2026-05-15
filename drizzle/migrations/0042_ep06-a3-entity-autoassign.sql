ALTER TABLE "entity_type_definitions" ADD COLUMN "auto_assign" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "entity_type_definitions" ADD COLUMN "auto_assign_threshold" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "entity_type_definitions" ADD COLUMN "required_specializations" text[] DEFAULT '{}'::text[] NOT NULL;