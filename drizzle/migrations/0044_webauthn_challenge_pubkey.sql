ALTER TABLE "webauthn_challenges" ADD COLUMN "pubkey" text;--> statement-breakpoint
CREATE INDEX "webauthn_challenges_pubkey_idx" ON "webauthn_challenges" USING btree ("pubkey");
