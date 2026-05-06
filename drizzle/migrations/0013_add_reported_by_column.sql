-- Add reported_by column to active_calls.
-- Added to the Drizzle schema in PR #211 (reportSpam fix) but never migrated.
-- On fresh databases (CI), this column is absent, causing INSERT...RETURNING to fail
-- with a "column reported_by does not exist" error — manifesting as 500s on the
-- incoming call simulation endpoint and breaking 57+ BDD scenarios.

ALTER TABLE "active_calls" ADD COLUMN IF NOT EXISTS "reported_by" text;
