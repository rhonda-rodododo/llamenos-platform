-- Add hub_id to case_number_sequences for per-hub counter isolation
-- Drops and recreates the table since existing sequences are test data only

--> statement-breakpoint
ALTER TABLE "case_number_sequences" DROP CONSTRAINT "case_number_sequences_prefix_year_pk";
--> statement-breakpoint
ALTER TABLE "case_number_sequences" ADD COLUMN "hub_id" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "case_number_sequences" ADD CONSTRAINT "case_number_sequences_hub_id_prefix_year_pk" PRIMARY KEY ("hub_id", "prefix", "year");
