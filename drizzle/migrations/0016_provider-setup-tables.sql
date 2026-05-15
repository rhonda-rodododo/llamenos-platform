CREATE TABLE "a2p_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"provider_type" text NOT NULL,
	"brand_status" text DEFAULT 'not_submitted' NOT NULL,
	"campaign_status" text DEFAULT 'not_submitted' NOT NULL,
	"brand_sid" text,
	"campaign_sid" text,
	"error" text,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"hub_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"redirect_url" text NOT NULL,
	"callback_scheme" text,
	"error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text,
	"provider_type" text NOT NULL,
	"credentials" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
	"phone_numbers" text[] DEFAULT '{}'::text[] NOT NULL,
	"error" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signal_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"hub_id" text NOT NULL,
	"bridge_url" text,
	"phone_number" text NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "a2p_registrations" ADD CONSTRAINT "a2p_registrations_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_registrations" ADD CONSTRAINT "signal_registrations_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_settings" DROP COLUMN "telephony_provider";--> statement-breakpoint
ALTER TABLE "system_settings" DROP COLUMN "telephony_provider";