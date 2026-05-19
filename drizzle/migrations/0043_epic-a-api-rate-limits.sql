CREATE TABLE "api_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_rate_limits_window_idx"
  ON "api_rate_limits" ("window_start");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_device_info_device_id_idx"
  ON "sessions" ((device_info->>'deviceId'))
  WHERE device_info IS NOT NULL;
