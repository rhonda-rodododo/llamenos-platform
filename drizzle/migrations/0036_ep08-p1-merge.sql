CREATE TABLE "audit_user_keys" (
	"user_pubkey" text PRIMARY KEY NOT NULL,
	"encrypted_key" text NOT NULL,
	"admin_envelopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erasure_config" (
	"hub_id" text PRIMARY KEY NOT NULL,
	"delay_hours" integer DEFAULT 72 NOT NULL,
	"emergency_override_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erasure_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"execute_at" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"justification" text,
	"emergency_override" boolean DEFAULT false NOT NULL,
	"co_approver_pubkey" text,
	"co_approver_signature" text,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "re_encryption_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"total_envelopes" integer DEFAULT 0 NOT NULL,
	"processed_envelopes" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_platform_floors" (
	"category" text PRIMARY KEY NOT NULL,
	"min_retention_days" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_settings" (
	"hub_id" text NOT NULL,
	"category" text NOT NULL,
	"retention_days" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "retention_settings_hub_id_category_pk" PRIMARY KEY("hub_id","category")
);
--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "platform_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "erasure_requests_user_id_idx" ON "erasure_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "erasure_requests_status_idx" ON "erasure_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "erasure_requests_execute_at_idx" ON "erasure_requests" USING btree ("execute_at");--> statement-breakpoint
CREATE INDEX "re_encryption_jobs_user_id_idx" ON "re_encryption_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "re_encryption_jobs_status_idx" ON "re_encryption_jobs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "bans" DROP COLUMN IF EXISTS "phone_plain";