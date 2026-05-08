-- HPKE envelope migration: rename hub_keys columns from ECIES to HPKE format
-- wrappedKey → ct (HPKE ciphertext), ephemeralPubkey → enc (HPKE ephemeral pubkey)
ALTER TABLE "hub_keys" RENAME COLUMN "wrapped_key" TO "ct";
ALTER TABLE "hub_keys" RENAME COLUMN "ephemeral_pubkey" TO "enc";
