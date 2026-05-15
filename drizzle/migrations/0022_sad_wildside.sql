CREATE TABLE "user_role_envelopes" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"user_pubkey" text NOT NULL,
	"encrypted_permissions" jsonb NOT NULL,
	"wrapped_key" text NOT NULL,
	"nonce" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_role_envelopes_user_role_uniq" UNIQUE("user_pubkey","role_id")
);
--> statement-breakpoint
ALTER TABLE "user_role_envelopes" ADD CONSTRAINT "user_role_envelopes_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_envelopes" ADD CONSTRAINT "user_role_envelopes_user_pubkey_users_pubkey_fk" FOREIGN KEY ("user_pubkey") REFERENCES "public"."users"("pubkey") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_role_envelopes_role_id_idx" ON "user_role_envelopes" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "user_role_envelopes_user_pubkey_idx" ON "user_role_envelopes" USING btree ("user_pubkey");