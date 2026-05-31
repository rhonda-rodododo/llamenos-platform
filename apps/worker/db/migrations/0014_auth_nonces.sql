-- Migration 0014: auth_nonces table for Bearer token replay prevention
-- Epic 259: Auth token replay vulnerability fix

CREATE TABLE IF NOT EXISTS "auth_nonces" (
  "nonce_hash"  text PRIMARY KEY,
  "pubkey"      text NOT NULL,
  "expires_at"  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_auth_nonces_expires"
  ON "auth_nonces" ("expires_at");
