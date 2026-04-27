import { Database } from 'bun:sqlite'

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
 */
export class IdentifierStore {
  private db: Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS identifiers (
          hash TEXT PRIMARY KEY,
          plaintext TEXT NOT NULL,
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
    this.db
      .prepare(
        'INSERT OR REPLACE INTO identifiers (hash, plaintext, type, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(hash, plaintext, type, Date.now())
  }

  lookup(hash: string): StoredIdentifier | null {
    const row = this.db
      .prepare(
        'SELECT hash, plaintext, type, created_at as createdAt FROM identifiers WHERE hash = ?'
      )
      .get(hash) as StoredIdentifier | null
    return row ?? null
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
}
