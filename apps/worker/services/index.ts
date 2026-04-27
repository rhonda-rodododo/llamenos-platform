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
import { CryptoKeysService } from './crypto-keys'
import { FirehoseService } from './firehose'
import { FirehoseAgentService } from './firehose-agent'

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
  /** Phase 6: sigchain, PUK envelope, and MLS message operations */
  cryptoKeys: CryptoKeysService
  firehose: FirehoseService
  firehoseAgent?: FirehoseAgentService
}

export function createServices(db: Database, opts?: { hmacSecret?: string; firehoseSealKey?: string; env?: Record<string, string | undefined> }): Services {
  const audit = new AuditService(db)
  const settings = new SettingsService(db)
  const conversations = new ConversationsService(db, opts?.hmacSecret)
  const firehose = new FirehoseService(db)

  const services: Services = {
    identity: new IdentityService(db),
    settings,
    records: new RecordsService(db, audit),
    audit,
    shifts: new ShiftsService(db),
    calls: new CallsService(db),
    conversations,
    blasts: new BlastsService(db, opts?.hmacSecret),
    contacts: new ContactsService(db),
    cases: new CasesService(db),
    scheduler: new TaskScheduler(db),
    cryptoKeys: new CryptoKeysService(db),
    firehose,
  }

  // Only create firehose agent if seal key is configured
  if (opts?.firehoseSealKey) {
    services.firehoseAgent = new FirehoseAgentService(
      db,
      firehose,
      conversations,
      audit,
      settings,
      opts.firehoseSealKey,
      opts.env ?? {},
    )
  }

  return services
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
  CryptoKeysService,
  FirehoseService,
  FirehoseAgentService,
}
