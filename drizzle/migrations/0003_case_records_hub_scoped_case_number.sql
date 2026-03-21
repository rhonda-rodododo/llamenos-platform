-- Make case_number unique per-hub, not globally
-- Old global unique index caused conflicts across test hubs generating the same sequence
--> statement-breakpoint
DROP INDEX IF EXISTS "case_records_case_number_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "case_records_hub_id_case_number_idx" ON "case_records" ("hub_id", "case_number") WHERE case_number IS NOT NULL;
