CREATE TABLE "hub_onboarding_state" (
	"hub_id" text PRIMARY KEY NOT NULL,
	"template_id" text,
	"current_step" text DEFAULT 'template_selection' NOT NULL,
	"completed_steps" text[] DEFAULT '{}'::text[] NOT NULL,
	"channel_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"provider_type" text NOT NULL,
	"default_channels" text[] DEFAULT '{}'::text[] NOT NULL,
	"credential_hints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommended_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allow_sub_accounts" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "hub_onboarding_state" ADD CONSTRAINT "hub_onboarding_state_hub_id_hubs_id_fk" FOREIGN KEY ("hub_id") REFERENCES "public"."hubs"("id") ON DELETE cascade ON UPDATE no action;