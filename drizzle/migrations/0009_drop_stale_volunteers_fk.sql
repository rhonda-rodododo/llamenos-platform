-- Drop stale FK constraints that reference the old 'volunteers' table.
-- Migration 0001 renamed volunteers→users but could silently fail if the users
-- table already existed (drizzle push created it first), leaving the devices,
-- sessions, and webauthn_credentials tables with FK constraints still pointing
-- at volunteers instead of users.  These constraints block device registration
-- for any user created via the new /api/users endpoint.
ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "devices_pubkey_volunteers_pubkey_fk";
--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_pubkey_volunteers_pubkey_fk";
--> statement-breakpoint
ALTER TABLE "webauthn_credentials" DROP CONSTRAINT IF EXISTS "webauthn_credentials_pubkey_volunteers_pubkey_fk";
