/**
 * Regression: the production ringing path must publish `call:ring` to the hub
 * the call arrived on. It used to omit the hubId, so publishEvent fell back to a
 * 'global' pseudo-hub that no hub-subscribed client listens to (and every user
 * could subscribe to).
 *
 * Unlike ringing-service.test.ts this drives the REAL startParallelRinging into
 * the REAL publishEvent and a REAL ConnectionManager — only voip-push is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startParallelRinging } from '../../services/ringing'
import { initConnectionManager, type ConnectionManager, type ConnectionState } from '../../lib/ws-manager'
import { KIND_CALL_RING } from '@shared/event-kinds'
import type { Env } from '../../types'
import type { Services } from '../../services'

vi.mock('../../lib/voip-push', () => ({
  dispatchVoipPushFromService: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../routes/metrics', () => ({ incCounter: vi.fn() }))

const env = { HMAC_SECRET: 'a'.repeat(64) } as Env

function makeServices(): Services {
  return {
    shifts: { getCurrentVolunteers: vi.fn().mockResolvedValue(['pk-vol']) },
    settings: { getFallbackGroup: vi.fn().mockResolvedValue({ userPubkeys: [] }) },
    identity: {
      getUsers: vi.fn().mockResolvedValue({
        users: [{ pubkey: 'pk-vol', active: true, onBreak: false, callPreference: 'browser', phone: null }],
      }),
    },
    calls: { addCall: vi.fn().mockResolvedValue({ callId: 'CA-probe' }) },
  } as unknown as Services
}

function connect(mgr: ConnectionManager, pubkey: string, memberHubs: string[], subscribeTo: string[]) {
  const sent: string[] = []
  const state: ConnectionState = {
    pubkey,
    ws: { send: (m: string) => sent.push(m) } as unknown as WebSocket,
    hubs: new Set(memberHubs),
    subscribedHubs: new Set(),
    lastReplayAt: 0,
  }
  mgr.register(state)
  for (const hub of subscribeTo) mgr.subscribe(state, hub, [KIND_CALL_RING])
  return { state, sent }
}

const received = (sent: string[]) =>
  sent.map((s) => JSON.parse(s) as { hubId: string; kind: number }).map((e) => `${e.hubId}:${e.kind}`)

describe('startParallelRinging → relay hub routing', () => {
  let mgr: ConnectionManager

  beforeEach(() => {
    vi.clearAllMocks()
    mgr = initConnectionManager(new Uint8Array(32).fill(7))
  })

  it('delivers call:ring to subscribers of the hub the call arrived on — and to no other hub', async () => {
    const vol = connect(mgr, 'pk-vol', ['hub-A', 'hub-B'], ['hub-A', 'hub-B'])
    // A member of an unrelated hub must not see hub-B's ring.
    const outsider = connect(mgr, 'pk-out', ['hub-C'], ['hub-C'])

    await startParallelRinging('CA-probe', '+15551234567', 'http://x', env, makeServices(), 'hub-B')

    expect(received(vol.sent)).toEqual([`hub-B:${KIND_CALL_RING}`])
    expect(outsider.sent).toEqual([])
  })

  it('never publishes a ring to a catch-all "global" pseudo-hub', async () => {
    const snoop = connect(mgr, 'pk-snoop', ['hub-A', 'global'], ['global'])

    await startParallelRinging('CA-probe', '+15551234567', 'http://x', env, makeServices(), 'hub-B')
    // A call with no owning hub has no audience: dropped, not broadcast to 'global'.
    await startParallelRinging('CA-probe-2', '+15551234567', 'http://x', env, makeServices(), '')

    expect(snoop.sent).toEqual([])
  })
})
