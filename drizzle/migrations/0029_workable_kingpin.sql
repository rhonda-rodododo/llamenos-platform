ALTER TABLE "security_events" ALTER COLUMN "user_pubkey" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "id" text NOT NULL;