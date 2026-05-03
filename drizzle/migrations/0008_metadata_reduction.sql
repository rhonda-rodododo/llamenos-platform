-- metadata-reduction: rename caller_number → caller_number_hash in active_calls,
-- and phone → phone_hash in bans.
--
-- Values stored in these columns are now HMAC-SHA256 hashes (via hashPhone()),
-- not raw phone numbers. This prevents the server from observing caller identity
-- at rest. Callers can still be ban-matched by re-hashing the incoming number.
--> statement-breakpoint
ALTER TABLE "active_calls" RENAME COLUMN "caller_number" TO "caller_number_hash";
--> statement-breakpoint
ALTER TABLE "bans" RENAME COLUMN "phone" TO "phone_hash";
--> statement-breakpoint
-- Update the unique index on bans to use the renamed column
DROP INDEX IF EXISTS "bans_hub_id_phone_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bans_hub_id_phone_hash_idx" ON "bans" ("hub_id", "phone_hash");
