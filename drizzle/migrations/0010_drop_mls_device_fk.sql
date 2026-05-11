DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'mls_pending_messages'
  ) THEN
    ALTER TABLE "mls_pending_messages"
      DROP CONSTRAINT IF EXISTS "mls_pending_messages_recipient_device_id_devices_id_fk";
  END IF;
END $$;
