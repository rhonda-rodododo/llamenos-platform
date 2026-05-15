CREATE TABLE "hub_recovery_group_shares" (
	"hub_id" text NOT NULL,
	"holder_pubkey" text NOT NULL,
	"share_envelope" text NOT NULL,
	"last_liveness_proof" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_recovery_group_shares_hub_id_holder_pubkey_pk" PRIMARY KEY("hub_id","holder_pubkey")
);
--> statement-breakpoint
CREATE TABLE "hub_recovery_groups" (
	"hub_id" text PRIMARY KEY NOT NULL,
	"group_public_key" text NOT NULL,
	"threshold" integer NOT NULL,
	"total_shares" integer NOT NULL,
	"share_commitments" jsonb NOT NULL,
	"duress_commitments" jsonb,
	"sigchain_link_hash" text NOT NULL,
	"delay_hours" integer DEFAULT 24 NOT NULL,
	"emergency_floor_hours" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	CONSTRAINT "threshold_range" CHECK ("hub_recovery_groups"."threshold" >= 2 AND "hub_recovery_groups"."threshold" <= 5),
	CONSTRAINT "total_shares_range" CHECK ("hub_recovery_groups"."total_shares" >= 3 AND "hub_recovery_groups"."total_shares" <= 5),
	CONSTRAINT "threshold_lte_total" CHECK ("hub_recovery_groups"."threshold" <= "hub_recovery_groups"."total_shares"),
	CONSTRAINT "delay_hours_range" CHECK ("hub_recovery_groups"."delay_hours" >= 4 AND "hub_recovery_groups"."delay_hours" <= 168),
	CONSTRAINT "emergency_floor_range" CHECK ("hub_recovery_groups"."emergency_floor_hours" >= 1 AND "hub_recovery_groups"."emergency_floor_hours" <= 24),
	CONSTRAINT "emergency_lte_delay" CHECK ("hub_recovery_groups"."emergency_floor_hours" <= "hub_recovery_groups"."delay_hours")
);
--> statement-breakpoint
CREATE TABLE "recovery_session_contributions" (
	"session_id" text NOT NULL,
	"contributor_pubkey" text NOT NULL,
	"encrypted_share" text NOT NULL,
	"contributor_signature" text NOT NULL,
	"contributed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_session_contributions_session_id_contributor_pubkey_pk" PRIMARY KEY("session_id","contributor_pubkey")
);
--> statement-breakpoint
CREATE TABLE "recovery_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"user_pubkey" text NOT NULL,
	"new_device_pubkey" text NOT NULL,
	"signal_verified" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verification_code_hash" text,
	"verification_attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"emergency_override" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_recovery_envelopes" (
	"user_pubkey" text NOT NULL,
	"hub_id" text NOT NULL,
	"envelope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_recovery_envelopes_user_pubkey_hub_id_pk" PRIMARY KEY("user_pubkey","hub_id")
);
--> statement-breakpoint
ALTER TABLE "hub_recovery_group_shares" ADD CONSTRAINT "hub_recovery_group_shares_hub_id_hub_recovery_groups_hub_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hub_recovery_groups"("hub_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_session_contributions" ADD CONSTRAINT "recovery_session_contributions_session_id_recovery_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."recovery_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_sessions_hub_id_idx" ON "recovery_sessions" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX "recovery_sessions_user_pubkey_idx" ON "recovery_sessions" USING btree ("user_pubkey");--> statement-breakpoint
CREATE INDEX "recovery_sessions_status_idx" ON "recovery_sessions" USING btree ("status");