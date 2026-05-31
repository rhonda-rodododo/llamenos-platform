-- Migration 0014: Flag legacy plaintext contacts for re-encryption
-- Epic 262: Legacy contacts created before E2EE was implemented may have
-- plaintext data in encrypted_summary with no HPKE key-wrapping envelopes.
--
-- Detection: contacts with an empty summary_envelopes array cannot be
-- decrypted by any hub member, which indicates plaintext storage.

-- Add the flag column
ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "needs_reencryption" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "contacts_needs_reencryption_idx"
  ON "contacts" ("needs_reencryption")
  WHERE "needs_reencryption" = true;

-- Flag all existing contacts whose summary envelopes are empty.
-- These records store plaintext (or corrupted data) in encrypted_summary
-- because no HPKE-wrapped keys exist for any hub member to decrypt them.
UPDATE "contacts"
  SET "needs_reencryption" = true
  WHERE "summary_envelopes" = '[]'::jsonb;

-- Also flag contacts where pii_envelopes is missing but encrypted_pii is set,
-- indicating PII was stored without key-wrapping envelopes.
UPDATE "contacts"
  SET "needs_reencryption" = true
  WHERE "encrypted_pii" IS NOT NULL
    AND ("pii_envelopes" IS NULL OR "pii_envelopes" = '[]'::jsonb);
