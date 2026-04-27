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
import { SignalContactsService } from './signal-contacts'
import { SecurityPrefsService } from './security-prefs'
import { UserNotificationsService } from './user-notifications'
import { DigestCronService } from './digest-cron'

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
  signalContacts: SignalContactsService
  securityPrefs: SecurityPrefsService
  userNotifications: UserNotificationsService
  digestCron: DigestCronService
}

export interface ServicesOpts {
  hmacSecret?: string
  firehoseSealKey?: string
  env?: Record<string, string | undefined>
  notifierUrl?: string
  notifierApiKey?: string
  /** Secret shared with the sidecar for signing client registration tokens. Falls back to hmacSecret. */
  notifierTokenSecret?: string
}

export function createServices(db: Database, opts?: ServicesOpts): Services {
  const audit = new AuditService(db)
  const settings = new SettingsService(db)
  const conversations = new ConversationsService(db, opts?.hmacSecret)
  const firehose = new FirehoseService(db)
  const signalContacts = new SignalContactsService(db, opts?.hmacSecret ?? '')
  const securityPrefs = new SecurityPrefsService(db)
  const userNotifications = new UserNotificationsService(signalContacts, securityPrefs, audit, {
    notifierUrl: opts?.notifierUrl ?? '',
    notifierApiKey: opts?.notifierApiKey ?? '',
    tokenSecret: opts?.notifierTokenSecret ?? opts?.hmacSecret ?? '',
  })
  const digestCron = new DigestCronService(db, userNotifications, securityPrefs)

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
    signalContacts,
    securityPrefs,
    userNotifications,
    digestCron,
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
  SignalContactsService,
  SecurityPrefsService,
  UserNotificationsService,
  DigestCronService,
}
