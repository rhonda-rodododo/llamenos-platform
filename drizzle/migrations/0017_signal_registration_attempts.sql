-- Add attempts column to signal_registrations (missing from initial create)
ALTER TABLE "signal_registrations" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0;
