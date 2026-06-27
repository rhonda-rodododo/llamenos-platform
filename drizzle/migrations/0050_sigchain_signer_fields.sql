ALTER TABLE "sigchain_links" ADD COLUMN "signer_device_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sigchain_links" ADD COLUMN "signer_pubkey" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sigchain_links" ADD COLUMN "timestamp" text DEFAULT '' NOT NULL;