/**
 * TaskScheduler — periodic background task runner.
 *
 * Manages the blast delivery worker and scheduled blast poller.
 * Started at server boot; stopped on graceful shutdown.
 */
import type { Database } from '../db'
import type { BlastsService } from './blasts'
import type { SettingsService } from './settings'
import type { MessagingChannelType } from '@shared/types'
import type { MessagingAdapter } from '../messaging/adapter'
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

export interface TaskSchedulerDeps {
  blastsService: BlastsService
  settingsService: SettingsService
  resolveAdapter: AdapterResolver
  resolveIdentifier?: (subscriberId: string) => Promise<string | null>
  onBlastProgress?: BlastProgressCallback
  onBlastStatusChange?: BlastStatusCallback
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
    }

    console.log('[scheduler] Started')
  }

  /**
   * Stop all background task workers.
   */
  stop(): void {
    if (!this.started) return
    this.started = false

    stopBlastWorker()
    stopScheduledBlastPoller()

    console.log('[scheduler] Stopped')
  }
}
