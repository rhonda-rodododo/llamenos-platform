-- Firehose connections: links Signal groups to inference agents
CREATE TABLE IF NOT EXISTS "firehose_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "hub_id" text NOT NULL,
  "signal_group_id" text,
  "display_name" text NOT NULL DEFAULT '',
  "encrypted_display_name" jsonb,
  "report_type_id" text NOT NULL,
  "agent_pubkey" text NOT NULL,
  "encrypted_agent_nsec" text NOT NULL,
  "geo_context" text,
  "geo_context_country_codes" text[],
  "inference_endpoint" text,
  "extraction_interval_sec" integer NOT NULL DEFAULT 60,
  "system_prompt_suffix" text,
  "buffer_ttl_days" integer NOT NULL DEFAULT 7,
  "notify_via_signal" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "firehose_connections_hub_idx" ON "firehose_connections" ("hub_id");
CREATE INDEX IF NOT EXISTS "firehose_connections_signal_group_idx" ON "firehose_connections" ("signal_group_id");

-- Firehose message buffer: encrypted chat messages awaiting extraction
CREATE TABLE IF NOT EXISTS "firehose_message_buffer" (
  "id" text PRIMARY KEY NOT NULL,
  "connection_id" text NOT NULL REFERENCES "firehose_connections" ("id") ON DELETE CASCADE,
  "signal_timestamp" timestamp with time zone NOT NULL,
  "encrypted_content" text NOT NULL,
  "encrypted_sender_info" text NOT NULL,
  "window_key_id" text,
  "cluster_id" text,
  "extracted_report_id" text,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "firehose_buffer_connection_idx" ON "firehose_message_buffer" ("connection_id");
CREATE INDEX IF NOT EXISTS "firehose_buffer_expires_idx" ON "firehose_message_buffer" ("expires_at");
CREATE INDEX IF NOT EXISTS "firehose_buffer_window_key_idx" ON "firehose_message_buffer" ("window_key_id");

-- Firehose window keys: per-window ephemeral keys for forward secrecy
CREATE TABLE IF NOT EXISTS "firehose_window_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "connection_id" text NOT NULL REFERENCES "firehose_connections" ("id") ON DELETE CASCADE,
  "sealed_key" text NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "window_end" timestamp with time zone NOT NULL,
  "message_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "firehose_window_keys_connection_idx" ON "firehose_window_keys" ("connection_id");
CREATE INDEX IF NOT EXISTS "firehose_window_keys_window_idx" ON "firehose_window_keys" ("connection_id", "window_start");

-- Firehose notification opt-outs: per-user opt-out from Signal DM notifications
CREATE TABLE IF NOT EXISTS "firehose_notification_optouts" (
  "id" text PRIMARY KEY NOT NULL,
  "connection_id" text NOT NULL REFERENCES "firehose_connections" ("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "opted_out_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "firehose_optout_unique" ON "firehose_notification_optouts" ("connection_id", "user_id");
