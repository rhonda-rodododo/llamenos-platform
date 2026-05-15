-- Migration 0013: entity_type_templates table + events.deprecated_at column
-- EP06-A1: Entity System Unification

-- Create entity_type_templates table
CREATE TABLE IF NOT EXISTS "entity_type_templates" (
  "id"                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "template_key"         text NOT NULL,
  "version"              text NOT NULL DEFAULT '1.0.0',
  "category"             text NOT NULL,
  "is_builtin"           boolean NOT NULL DEFAULT true,
  "encrypted_definition" text,
  "definition_envelope"  jsonb,
  "name"                 text NOT NULL,
  "icon"                 text,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  "updated_at"           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "entity_type_templates_template_key_idx"
  ON "entity_type_templates" ("template_key");

CREATE INDEX IF NOT EXISTS "entity_type_templates_category_idx"
  ON "entity_type_templates" ("category");

-- Add deprecated_at to events table (soft deprecation marker)
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "deprecated_at" timestamptz;

CREATE INDEX IF NOT EXISTS "events_deprecated_at_idx"
  ON "events" ("deprecated_at")
  WHERE deprecated_at IS NOT NULL;
