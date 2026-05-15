ALTER TABLE "roles" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_role_envelopes" ALTER COLUMN "encrypted_permissions" SET DATA TYPE text;