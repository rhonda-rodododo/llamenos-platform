-- Add tables that exist in the Drizzle schema but were never included in a migration.
-- On a fresh database (CI) these tables are absent, causing 500 errors on any
-- endpoint that queries them.  All CREATE TABLE statements use IF NOT EXISTS so
-- this migration is safe to re-run on databases that already have these tables
-- from drizzle-push or prior development.  FK ADD CONSTRAINT statements are
-- wrapped to allow "already exists" errors (caught by run-migrations.ts).

-- ── hub_storage_settings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "hub_storage_settings" (
	"hub_id" text NOT NULL,
	"namespace" text NOT NULL,
	"retention_days" integer,
	CONSTRAINT "hub_storage_namespace_uniq" UNIQUE("hub_id","namespace")
);
--> statement-breakpoint
ALTER TABLE "hub_storage_settings"
	ADD CONSTRAINT "hub_storage_settings_hub_id_hubs_id_fk"
	FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- ── hub_storage_credentials ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "hub_storage_credentials" (
	"hub_id" text PRIMARY KEY NOT NULL,
	"access_key_id" text NOT NULL,
	"encrypted_secret_key" text NOT NULL,
	"policy_name" text NOT NULL,
	"user_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hub_storage_credentials"
	ADD CONSTRAINT "hub_storage_credentials_hub_id_hubs_id_fk"
	FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- ── mls_pending_messages ─────────────────────────────────────────────────────
-- This table was referenced in migration 0010 (FK drop) but never created.
CREATE TABLE IF NOT EXISTS "mls_pending_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"recipient_device_id" text NOT NULL,
	"message_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mls_pending_messages_hub_idx" ON "mls_pending_messages" USING btree ("hub_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mls_pending_messages_device_idx" ON "mls_pending_messages" USING btree ("recipient_device_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mls_pending_messages_hub_device_idx" ON "mls_pending_messages" USING btree ("hub_id","recipient_device_id");
--> statement-breakpoint

-- ── puk_envelopes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "puk_envelopes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_pubkey" text NOT NULL,
	"device_id" text NOT NULL,
	"generation" integer NOT NULL,
	"envelope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "puk_envelopes_device_gen_uniq" UNIQUE("device_id","generation")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "puk_envelopes_user_pubkey_idx" ON "puk_envelopes" USING btree ("user_pubkey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "puk_envelopes_device_id_idx" ON "puk_envelopes" USING btree ("device_id");
--> statement-breakpoint
ALTER TABLE "puk_envelopes"
	ADD CONSTRAINT "puk_envelopes_user_pubkey_users_pubkey_fk"
	FOREIGN KEY ("user_pubkey") REFERENCES "public"."users"("pubkey") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "puk_envelopes"
	ADD CONSTRAINT "puk_envelopes_device_id_devices_id_fk"
	FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- ── sigchain_links ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sigchain_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_pubkey" text NOT NULL,
	"seq_no" integer NOT NULL,
	"link_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"signature" text NOT NULL,
	"prev_hash" text DEFAULT '' NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sigchain_links_user_pubkey_idx" ON "sigchain_links" USING btree ("user_pubkey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sigchain_links_user_seq_idx" ON "sigchain_links" USING btree ("user_pubkey","seq_no");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sigchain_links_hash_idx" ON "sigchain_links" USING btree ("hash");
--> statement-breakpoint
ALTER TABLE "sigchain_links"
	ADD CONSTRAINT "sigchain_links_user_pubkey_users_pubkey_fk"
	FOREIGN KEY ("user_pubkey") REFERENCES "public"."users"("pubkey") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- ── signal_message_queue ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "signal_message_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"recipient_identifier" text NOT NULL,
	"body" text NOT NULL,
	"media_url" text,
	"media_type" text,
	"external_id" text,
	"idempotency_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_queue_pending_idx" ON "signal_message_queue" USING btree ("next_retry_at") WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_queue_recipient_status_idx" ON "signal_message_queue" USING btree ("recipient_identifier","status","updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "signal_queue_idempotency_idx" ON "signal_message_queue" USING btree ("idempotency_key") WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_queue_hub_status_idx" ON "signal_message_queue" USING btree ("hub_id","status");
--> statement-breakpoint
ALTER TABLE "signal_message_queue"
	ADD CONSTRAINT "signal_message_queue_hub_id_hubs_id_fk"
	FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- ── signal_identities ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "signal_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"number" text NOT NULL,
	"uuid" text NOT NULL,
	"fingerprint" text,
	"trust_level" text DEFAULT 'TRUSTED_UNVERIFIED' NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"key_change_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "signal_identities_hub_uuid_idx" ON "signal_identities" USING btree ("hub_id","uuid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_identities_trust_idx" ON "signal_identities" USING btree ("hub_id","trust_level");
--> statement-breakpoint
ALTER TABLE "signal_identities"
	ADD CONSTRAINT "signal_identities_hub_id_hubs_id_fk"
	FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- ── user_signal_contacts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_signal_contacts" (
	"user_pubkey" text PRIMARY KEY NOT NULL,
	"identifier_hash" text NOT NULL,
	"identifier_ciphertext" text NOT NULL,
	"identifier_envelope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"identifier_type" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_signal_contacts_hash_idx" ON "user_signal_contacts" USING btree ("identifier_hash");
--> statement-breakpoint
ALTER TABLE "user_signal_contacts"
	ADD CONSTRAINT "user_signal_contacts_user_pubkey_users_pubkey_fk"
	FOREIGN KEY ("user_pubkey") REFERENCES "public"."users"("pubkey") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- ── user_security_prefs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_security_prefs" (
	"user_pubkey" text PRIMARY KEY NOT NULL,
	"notification_channel" text DEFAULT 'web_push' NOT NULL,
	"disappearing_timer_days" integer DEFAULT 1 NOT NULL,
	"digest_cadence" text DEFAULT 'weekly' NOT NULL,
	"alert_on_new_device" boolean DEFAULT true NOT NULL,
	"alert_on_passkey_change" boolean DEFAULT true NOT NULL,
	"alert_on_pin_change" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_security_prefs"
	ADD CONSTRAINT "user_security_prefs_user_pubkey_users_pubkey_fk"
	FOREIGN KEY ("user_pubkey") REFERENCES "public"."users"("pubkey") ON DELETE cascade ON UPDATE no action;
