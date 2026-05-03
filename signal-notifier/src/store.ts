import { eq, sql } from 'drizzle-orm'
import { deriveKey, encrypt, decrypt, generateSalt } from './crypto'
import { signalIdentifiers } from './db/schema'
import type { Db } from './db/connection'

export interface StoredIdentifier {
  hash: string
  plaintext: string
  type: 'phone' | 'username'
  createdAt: number
}

/**
 * PostgreSQL-backed store mapping HMAC hashes -> plaintext Signal identifiers.
 *
 * The app server NEVER stores plaintext Signal identifiers -- only HMAC hashes.
 * This sidecar is the only place plaintext is held, in an isolated PostgreSQL table.
 * Sensitive columns (plaintext identifiers) are encrypted at rest using AES-256-GCM
 * with a key derived from the bearer token via HKDF-SHA256.
 */
export class IdentifierStore {
  private db: Db
  private key: Buffer

  constructor(db: Db, encryptionSecret: string) {
    this.db = db
    this.key = deriveKey(encryptionSecret, generateSalt(encryptionSecret))
  }

  async register(hash: string, plaintext: string, type: 'phone' | 'username'): Promise<void> {
    const ciphertext = encrypt(plaintext, this.key)
    await this.db
      .insert(signalIdentifiers)
      .values({ hash, ciphertext, type, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: signalIdentifiers.hash,
        set: { ciphertext, type, createdAt: Date.now() },
      })
  }

  async lookup(hash: string): Promise<StoredIdentifier | null> {
    const rows = await this.db
      .select()
      .from(signalIdentifiers)
      .where(eq(signalIdentifiers.hash, hash))
      .limit(1)

    if (rows.length === 0) return null
    const row = rows[0]
    const plaintext = decrypt(row.ciphertext, this.key)
    if (plaintext === null) return null
    return {
      hash: row.hash,
      plaintext,
      type: row.type,
      createdAt: row.createdAt,
    }
  }

  async remove(hash: string): Promise<void> {
    await this.db.delete(signalIdentifiers).where(eq(signalIdentifiers.hash, hash))
  }

  async count(): Promise<number> {
    const result = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(signalIdentifiers)
    return result[0]?.n ?? 0
  }

  async isRegistered(hash: string): Promise<boolean> {
    const result = await this.db
      .select({ hash: signalIdentifiers.hash })
      .from(signalIdentifiers)
      .where(eq(signalIdentifiers.hash, hash))
      .limit(1)
    return result.length > 0
  }
}
