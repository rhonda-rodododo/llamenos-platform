ALTER TABLE "system_settings" ADD COLUMN "platform_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "erased_at" timestamp with time zone;