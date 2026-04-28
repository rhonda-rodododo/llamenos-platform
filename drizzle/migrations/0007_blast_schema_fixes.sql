-- Add missing completed_at column to blasts table
ALTER TABLE "blasts" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
--> statement-breakpoint
-- Add missing encrypted_identifier column to subscribers table (nullable)
ALTER TABLE "subscribers" ADD COLUMN IF NOT EXISTS "encrypted_identifier" text;
--> statement-breakpoint
-- Create blast_deliveries table (missing from initial migration)
CREATE TABLE "blast_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"blast_id" text NOT NULL REFERENCES "blasts"("id") ON DELETE CASCADE,
	"subscriber_id" text NOT NULL REFERENCES "subscribers"("id") ON DELETE CASCADE,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"external_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "blast_deliveries_blast_status_idx" ON "blast_deliveries" ("blast_id", "status");
--> statement-breakpoint
CREATE INDEX "blast_deliveries_pending_idx" ON "blast_deliveries" ("next_retry_at") WHERE status IN ('pending', 'sending');
--> statement-breakpoint
CREATE INDEX "blast_deliveries_external_id_idx" ON "blast_deliveries" ("external_id");
