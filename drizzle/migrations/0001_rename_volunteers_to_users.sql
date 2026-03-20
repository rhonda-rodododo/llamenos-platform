-- Rename volunteers table to users
ALTER TABLE "volunteers" RENAME TO "users";
--> statement-breakpoint

-- Rename FK constraints
ALTER TABLE "sessions" RENAME CONSTRAINT "sessions_pubkey_volunteers_pubkey_fk"
  TO "sessions_pubkey_users_pubkey_fk";
--> statement-breakpoint
ALTER TABLE "webauthn_credentials" RENAME CONSTRAINT "webauthn_credentials_pubkey_volunteers_pubkey_fk"
  TO "webauthn_credentials_pubkey_users_pubkey_fk";
--> statement-breakpoint
ALTER TABLE "devices" RENAME CONSTRAINT "devices_pubkey_volunteers_pubkey_fk"
  TO "devices_pubkey_users_pubkey_fk";
--> statement-breakpoint

-- Rename columns in custom_field_definitions
ALTER TABLE "custom_field_definitions"
  RENAME COLUMN "visible_to_volunteers" TO "visible_to_users";
--> statement-breakpoint
ALTER TABLE "custom_field_definitions"
  RENAME COLUMN "editable_by_volunteers" TO "editable_by_users";
--> statement-breakpoint

-- Rename column in system_settings
ALTER TABLE "system_settings"
  RENAME COLUMN "allow_volunteer_transcription_opt_out" TO "allow_user_transcription_opt_out";
--> statement-breakpoint

-- Rename column in shifts
ALTER TABLE "shifts"
  RENAME COLUMN "volunteer_pubkeys" TO "user_pubkeys";
--> statement-breakpoint

-- Fix roles column default: 'volunteer' -> 'role-volunteer'
ALTER TABLE "users"
  ALTER COLUMN "roles" SET DEFAULT '{"role-volunteer"}'::text[];
--> statement-breakpoint

-- Migrate stored permission strings: volunteers:* -> users:*
UPDATE "roles"
SET permissions = ARRAY(
  SELECT CASE
    WHEN unnest LIKE 'volunteers:%'
    THEN 'users:' || substring(unnest FROM 12)
    ELSE unnest
  END
  FROM unnest(permissions)
)
WHERE permissions && ARRAY[
  'volunteers:read', 'volunteers:create', 'volunteers:update',
  'volunteers:delete', 'volunteers:manage-roles',
  'volunteers:read-cases', 'volunteers:read-metrics',
  'volunteers:*'
];
