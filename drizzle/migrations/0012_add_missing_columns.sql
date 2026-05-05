-- Add columns that exist in Drizzle schema definitions but were never included
-- in any prior migration.  On a fresh database (CI) these columns are absent,
-- causing 500 errors when Drizzle tries to SELECT or INSERT them.
--
-- All statements use IF NOT EXISTS / exception-swallowing patterns so this
-- migration is safe to re-run on databases where `drizzle-kit push` already
-- added these columns.

-- ── bans.phone_plain ────────────────────────────────────────────────────────
-- Stores the original E.164 phone number for admin display alongside the
-- HMAC-SHA256 hash (phone_hash).  Added to the Drizzle schema but never
-- migrated.
ALTER TABLE "bans" ADD COLUMN IF NOT EXISTS "phone_plain" text;
--> statement-breakpoint

-- ── devices.ed25519_pubkey ──────────────────────────────────────────────────
-- Per-device Ed25519 signing public key (hex-encoded).  Part of Phase 6
-- HPKE/PUK crypto but never migrated.
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "ed25519_pubkey" text;
--> statement-breakpoint

-- ── devices.x25519_pubkey ───────────────────────────────────────────────────
-- Per-device X25519 key agreement public key (hex-encoded).  Part of Phase 6
-- HPKE/PUK crypto but never migrated.
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "x25519_pubkey" text;
