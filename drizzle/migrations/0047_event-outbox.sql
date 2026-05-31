CREATE TABLE "event_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_json" jsonb NOT NULL,
	"hub_id" text,
	"kind" integer NOT NULL,
	"epoch" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "event_outbox_pending_idx" ON "event_outbox" USING btree ("next_retry_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "event_outbox_cleanup_idx" ON "event_outbox" USING btree ("status","created_at") WHERE status IN ('delivered', 'failed');