import { signalAuditLog } from './db/schema'
import type { Db } from './db/connection'

export type AuditAction =
  | 'register'
  | 'unregister'
  | 'notify'
  | 'notify_failed'
  | 'lookup'
  | 'rate_limited'

export interface AuditEntry {
  action: AuditAction
  identifierHash?: string
  success: boolean
  errorMessage?: string
  metadata?: string
}

export class AuditLogger {
  constructor(private db: Db) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.db.insert(signalAuditLog).values({
      action: entry.action,
      identifierHash: entry.identifierHash ?? null,
      success: entry.success ? 'true' : 'false',
      errorMessage: entry.errorMessage ?? null,
      metadata: entry.metadata ?? null,
    })
  }
}
