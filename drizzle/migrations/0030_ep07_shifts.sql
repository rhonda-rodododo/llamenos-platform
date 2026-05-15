-- EP07: Shift Management — ring groups, overrides, availability blocks, join requests, active shifts
-- Also renames shifts.name → shifts.encrypted_name and adds shifts.ring_group_id

--> statement-breakpoint
CREATE TABLE "ring_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"encrypted_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ring_group_members" (
	"ring_group_id" text NOT NULL,
	"user_pubkey" text NOT NULL,
	"added_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ring_group_members_ring_group_id_user_pubkey_pk" PRIMARY KEY("ring_group_id","user_pubkey")
);
--> statement-breakpoint
CREATE TABLE "shift_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"shift_id" text,
	"date" text NOT NULL,
	"type" text NOT NULL,
	"user_pubkeys" text[],
	"encrypted_note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_overrides_hub_shift_date" UNIQUE("hub_id","shift_id","date")
);
--> statement-breakpoint
CREATE TABLE "active_shifts" (
	"pubkey" text NOT NULL,
	"hub_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_heartbeat" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "active_shifts_pubkey_hub_id_pk" PRIMARY KEY("pubkey","hub_id")
);
--> statement-breakpoint
CREATE TABLE "user_availability_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"user_pubkey" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"encrypted_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_join_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"shift_id" text NOT NULL,
	"user_pubkey" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shifts" RENAME COLUMN "name" TO "encrypted_name";
--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "ring_group_id" text;
--> statement-breakpoint
ALTER TABLE "ring_group_members" ADD CONSTRAINT "ring_group_members_ring_group_id_ring_groups_id_fk" FOREIGN KEY ("ring_group_id") REFERENCES "public"."ring_groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shift_overrides" ADD CONSTRAINT "shift_overrides_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shift_join_requests" ADD CONSTRAINT "shift_join_requests_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_ring_group_id_ring_groups_id_fk" FOREIGN KEY ("ring_group_id") REFERENCES "public"."ring_groups"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ring_groups_hub_idx" ON "ring_groups" USING btree ("hub_id");
--> statement-breakpoint
CREATE INDEX "ring_group_members_user_idx" ON "ring_group_members" USING btree ("user_pubkey");
--> statement-breakpoint
CREATE INDEX "shift_overrides_hub_date_idx" ON "shift_overrides" USING btree ("hub_id","date");
--> statement-breakpoint
CREATE INDEX "availability_blocks_hub_user_idx" ON "user_availability_blocks" USING btree ("hub_id","user_pubkey");
--> statement-breakpoint
CREATE INDEX "availability_blocks_hub_date_idx" ON "user_availability_blocks" USING btree ("hub_id","start_date","end_date");
--> statement-breakpoint
CREATE INDEX "shift_join_requests_hub_idx" ON "shift_join_requests" USING btree ("hub_id","status");
