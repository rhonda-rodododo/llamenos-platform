ALTER TABLE "case_records" ADD COLUMN "merged_into_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "merged_into_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "deleted_at" timestamp with time zone;