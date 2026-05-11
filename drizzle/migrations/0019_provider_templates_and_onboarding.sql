-- Provider templates and hub onboarding state (Phase 7)
-- Creates provider_templates and hub_onboarding_state tables

-- ── provider_templates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "provider_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"provider_type" text NOT NULL,
	"default_channels" text[] DEFAULT '{}'::text[] NOT NULL,
	"credential_hints" jsonb DEFAULT '{}' NOT NULL,
	"recommended_settings" jsonb DEFAULT '{}' NOT NULL,
	"allow_sub_accounts" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_templates" ADD CONSTRAINT "provider_templates_slug_unique" UNIQUE("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_templates_provider_type_idx" ON "provider_templates" USING btree ("provider_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_templates_is_active_idx" ON "provider_templates" USING btree ("is_active");
--> statement-breakpoint

-- ── hub_onboarding_state ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "hub_onboarding_state" (
	"hub_id" text PRIMARY KEY NOT NULL,
	"template_id" text,
	"current_step" text DEFAULT 'template_selection' NOT NULL,
	"completed_steps" text[] DEFAULT '{}'::text[] NOT NULL,
	"channel_config" jsonb DEFAULT '{}' NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hub_onboarding_state"
	ADD CONSTRAINT "hub_onboarding_state_hub_id_hubs_id_fk"
	FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hub_onboarding_state_template_id_idx" ON "hub_onboarding_state" USING btree ("template_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hub_onboarding_state_is_complete_idx" ON "hub_onboarding_state" USING btree ("is_complete");
