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
ALTER TABLE "contact_team_assignments" ADD CONSTRAINT "contact_team_assignments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_pubkey_users_pubkey_fk" FOREIGN KEY ("user_pubkey") REFERENCES "public"."users"("pubkey") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_team_contact_idx" ON "contact_team_assignments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_team_team_idx" ON "contact_team_assignments" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "contact_team_hub_idx" ON "contact_team_assignments" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_pubkey");--> statement-breakpoint
CREATE INDEX "teams_hub_idx" ON "teams" USING btree ("hub_id");--> statement-breakpoint
CREATE INDEX "tags_hub_idx" ON "tags" USING btree ("hub_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "team_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "team_id"
