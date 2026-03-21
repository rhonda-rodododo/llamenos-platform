-- Add call_tokens table for single-use opaque callback tokens (CRIT-W2)
-- Each token maps a crypto.randomUUID() to a (callSid, volunteerPubkey, hubId) tuple.
-- Tokens are DELETE-on-read (atomic single-use) to prevent replay attacks.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "call_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"call_sid" text NOT NULL,
	"volunteer_pubkey" text NOT NULL,
	"hub_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_tokens_call_sid_idx" ON "call_tokens" ("call_sid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_tokens_created_at_idx" ON "call_tokens" ("created_at");
