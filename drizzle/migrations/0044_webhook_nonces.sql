CREATE TABLE IF NOT EXISTS "webhook_nonces" (
	"nonce_hash" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_nonces_expires" ON "webhook_nonces" USING btree ("expires_at");
