-- Drop FK constraint from mls_pending_messages.recipient_device_id.
-- MLS device IDs are cryptographic identifiers from the MLS protocol layer;
-- they do not need to be registered in the devices table (which tracks push
-- notification registrations).  The FK constraint incorrectly blocked fan-out
-- commits and welcome messages to devices that have not yet registered a push
-- token, which is a valid and common MLS scenario.
ALTER TABLE "mls_pending_messages" DROP CONSTRAINT IF EXISTS "mls_pending_messages_recipient_device_id_devices_id_fk";
