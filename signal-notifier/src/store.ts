import { Database } from 'bun:sqlite'
import { deriveKey, encrypt, decrypt, generateSalt } from './crypto'

export interface StoredIdentifier {
  hash: string
  plaintext: string
  type: 'phone' | 'username'
  createdAt: number
}

/**
 * SQLite-backed store mapping HMAC hashes → plaintext Signal identifiers.
 *
 * The app server NEVER stores plaintext Signal identifiers — only HMAC hashes.
 * This sidecar is the only place plaintext is held, in an isolated SQLite DB.
 * Sensitive columns (plaintext identifiers) are encrypted at rest using AES-256-GCM
 * with a key derived from the bearer token via HKDF-SHA256.
 */
export class IdentifierStore {
  private db: Database
  private key: Buffer

  constructor(dbPath: string, encryptionSecret: string) {
    this.db = new Database(dbPath)
    this.key = deriveKey(encryptionSecret, generateSalt(encryptionSecret))
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS identifiers (
          hash TEXT PRIMARY KEY,
          ciphertext TEXT NOT NULL,
          type TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`
      )
      .run()
  }

  close(): void {
    this.db.close()
  }

  register(hash: string, plaintext: string, type: 'phone' | 'username'): void {
    const ciphertext = encrypt(plaintext, this.key)
    this.db
      .prepare(
        'INSERT OR REPLACE INTO identifiers (hash, ciphertext, type, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(hash, ciphertext, type, Date.now())
  }

  lookup(hash: string): StoredIdentifier | null {
    const row = this.db
      .prepare(
        'SELECT hash, ciphertext, type, created_at as createdAt FROM identifiers WHERE hash = ?'
      )
      .get(hash) as { hash: string; ciphertext: string; type: 'phone' | 'username'; createdAt: number } | null
    if (!row) return null
    const plaintext = decrypt(row.ciphertext, this.key)
    if (plaintext === null) return null
    return {
      hash: row.hash,
      plaintext,
      type: row.type,
      createdAt: row.createdAt,
    }
  }

  remove(hash: string): void {
    this.db.prepare('DELETE FROM identifiers WHERE hash = ?').run(hash)
  }

  count(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as n FROM identifiers')
      .get() as { n: number }
    return row.n
  }

  /**
   * Check if a hash is registered without decrypting the plaintext.
   * Returns true if the hash exists in the store.
   */
  isRegistered(hash: string): boolean {
    const row = this.db
      .prepare('SELECT 1 as exists_flag FROM identifiers WHERE hash = ?')
      .get(hash) as { exists_flag: number } | null
    return row !== null
  }
}
