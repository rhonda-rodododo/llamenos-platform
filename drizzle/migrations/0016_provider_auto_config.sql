-- Provider auto-configuration tables (Phase 1)
-- Creates provider_configs, oauth_states, signal_registrations, a2p_registrations
-- Drops legacy telephony_provider JSONB columns from system_settings and hub_settings

-- ── provider_configs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "provider_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text,
	"provider_type" text NOT NULL,
	"credentials" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
	"phone_numbers" text[] DEFAULT '{}'::text[] NOT NULL,
	"error" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_configs"
	ADD CONSTRAINT "provider_configs_hub_id_hubs_id_fk"
	FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_configs_hub_id_idx" ON "provider_configs" USING btree ("hub_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_configs_provider_type_idx" ON "provider_configs" USING btree ("provider_type");
--> statement-breakpoint

-- ── oauth_states ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"redirect_url" text NOT NULL,
	"callback_scheme" text,
	"error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_states_provider_idx" ON "oauth_states" USING btree ("provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_states_expires_at_idx" ON "oauth_states" USING btree ("expires_at");
--> statement-breakpoint

-- ── signal_registrations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "signal_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"bridge_url" text,
	"phone_number" text NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_registrations_hub_id_idx" ON "signal_registrations" USING btree ("hub_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_registrations_status_idx" ON "signal_registrations" USING btree ("status");
--> statement-breakpoint

-- ── a2p_registrations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "a2p_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"provider_type" text NOT NULL,
	"brand_status" text DEFAULT 'not_submitted' NOT NULL,
	"campaign_status" text DEFAULT 'not_submitted' NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "a2p_registrations_hub_id_idx" ON "a2p_registrations" USING btree ("hub_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "a2p_registrations_provider_type_idx" ON "a2p_registrations" USING btree ("provider_type");
--> statement-breakpoint

-- ── Drop legacy telephony_provider columns ──────────────────────────────────
ALTER TABLE "system_settings" DROP COLUMN IF EXISTS "telephony_provider";
--> statement-breakpoint
ALTER TABLE "hub_settings" DROP COLUMN IF EXISTS "telephony_provider";
--> statement-breakpoint
