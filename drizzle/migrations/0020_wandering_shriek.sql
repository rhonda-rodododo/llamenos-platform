-- EP07: Ring groups, shift overrides, active shifts, availability blocks, shift join requests

-- Ring groups
CREATE TABLE IF NOT EXISTS "ring_groups" (
  "id" text PRIMARY KEY NOT NULL,
  "hub_id" text NOT NULL,
  "encrypted_name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ring_groups_hub_idx" ON "ring_groups" ("hub_id");

-- Ring group members
CREATE TABLE IF NOT EXISTS "ring_group_members" (
  "ring_group_id" text NOT NULL REFERENCES "ring_groups" ("id") ON DELETE CASCADE,
  "user_pubkey" text NOT NULL,
  "added_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("ring_group_id", "user_pubkey")
);
CREATE INDEX IF NOT EXISTS "ring_group_members_user_idx" ON "ring_group_members" ("user_pubkey");

-- Shift overrides
CREATE TABLE IF NOT EXISTS "shift_overrides" (
  "id" text PRIMARY KEY NOT NULL,
  "hub_id" text NOT NULL,
  "shift_id" text REFERENCES "shifts" ("id") ON DELETE CASCADE,
  "date" text NOT NULL,
  "type" text NOT NULL,
  "user_pubkeys" text[],
  "encrypted_note" text,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE ("hub_id", "shift_id", "date")
);
CREATE INDEX IF NOT EXISTS "shift_overrides_hub_date_idx" ON "shift_overrides" ("hub_id", "date");

-- Active shifts (clock-in state)
CREATE TABLE IF NOT EXISTS "active_shifts" (
  "pubkey" text NOT NULL,
  "hub_id" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_heartbeat" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("pubkey", "hub_id")
);

-- User availability blocks
CREATE TABLE IF NOT EXISTS "user_availability_blocks" (
  "id" text PRIMARY KEY NOT NULL,
  "hub_id" text NOT NULL,
  "user_pubkey" text NOT NULL,
  "start_date" text NOT NULL,
  "end_date" text NOT NULL,
  "encrypted_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "availability_blocks_hub_user_idx" ON "user_availability_blocks" ("hub_id", "user_pubkey");
CREATE INDEX IF NOT EXISTS "availability_blocks_hub_date_idx" ON "user_availability_blocks" ("hub_id", "start_date", "end_date");

-- Shift join/leave requests
CREATE TABLE IF NOT EXISTS "shift_join_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "hub_id" text NOT NULL,
  "shift_id" text NOT NULL REFERENCES "shifts" ("id") ON DELETE CASCADE,
  "user_pubkey" text NOT NULL,
  "type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "shift_join_requests_hub_idx" ON "shift_join_requests" ("hub_id", "status");
