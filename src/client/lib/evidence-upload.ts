/**
 * Evidence upload preparation.
 *
 * Everything the server persists about an evidence file must be derived from the
 * CIPHERTEXT, never the plaintext:
 *   - `integrityHash` is SHA-256 of the encrypted bytes (evidenceMetadataSchema:
 *     "SHA-256 of encrypted file at upload"). A hash of the plaintext stored next
 *     to the ciphertext is a confirmation oracle — anyone who can guess or
 *     enumerate a candidate file can hash it and compare, without decrypting.
 *   - `sizeBytes` is the byte length of what is actually stored (the ciphertext),
 *     not the plaintext length.
 * The plaintext checksum / name / size live only inside the per-recipient
 * `encryptedMetadata` produced by encryptFile().
 */

import { encryptFile, type EncryptedFileUpload } from './file-crypto'

export interface PreparedEvidenceUpload {
  encrypted: EncryptedFileUpload
  /** Byte length of the encrypted content that will be uploaded. */
  sizeBytes: number
  /** SHA-256 (hex) of the encrypted content that will be uploaded. */
  integrityHash: string
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function prepareEvidenceUpload(
  file: File,
  recipientPubkeys: string[],
): Promise<PreparedEvidenceUpload> {
  const encrypted = await encryptFile(file, recipientPubkeys)
  return {
    encrypted,
    sizeBytes: encrypted.encryptedContent.length,
    integrityHash: await sha256Hex(encrypted.encryptedContent),
  }
}
