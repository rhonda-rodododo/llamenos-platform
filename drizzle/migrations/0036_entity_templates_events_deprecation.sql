CREATE TABLE "entity_type_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"template_key" text NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"category" text NOT NULL,
	"is_builtin" boolean DEFAULT true NOT NULL,
	"encrypted_definition" text,
	"definition_envelope" jsonb,
	"name" text NOT NULL,
	"icon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "deprecated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "entity_type_templates_template_key_idx" ON "entity_type_templates" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "entity_type_templates_category_idx" ON "entity_type_templates" USING btree ("category");