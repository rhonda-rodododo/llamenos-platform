CREATE TABLE "device_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"verifier_pubkey" text NOT NULL,
	"target_device_id" text NOT NULL,
	"target_pubkey" text NOT NULL,
	"signed_audit_entry" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_pubkey" text NOT NULL,
	"event_type" text NOT NULL,
	"device_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "device_name" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "device_model" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "os_version" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "app_version" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_ip_hash" text;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_pubkey_users_pubkey_fk" FOREIGN KEY ("user_pubkey") REFERENCES "public"."users"("pubkey") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_verifications_verifier_idx" ON "device_verifications" USING btree ("verifier_pubkey");--> statement-breakpoint
CREATE INDEX "device_verifications_target_idx" ON "device_verifications" USING btree ("target_device_id");--> statement-breakpoint
CREATE INDEX "security_events_user_pubkey_idx" ON "security_events" USING btree ("user_pubkey");--> statement-breakpoint
CREATE INDEX "security_events_event_type_idx" ON "security_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "security_events_created_at_idx" ON "security_events" USING btree ("created_at");