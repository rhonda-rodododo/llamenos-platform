ALTER TABLE "contacts" ADD COLUMN "needs_reencryption" boolean DEFAULT false NOT NULL;

-- Flag existing contacts with empty summary envelopes: these lack HPKE key-wrapping,
-- meaning the encrypted_summary value cannot be decrypted by any hub member.
-- This indicates plaintext data stored before E2EE was implemented.
UPDATE "contacts"
  SET "needs_reencryption" = true
  WHERE "summary_envelopes" = '[]'::jsonb;

-- Also flag contacts where pii_envelopes is missing but encrypted_pii is set.
UPDATE "contacts"
  SET "needs_reencryption" = true
  WHERE "encrypted_pii" IS NOT NULL
    AND ("pii_envelopes" IS NULL OR "pii_envelopes" = '[]'::jsonb);