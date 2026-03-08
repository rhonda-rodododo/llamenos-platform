# Epic 285: Storage Cleanup & TTL

**Status**: PENDING
**Priority**: Medium
**Depends on**: None
**Blocks**: None
**Branch**: `desktop`

## Summary

Add TTL-based cleanup for ephemeral data across all Durable Objects. Implement periodic cleanup alarms that prune expired CAPTCHA state, sessions, rate-limit entries, invite codes, provisioning rooms, and old conversation data. Add conversation archival for completed conversations older than a configurable threshold.

## Problem Statement

Multiple Durable Objects store ephemeral data that is never cleaned up, causing unbounded storage growth:

1. **CAPTCHA state (SettingsDO)**: Stored per-callSid at `captcha:${callSid}`. The `alarm()` method cleans up rate-limit keys but does NOT clean up CAPTCHA keys. Every call that triggers voice CAPTCHA leaves a ~50-byte entry permanently. At 100 calls/day with CAPTCHA enabled, this is 1.5MB/year of dead state.

2. **Expired sessions (IdentityDO)**: Session cleanup exists in `alarm()` (lines 194-199) but the alarm is only set when a WebAuthn challenge is stored (line 463) or a provisioning room is created (line 567). If neither of those happens, the alarm never fires and expired sessions accumulate indefinitely. Sessions are 8 hours, so a volunteer who logs in daily creates ~365 expired session entries/year (~25KB/year per volunteer).

3. **Rate-limit timestamp arrays (SettingsDO)**: Cleanup exists in `alarm()` but depends on the alarm being set. The alarm is only scheduled from `checkRateLimit()` (line 314) and `storeCaptcha()` (line 631). If rate limiting stops being triggered (e.g., attack subsides), leftover entries remain forever.

4. **Redeemed/expired invites (IdentityDO)**: The `invites` array grows monotonically. `getInvites()` filters out used invites for display (line 343), but the storage key keeps growing. After 1000 invites over the org's lifetime, this is ~100KB.

5. **Completed provisioning rooms (IdentityDO)**: Cleanup exists in `alarm()` (lines 203-209) but has the same alarm-scheduling gap as sessions.

6. **External ID mappings (ConversationDO)**: Every outbound message stores `external-id:${externalId}` for status tracking. After the delivery status is final (delivered/read/failed), these mappings are never removed. At 100 messages/day, this is ~10KB/year.

7. **Stale volunteer load counters (ConversationDO)**: `volunteer-load:${pubkey}` and `volunteer-conversations:${pubkey}` persist even after a volunteer is removed from the system.

8. **Old closed conversations**: Conversations and their messages are stored indefinitely. A high-volume hotline accumulates hundreds of MB of encrypted message arrays over months. There is no archival or purge mechanism.

## Implementation

### Phase 1: TTL Constants & Configuration

Define TTL values as configurable constants with sensible defaults.

**`apps/worker/lib/ttl.ts`:**

```typescript
/**
 * TTL constants for ephemeral data cleanup.
 * All values in milliseconds.
 *
 * These are defaults — admins can override some via SettingsDO.
 */
export const TTL = {
  /** CAPTCHA challenge validity. After this, the entry is garbage. */
  CAPTCHA: 5 * 60 * 1000,              // 5 minutes

  /** WebAuthn challenge validity. */
  WEBAUTHN_CHALLENGE: 5 * 60 * 1000,   // 5 minutes

  /** Server session duration (also enforced at validation time). */
  SESSION: 8 * 60 * 60 * 1000,         // 8 hours

  /** Rate-limit window. Entries older than this are garbage. */
  RATE_LIMIT: 60 * 1000,               // 1 minute

  /** Provisioning room validity. */
  PROVISION_ROOM: 5 * 60 * 1000,       // 5 minutes

  /** Invite code validity (default, can be overridden per invite). */
  INVITE: 7 * 24 * 60 * 60 * 1000,     // 7 days

  /** External ID mapping — kept for status updates, then pruned. */
  EXTERNAL_ID_MAPPING: 24 * 60 * 60 * 1000, // 24 hours

  /** Closed conversation archival threshold. */
  CONVERSATION_ARCHIVE: 90 * 24 * 60 * 60 * 1000, // 90 days

  /** Stale active call threshold (for CallRouterDO cleanup). */
  STALE_RINGING_CALL: 3 * 60 * 1000,   // 3 minutes
  STALE_IN_PROGRESS_CALL: 2 * 60 * 60 * 1000, // 2 hours

  /** Cleanup alarm interval — how often each DO runs its cleanup. */
  CLEANUP_INTERVAL: 5 * 60 * 1000,     // 5 minutes
} as const
```

### Phase 2: SettingsDO Cleanup Enhancement

The current `alarm()` only cleans rate-limit entries. Add CAPTCHA cleanup and ensure the alarm is always scheduled.

**`apps/worker/durable-objects/settings-do.ts`:**

```typescript
import { TTL } from '../lib/ttl'

export class SettingsDO extends DurableObject<Env> {
  // ...

  async fetch(request: Request): Promise<Response> {
    // ... existing migration/init ...

    // Ensure cleanup alarm is always running
    await this.ensureCleanupAlarm()

    return this.router.handle(request)
  }

  private async ensureCleanupAlarm(): Promise<void> {
    const alarm = await this.ctx.storage.getAlarm()
    if (!alarm) {
      await this.ctx.storage.setAlarm(Date.now() + TTL.CLEANUP_INTERVAL)
    }
  }

  override async alarm() {
    const now = Date.now()
    let totalCleaned = 0

    // 1. Clean up expired rate-limit entries
    const rlKeys = await this.ctx.storage.list({ prefix: 'ratelimit:' })
    for (const [key, value] of rlKeys) {
      const timestamps = value as number[]
      const recent = timestamps.filter(t => now - t < TTL.RATE_LIMIT)
      if (recent.length === 0) {
        await this.ctx.storage.delete(key)
        totalCleaned++
      } else if (recent.length !== timestamps.length) {
        await this.ctx.storage.put(key, recent)
      }
    }

    // 2. Clean up expired CAPTCHA state
    const captchaKeys = await this.ctx.storage.list({ prefix: 'captcha:' })
    for (const [key, value] of captchaKeys) {
      const data = value as { createdAt: number }
      if (now - data.createdAt > TTL.CAPTCHA) {
        await this.ctx.storage.delete(key)
        totalCleaned++
      }
    }

    // 3. Always reschedule the alarm
    await this.ctx.storage.setAlarm(now + TTL.CLEANUP_INTERVAL)

    if (totalCleaned > 0) {
      console.log(`[SettingsDO] Cleaned ${totalCleaned} expired entries`)
    }
  }
}
```

### Phase 3: IdentityDO Cleanup Enhancement

Fix the alarm-scheduling gap and add comprehensive cleanup for sessions, challenges, provisioning rooms, and invites.

**`apps/worker/durable-objects/identity-do.ts`:**

```typescript
import { TTL } from '../lib/ttl'

export class IdentityDO extends DurableObject<Env> {
  // ...

  async fetch(request: Request): Promise<Response> {
    // ... existing migration/init ...
    await this.ensureCleanupAlarm()
    return this.router.handle(request)
  }

  private async ensureCleanupAlarm(): Promise<void> {
    const alarm = await this.ctx.storage.getAlarm()
    if (!alarm) {
      await this.ctx.storage.setAlarm(Date.now() + TTL.CLEANUP_INTERVAL)
    }
  }

  override async alarm() {
    const now = Date.now()
    let totalCleaned = 0

    // 1. Clean up expired WebAuthn challenges
    const challengeKeys = await this.ctx.storage.list({ prefix: 'webauthn:challenge:' })
    for (const [key, value] of challengeKeys) {
      const data = value as { challenge: string; createdAt: number }
      if (now - data.createdAt > TTL.WEBAUTHN_CHALLENGE) {
        await this.ctx.storage.delete(key)
        totalCleaned++
      }
    }

    // 2. Clean up expired sessions
    const sessionKeys = await this.ctx.storage.list({ prefix: 'session:' })
    for (const [key, value] of sessionKeys) {
      const session = value as ServerSession
      if (new Date(session.expiresAt).getTime() < now) {
        await this.ctx.storage.delete(key)
        totalCleaned++
      }
    }

    // 3. Clean up expired provisioning rooms
    const provisionKeys = await this.ctx.storage.list({ prefix: 'provision:' })
    for (const [key, value] of provisionKeys) {
      const room = value as ProvisionRoom
      if (now - room.createdAt > TTL.PROVISION_ROOM) {
        await this.ctx.storage.delete(key)
        totalCleaned++
      }
    }

    // 4. Prune redeemed and expired invites
    const invites = await this.ctx.storage.get<InviteCode[]>('invites') || []
    const activeInvites = invites.filter(i =>
      !i.usedAt && new Date(i.expiresAt).getTime() > now
    )
    if (activeInvites.length !== invites.length) {
      await this.ctx.storage.put('invites', activeInvites)
      totalCleaned += invites.length - activeInvites.length
    }

    // 5. Clean up device records for deleted volunteers
    const volList = await this.ctx.storage.get<string[]>('vol-list')
    if (volList) {
      const deviceKeys = await this.ctx.storage.list({ prefix: 'devices:' })
      for (const [key] of deviceKeys) {
        const pubkey = key.replace('devices:', '')
        if (!volList.includes(pubkey)) {
          await this.ctx.storage.delete(key)
          totalCleaned++
        }
      }
    }

    // Always reschedule
    await this.ctx.storage.setAlarm(now + TTL.CLEANUP_INTERVAL)

    if (totalCleaned > 0) {
      console.log(`[IdentityDO] Cleaned ${totalCleaned} expired entries`)
    }
  }
}
```

### Phase 4: ConversationDO Cleanup Enhancement

Add external ID mapping cleanup, stale volunteer load cleanup, and conversation archival.

**`apps/worker/durable-objects/conversation-do.ts`:**

```typescript
import { TTL } from '../lib/ttl'

export class ConversationDO extends DurableObject<Env> {
  // ...

  async fetch(request: Request): Promise<Response> {
    // ... existing migration ...
    await this.ensureCleanupAlarm()
    return this.router.handle(request)
  }

  private async ensureCleanupAlarm(): Promise<void> {
    const alarm = await this.ctx.storage.getAlarm()
    if (!alarm) {
      await this.ctx.storage.setAlarm(Date.now() + TTL.CLEANUP_INTERVAL)
    }
  }

  override async alarm() {
    const now = Date.now()
    let totalCleaned = 0

    // 1. Auto-close inactive conversations (existing logic)
    const index = await this.getIndex()
    const INACTIVITY_TIMEOUT = 60 * 60 * 1000 // 60 minutes

    let indexChanged = false
    const closedAssignees: Array<{ pubkey: string; conversationId: string }> = []

    for (const entry of index) {
      if (entry.status === 'active' || entry.status === 'waiting') {
        const lastActivity = new Date(entry.lastMessageAt).getTime()
        if (now - lastActivity > INACTIVITY_TIMEOUT) {
          const conv = await this.getConv(entry.id)
          if (conv) {
            if (conv.assignedTo) {
              closedAssignees.push({ pubkey: conv.assignedTo, conversationId: conv.id })
            }
            conv.status = 'closed'
            conv.updatedAt = new Date().toISOString()
            await this.putConversation(conv)
            entry.status = 'closed'
            indexChanged = true
            totalCleaned++
          }
        }
      }
    }

    if (indexChanged) {
      await this.putIndex(index)
      for (const { pubkey, conversationId } of closedAssignees) {
        await this.decrementLoad({ pubkey, conversationId })
      }
    }

    // 2. Clean up expired external ID mappings
    const extKeys = await this.ctx.storage.list({ prefix: 'external-id:' })
    for (const [key, value] of extKeys) {
      const mapping = value as { conversationId: string; messageId: string }
      // Check if the message has a final status
      const messages = await this.ctx.storage.get<EncryptedMessage[]>(`messages:${mapping.conversationId}`)
      if (messages) {
        const msg = messages.find(m => m.id === mapping.messageId)
        if (msg && (msg.status === 'delivered' || msg.status === 'read' || msg.status === 'failed')) {
          // Final status — safe to delete the mapping
          const msgAge = now - new Date(msg.createdAt).getTime()
          if (msgAge > TTL.EXTERNAL_ID_MAPPING) {
            await this.ctx.storage.delete(key)
            totalCleaned++
          }
        }
      }
    }

    // 3. Clean up stale volunteer load counters
    // (volunteers that no longer exist but still have load entries)
    const loadKeys = await this.ctx.storage.list({ prefix: 'volunteer-load:' })
    for (const [key, value] of loadKeys) {
      const load = value as number
      if (load === 0) {
        const pubkey = key.replace('volunteer-load:', '')
        const convIds = await this.ctx.storage.get<string[]>(`volunteer-conversations:${pubkey}`) || []
        if (convIds.length === 0) {
          await this.ctx.storage.delete(key)
          await this.ctx.storage.delete(`volunteer-conversations:${pubkey}`)
          totalCleaned++
        }
      }
    }

    // 4. Archive old closed conversations (move messages to cold key, keep metadata)
    const archiveThreshold = now - TTL.CONVERSATION_ARCHIVE
    for (const entry of index) {
      if (entry.status === 'closed') {
        const lastActivity = new Date(entry.lastMessageAt).getTime()
        if (lastActivity < archiveThreshold) {
          // Archive: delete the message array but keep the conversation record
          // The conversation record is small; messages can be many KB
          const messagesKey = `messages:${entry.id}`
          const messages = await this.ctx.storage.get<EncryptedMessage[]>(messagesKey)
          if (messages && messages.length > 0) {
            // Store an archive marker with count (for UI to show "N messages archived")
            await this.ctx.storage.put(`archived:${entry.id}`, {
              messageCount: messages.length,
              archivedAt: new Date().toISOString(),
              oldestMessageAt: messages[messages.length - 1]?.createdAt,
              newestMessageAt: messages[0]?.createdAt,
            })
            await this.ctx.storage.delete(messagesKey)
            totalCleaned++
          }

          // Also clean up the contact identifier (no longer needed for outbound)
          await this.ctx.storage.delete(`contact:${entry.id}`)
        }
      }
    }

    // Always reschedule
    try {
      await this.ctx.storage.setAlarm(now + TTL.CLEANUP_INTERVAL)
    } catch { /* alarm already set */ }

    if (totalCleaned > 0) {
      console.log(`[ConversationDO] Cleaned ${totalCleaned} entries`)
    }
  }
}
```

### Phase 5: Storage Usage Metrics

Add a storage usage endpoint to each DO for admin visibility.

**Pattern for each DO:**

```typescript
// Add to each DO's router in constructor:
this.router.get('/metrics/storage', async () => {
  return this.getStorageMetrics()
})

private async getStorageMetrics(): Promise<Response> {
  // Count keys by prefix
  const prefixes = ['conv:', 'cidx:', 'messages:', 'external-id:', 'file:', 'contact:', 'archived:']
  const counts: Record<string, number> = {}

  for (const prefix of prefixes) {
    const keys = await this.ctx.storage.list({ prefix })
    counts[prefix] = keys.size
  }

  // Total key count (includes un-prefixed keys like 'conv-index')
  const allKeys = await this.ctx.storage.list()
  counts['_total'] = allKeys.size

  // Estimate total storage size (rough — only counts JSON-serialized values)
  let estimatedSizeBytes = 0
  for (const [_key, value] of allKeys) {
    try {
      estimatedSizeBytes += JSON.stringify(value).length
    } catch {
      estimatedSizeBytes += 100 // estimate for non-JSON values
    }
  }

  return Response.json({
    keyCounts: counts,
    estimatedSizeMB: (estimatedSizeBytes / 1_048_576).toFixed(2),
    estimatedSizeKB: (estimatedSizeBytes / 1024).toFixed(1),
  })
}
```

**Expose via metrics route (`apps/worker/routes/metrics.ts`):**

```typescript
metrics.get('/storage', async (c) => {
  const dos = getDOs(c.env)

  const [settings, identity, conversations, calls, shifts, records, blasts] = await Promise.allSettled([
    dos.settings.fetch(new Request('http://do/metrics/storage')).then(r => r.json()),
    dos.identity.fetch(new Request('http://do/metrics/storage')).then(r => r.json()),
    dos.conversations.fetch(new Request('http://do/metrics/storage')).then(r => r.json()),
    dos.calls.fetch(new Request('http://do/metrics/storage')).then(r => r.json()),
    dos.shifts.fetch(new Request('http://do/metrics/storage')).then(r => r.json()),
    dos.records.fetch(new Request('http://do/metrics/storage')).then(r => r.json()),
    dos.blasts.fetch(new Request('http://do/metrics/storage')).then(r => r.json()),
  ])

  const extract = (r: PromiseSettledResult<unknown>) =>
    r.status === 'fulfilled' ? r.value : { error: 'unavailable' }

  return c.json({
    timestamp: new Date().toISOString(),
    storage: {
      settings: extract(settings),
      identity: extract(identity),
      conversations: extract(conversations),
      calls: extract(calls),
      shifts: extract(shifts),
      records: extract(records),
      blasts: extract(blasts),
    },
  })
})
```

### Phase 6: Admin-Configurable Archive Threshold

Allow admins to configure the conversation archival threshold:

```typescript
// In SettingsDO, add a new setting:
this.router.get('/settings/retention', () => this.getRetentionSettings())
this.router.patch('/settings/retention', async (req) => this.updateRetentionSettings(await req.json()))

interface RetentionSettings {
  conversationArchiveDays: number // Default 90
  sessionMaxHours: number          // Default 8
}

private async getRetentionSettings(): Promise<Response> {
  const settings = await this.ctx.storage.get<RetentionSettings>('retentionSettings') || {
    conversationArchiveDays: 90,
    sessionMaxHours: 8,
  }
  return Response.json(settings)
}

private async updateRetentionSettings(data: Partial<RetentionSettings>): Promise<Response> {
  const current = await this.ctx.storage.get<RetentionSettings>('retentionSettings') || {
    conversationArchiveDays: 90,
    sessionMaxHours: 8,
  }
  const updated = {
    conversationArchiveDays: Math.max(7, Math.min(data.conversationArchiveDays ?? current.conversationArchiveDays, 365)),
    sessionMaxHours: Math.max(1, Math.min(data.sessionMaxHours ?? current.sessionMaxHours, 24)),
  }
  await this.ctx.storage.put('retentionSettings', updated)
  return Response.json(updated)
}
```

## Files to Modify

- `apps/worker/lib/ttl.ts` — **new** TTL constants and defaults
- `apps/worker/durable-objects/settings-do.ts` — enhanced alarm with CAPTCHA cleanup, guaranteed alarm scheduling
- `apps/worker/durable-objects/identity-do.ts` — enhanced alarm with invite pruning, device cleanup, guaranteed scheduling
- `apps/worker/durable-objects/conversation-do.ts` — enhanced alarm with external-id cleanup, load counter cleanup, conversation archival
- `apps/worker/durable-objects/call-router.ts` — add cleanup alarm for stale calls (formalize existing `getActiveCallsList` cleanup)
- `apps/worker/durable-objects/blast-do.ts` — cleanup for completed/cancelled blast delivery records
- `apps/worker/durable-objects/records-do.ts` — add storage metrics route
- `apps/worker/durable-objects/shift-manager.ts` — ensure alarm is always scheduled
- `apps/worker/routes/metrics.ts` — add `/metrics/storage` endpoint
- `apps/worker/routes/settings.ts` — add retention settings endpoints

## Testing

### Unit Tests
- TTL constants are correctly defined (no accidental zero values)
- Alarm handler cleans up entries older than their respective TTL
- Alarm handler does NOT clean up entries within their TTL
- Alarm handler reschedules itself after every run
- Invite pruning removes only redeemed and expired invites
- External-id mapping cleanup only removes mappings with final status
- Conversation archival creates archive marker with correct metadata
- Conversation archival deletes message array but preserves conversation record

### Integration Tests (Playwright)
- Create a CAPTCHA entry, wait for alarm, verify it's cleaned up
- Create an expired session, trigger alarm, verify session is removed
- Create and redeem an invite, trigger alarm, verify redeemed invite is pruned
- Verify active invites survive cleanup
- Verify storage metrics endpoint returns key counts per prefix
- Verify admin can read and update retention settings

### Longevity Tests
- Simulate 1000 conversations over time, verify storage grows only with active data
- Verify archived conversations show "N messages archived" in the UI instead of loading messages
- Verify cleanup alarm runs reliably over 24 hours (test with accelerated time)

## Acceptance Criteria

- [ ] Every DO has a guaranteed-running cleanup alarm (ensured on every `fetch()`)
- [ ] CAPTCHA entries are cleaned up after 5 minutes
- [ ] Expired sessions are cleaned up after their expiry time
- [ ] Expired provisioning rooms are cleaned up after 5 minutes
- [ ] Redeemed and expired invites are pruned from storage
- [ ] Rate-limit entries are cleaned up after 1 minute
- [ ] External-id mappings are cleaned up 24 hours after message reaches final status
- [ ] Zero-load volunteer counters with no conversations are cleaned up
- [ ] Closed conversations older than 90 days (configurable) have their messages archived
- [ ] Archive markers store metadata (count, date range) for UI display
- [ ] Storage usage metrics are available at `/api/metrics/storage` (admin-only)
- [ ] Admin can configure retention settings (archive threshold, session duration)
- [ ] All existing tests pass without modification
- [ ] `bun run test:changed` passes

## Risk Assessment

**Risk**: Conversation archival deletes encrypted messages permanently. If an admin needs to review a 6-month-old conversation, the messages are gone.

**Mitigation**: The archive marker preserves metadata (message count, date range) so admins know data existed. The 90-day default is generous — most crisis hotline data policies require shorter retention. Admins can increase to 365 days. For organizations that need permanent retention, set the threshold to a very high value. A future epic could add export-before-archive functionality.

**Risk**: Cleanup alarm running every 5 minutes in 7 DOs consumes billable DO requests on Cloudflare.

**Mitigation**: Each alarm run is a single DO invocation (~0.1ms CPU for small datasets). At 7 DOs x 12 alarms/hour = 84 alarm invocations/hour = ~2,000/day. CF charges $0.15 per million DO requests — this costs essentially nothing (~$0.0003/day). The storage savings from cleanup far outweigh the alarm cost.

**Risk**: Aggressive cleanup could delete data that is still being actively used by a concurrent request.

**Mitigation**: All TTLs have generous buffers (e.g., CAPTCHA TTL is 5 minutes, but a verification attempt would happen within 30 seconds). Sessions use expiry time, not creation time, so sliding expiry is respected. External-id mappings are only cleaned after the message has a final status AND is 24 hours old.
