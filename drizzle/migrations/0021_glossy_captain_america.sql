CREATE TABLE "platform_role_envelopes" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"admin_pubkey" text NOT NULL,
	"encrypted_name" text NOT NULL,
	"encrypted_description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_role_envelopes_role_id_admin_pubkey_unique" UNIQUE("role_id","admin_pubkey")
);
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "encrypted_name" text;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "encrypted_description" text;--> statement-breakpoint
ALTER TABLE "platform_role_envelopes" ADD CONSTRAINT "platform_role_envelopes_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;