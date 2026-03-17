/**
 * Service registry — creates all service instances from a database connection.
 *
 * Services replace Durable Objects. Each service owns a domain's tables
 * and provides typed methods for CRUD and business logic.
 */
import type { Database } from '../db'

import { IdentityService } from './identity'
import { SettingsService } from './settings'
import { RecordsService } from './records'
import { AuditService } from './audit'
import { ShiftsService } from './shifts'
import { CallsService } from './calls'
import { ConversationsService } from './conversations'
import { BlastsService } from './blasts'
import { ContactsService } from './contacts'
import { CasesService } from './cases'
import { TaskScheduler } from './scheduler'

export interface Services {
  identity: IdentityService
  settings: SettingsService
  records: RecordsService
  audit: AuditService
  shifts: ShiftsService
  calls: CallsService
  conversations: ConversationsService
  blasts: BlastsService
  contacts: ContactsService
  cases: CasesService
  scheduler: TaskScheduler
}

export function createServices(db: Database, opts?: { hmacSecret?: string }): Services {
  const audit = new AuditService(db)
  return {
    identity: new IdentityService(db),
    settings: new SettingsService(db),
    records: new RecordsService(db, audit),
    audit,
    shifts: new ShiftsService(db),
    calls: new CallsService(db),
    conversations: new ConversationsService(db, opts?.hmacSecret),
    blasts: new BlastsService(db, opts?.hmacSecret),
    contacts: new ContactsService(db),
    cases: new CasesService(db),
    scheduler: new TaskScheduler(db),
  }
}

// Re-export service classes for direct import
export {
  IdentityService,
  SettingsService,
  RecordsService,
  AuditService,
  ShiftsService,
  CallsService,
  ConversationsService,
  BlastsService,
  ContactsService,
  CasesService,
  TaskScheduler,
}
