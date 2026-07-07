-- Migration 0015: Bind WebAuthn challenges to allowed credential IDs (B-M14)
-- Prevents relay attacks where a challenge generated for one credential set
-- is consumed by a different credential.

ALTER TABLE "webauthn_challenges"
  ADD COLUMN IF NOT EXISTS "allowed_cred_ids" text;
