CREATE TABLE "auth_nonces" (
	"nonce_hash" text PRIMARY KEY NOT NULL,
	"pubkey" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_auth_nonces_expires" ON "auth_nonces" USING btree ("expires_at");