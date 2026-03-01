// Re-export Durable Object classes
export { IdentityDO } from './durable-objects/identity-do'
export { SettingsDO } from './durable-objects/settings-do'
export { RecordsDO } from './durable-objects/records-do'
export { ShiftManagerDO } from './durable-objects/shift-manager'
export { CallRouterDO } from './durable-objects/call-router'
export { ConversationDO } from './durable-objects/conversation-do'
export { BlastDO } from './durable-objects/blast-do'

import app from './app'
import type { Env } from './types'
import { getDOs } from './lib/do-access'

export default {
  fetch: app.fetch,

  /**
   * CF Cron Trigger handler — resets all 6 DOs when DEMO_MODE is enabled.
   * Visitors arrive at a fresh state → setup wizard → full onboarding experience.
   */
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    if (env.DEMO_MODE !== 'true') return

    const dos = getDOs(env)
    await Promise.all([
      dos.identity.fetch(new Request('http://do/reset', { method: 'POST' })),
      dos.settings.fetch(new Request('http://do/reset', { method: 'POST' })),
      dos.records.fetch(new Request('http://do/reset', { method: 'POST' })),
      dos.shifts.fetch(new Request('http://do/reset', { method: 'POST' })),
      dos.calls.fetch(new Request('http://do/reset', { method: 'POST' })),
      dos.conversations.fetch(new Request('http://do/reset', { method: 'POST' })),
      dos.blasts.fetch(new Request('http://do/reset', { method: 'POST' })),
    ])
  },
}
