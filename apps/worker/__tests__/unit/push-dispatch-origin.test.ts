/**
 * #960 — end-to-end (dispatcher → real NtfyClient → fetch) behaviour for
 * UnifiedPush endpoints that are not on the operator's relay: they are never
 * fetched, and the stored token is dropped on that dispatch. No migration is
 * needed for rows registered before registration-time validation existed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Env, WakePayload, FullPushPayload } from '@worker/types/infra'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

vi.mock('@worker/lib/push-encryption', () => ({
  encryptWakePayload: () => 'encrypted-wake',
  encryptFullPayload: () => 'encrypted-full',
}))

import { createPushDispatcherFromService } from '@worker/lib/push-dispatch'

const TRUSTED = 'https://push.hotline.example.org'
const wake: WakePayload = { hubId: 'h1', type: 'message' }
const full = { hubId: 'h1', type: 'message' } as unknown as FullPushPayload

function setup(tokens: string[]) {
  const identity = {
    getDevices: vi.fn().mockResolvedValue({
      devices: tokens.map(pushToken => ({ platform: 'android', pushToken, wakeKeyPublic: 'wk' })),
    }),
    cleanupDevices: vi.fn().mockResolvedValue({ removed: 0 }),
  }
  const dispatcher = createPushDispatcherFromService(
    { ENVIRONMENT: 'production', NTFY_URL: 'http://ntfy:80', NTFY_PUBLIC_URL: TRUSTED } as Env,
    identity as never,
    {} as never,
  )
  return { identity, dispatcher }
}

describe('push dispatch — off-origin UnifiedPush endpoints (#960)', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
  })

  it('never contacts ntfy.sh and drops the token on next dispatch', async () => {
    const { identity, dispatcher } = setup(['https://ntfy.sh/up-legacy'])

    await dispatcher.sendToVolunteer('pk-1', wake, full)

    expect(mockFetch).not.toHaveBeenCalled()
    expect(identity.cleanupDevices).toHaveBeenCalledWith('pk-1', ['https://ntfy.sh/up-legacy'])
  })

  it('delivers to on-origin devices and only drops the off-origin one', async () => {
    const { identity, dispatcher } = setup([`${TRUSTED}/up-good`, `${TRUSTED}.evil.example/up-bad`])

    await dispatcher.sendToVolunteer('pk-1', wake, full)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe(`${TRUSTED}/up-good`)
    expect(identity.cleanupDevices).toHaveBeenCalledWith('pk-1', [`${TRUSTED}.evil.example/up-bad`])
  })
})
