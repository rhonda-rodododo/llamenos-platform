CREATE TABLE "device_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"verifier_pubkey" text NOT NULL,
	"target_device_id" text NOT NULL,
	"target_pubkey" text NOT NULL,
	"signed_audit_entry" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_pubkey" text,
	"event_type" text NOT NULL,
	"device_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "user_role_envelopes" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"user_pubkey" text NOT NULL,
	"encrypted_permissions" text NOT NULL,
	"wrapped_key" text NOT NULL,
	"nonce" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_role_envelopes_user_role_uniq" UNIQUE("user_pubkey","role_id")
);
--> statement-breakpoint
CREATE TABLE "contact_team_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"team_id" text NOT NULL,
	"hub_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_team_unique" UNIQUE("contact_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" text NOT NULL,
	"user_pubkey" text NOT NULL,
	"added_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_pubkey_pk" PRIMARY KEY("team_id","user_pubkey")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"encrypted_name" text NOT NULL,
	"encrypted_description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"name" text NOT NULL,
	"encrypted_label" text NOT NULL,
	"color" text DEFAULT '#6b7280' NOT NULL,
	"encrypted_category" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_hub_name_unique" UNIQUE("hub_id","name")
);
--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "call_records" ADD COLUMN "answered_by" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "device_name" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "device_model" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "os_version" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "app_version" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "last_ip_hash" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "encrypted_name" text;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "encrypted_description" text;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_pubkey_users_pubkey_fk" FOREIGN KEY ("user_pubkey") REFERENCES "public"."users"("pubkey") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_role_envelopes" ADD CONSTRAINT "platform_role_envelopes_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_envelopes" ADD CONSTRAINT "user_role_envelopes_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_envelopes" ADD CONSTRAINT "user_role_envelopes_user_pubkey_users_pubkey_fk" FOREIGN KEY ("user_pubkey") REFERENCES "public"."users"("pubkey") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_team_assignments" ADD CONSTRAINT "contact_team_assignments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_team_assignments" ADD CONSTRAINT "contact_team_assignments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_pubkey_users_pubkey_fk" FOREIGN KEY ("user_pubkey") REFERENCES "public"."users"("pubkey") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_verifications_verifier_idx" ON "device_verifications" USING btree ("verifier_pubkey");--> statement-breakpoint
CREATE INDEX "device_verifications_target_idx" ON "device_verifications" USING btree ("target_device_id");--> statement-breakpoint
CREATE INDEX "security_events_user_pubkey_idx" ON "security_events" USING btree ("user_pubkey");--> statement-breakpoint
CREATE INDEX "security_events_event_type_idx" ON "security_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "security_events_created_at_idx" ON "security_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_role_envelopes_role_id_idx" ON "user_role_envelopes" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "user_role_envelopes_user_pubkey_idx" ON "user_role_envelopes" USING btree ("user_pubkey");--> statement-breakpoint
CREATE INDEX "contact_team_contact_idx" ON "contact_team_assignments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_team_team_idx" ON "contact_team_assignments" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "contact_team_hub_idx" ON "contact_team_assignments" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_pubkey");--> statement-breakpoint
CREATE INDEX "teams_hub_idx" ON "teams" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX "tags_hub_idx" ON "tags" USING btree ("hub_id");--> statement-breakpoint
ALTER TABLE "blast_deliveries" ADD CONSTRAINT "blast_delivery_unique" UNIQUE("blast_id","subscriber_id","channel");