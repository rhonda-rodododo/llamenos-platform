-- Phase 4: Signal registration + A2P compliance additions
-- Adds attempts column to signal_registrations (for 3-attempt limit enforcement)
-- Adds brand_sid, campaign_sid, error columns to a2p_registrations

ALTER TABLE "signal_registrations"
  ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

ALTER TABLE "a2p_registrations"
  ADD COLUMN IF NOT EXISTS "brand_sid" text;
--> statement-breakpoint
ALTER TABLE "a2p_registrations"
  ADD COLUMN IF NOT EXISTS "campaign_sid" text;
--> statement-breakpoint
ALTER TABLE "a2p_registrations"
  ADD COLUMN IF NOT EXISTS "error" text;
--> statement-breakpoint
