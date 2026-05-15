/**
 * TaskScheduler — periodic background task runner.
 *
 * Manages the blast delivery worker and scheduled blast poller.
 * Started at server boot; stopped on graceful shutdown.
 */
import type { Database } from '../db'
import type { BlastsService } from './blasts'
import type { SettingsService } from './settings'
import {
  startBlastWorker,
  stopBlastWorker,
  type AdapterResolver,
  type BlastProgressCallback,
  type BlastStatusCallback,
} from '../lib/blast-delivery-worker'
import {
  startScheduledBlastPoller,
  stopScheduledBlastPoller,
} from '../lib/blast-scheduled-poller'
import {
  startRetentionPurgeWorker,
  stopRetentionPurgeWorker,
} from '../lib/retention-purge-worker'
import {
  startErasureExpiryWorker,
  stopErasureExpiryWorker,
} from '../lib/erasure-expiry-worker'
import {
  startReEncryptionWorker,
  stopReEncryptionWorker,
} from '../lib/re-encryption-worker'
import type { RetentionService } from './retention'
import type { ErasureService } from './erasure'
import type { AuditService } from './audit'
import { createLogger } from '../lib/logger'

const logger = createLogger('services.scheduler')

export interface TaskSchedulerDeps {
  blastsService: BlastsService
  settingsService: SettingsService
  resolveAdapter: AdapterResolver
  resolveIdentifier: (subscriberId: string) => Promise<string | null>
  onBlastProgress?: BlastProgressCallback
  onBlastStatusChange?: BlastStatusCallback
  retentionService?: RetentionService
  auditService?: AuditService
  erasureService?: ErasureService
}

export class TaskScheduler {
  private started = false

  constructor(protected db: Database) {}

  /**
   * Start all background task workers.
   * Call this after all services are initialized.
   */
  start(deps?: TaskSchedulerDeps): void {
    if (this.started) return
    this.started = true

    if (deps) {
      // Start blast delivery worker
      startBlastWorker({
        blastsService: deps.blastsService,
        settingsService: deps.settingsService,
        resolveAdapter: deps.resolveAdapter,
        resolveIdentifier: deps.resolveIdentifier,
        onProgress: deps.onBlastProgress,
        onStatusChange: deps.onBlastStatusChange,
      })

      // Start scheduled blast poller
      startScheduledBlastPoller(deps.blastsService)

      if (deps.retentionService && deps.auditService) {
        startRetentionPurgeWorker({
          retentionService: deps.retentionService,
          auditService: deps.auditService,
          settingsService: deps.settingsService,
        })
      }

      if (deps.erasureService && deps.auditService) {
        startErasureExpiryWorker({
          erasureService: deps.erasureService,
          auditService: deps.auditService,
        })
      }

      if (deps.erasureService) {
        startReEncryptionWorker({
          erasureService: deps.erasureService,
        })
      }
    }

    logger.info('Started')
  }

  /**
   * Stop all background task workers.
   */
  stop(): void {
    if (!this.started) return
    this.started = false

    stopBlastWorker()
    stopScheduledBlastPoller()
    stopRetentionPurgeWorker()
    stopErasureExpiryWorker()
    stopReEncryptionWorker()

    logger.info('Stopped')
  }
}
