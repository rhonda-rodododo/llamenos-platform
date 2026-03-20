/**
 * Hub key lifecycle step definitions (Epic 365).
 *
 * Tests hub key distribution, revocation on member removal,
 * and key rotation when members depart.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import {
  apiGet,
  apiPut,
  apiPost,
  createVolunteerViaApi,
} from '../../api-helpers'

// ── Local State ────────────────────────────────────────────────────

interface HubMember {
  name: string
  nsec: string
  pubkey: string
}

interface EnvelopeEntry {
  pubkey: string
  wrappedKey: string
  ephemeralPubkey: string
}

interface HubKeyState {
  hubId?: string
  members: Map<string, HubMember>
  /** Original wrappedKey values keyed by member name */
  originalEnvelopes: Map<string, string>
  /** Current wrappedKey values keyed by member name */
  currentEnvelopes: Map<string, string>
  /** Fetch results per member */
  fetchResults: Map<string, { status: number; envelope?: string }>
  /** Number of entries in the latest PUT */
  lastEnvelopeCount?: number
}

const HUB_KEY_LIFECYCLE_KEY = 'hub_key_lifecycle'

function getHubKeyState(world: Record<string, unknown>): HubKeyState {
  return getState<HubKeyState>(world, HUB_KEY_LIFECYCLE_KEY)
}


Before({ tags: '@crypto' }, async ({ world }) => {
  const hkState = {
    members: new Map(),
    originalEnvelopes: new Map(),
    currentEnvelopes: new Map(),
    fetchResults: new Map(),
  }
  setState(world, HUB_KEY_LIFECYCLE_KEY, hkState)
})

// ── Helpers ────────────────────────────────────────────────────────

function generateMockEnvelopeEntry(pubkey: string, seed: string): EnvelopeEntry {
  // wrappedKey encodes pubkey+seed so each member gets a DISTINCT value
  const wrappedKey = Buffer.from(`wrapped:${pubkey}:${seed}`).toString('base64')
  // ephemeralPubkey must match pubkeySchema: ^[0-9a-f]{64}$ — real pubkeys satisfy this
  return { pubkey, wrappedKey, ephemeralPubkey: pubkey }
}

async function createHub(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const slug = `bdd-hub-key-${Date.now()}`
  const res = await apiPost<{ hub: { id: string } }>(
    request,
    '/hubs',
    { name: `Hub Key Test ${Date.now()}`, slug },
  )
  expect(res.status).toBe(200)
  return res.data.hub.id
}

// ── Given: Hub with members ───────────────────────────────────────

Given(
  'a hub with {int} members: {string}, {string}, and {string}',
  async ({ request, world }, count: number, name1: string, name2: string, name3: string) => {
    // Create the hub
    getHubKeyState(world).hubId = await createHub(request)

    // Create 3 volunteer members
    for (const name of [name1, name2, name3]) {
      const vol = await createVolunteerViaApi(request, {
        name: `${name} ${Date.now()}`,
      })
      getHubKeyState(world).members.set(name, {
        name,
        nsec: vol.nsec,
        pubkey: vol.pubkey,
      })
    }
  },
)

// ── When: Set hub key envelopes ───────────────────────────────────

When(
  'the admin sets hub key envelopes for all {int} members',
  async ({ request, world }, count: number) => {
    expect(getHubKeyState(world).hubId).toBeTruthy()

    const envelopes: EnvelopeEntry[] = []
    for (const [name, member] of getHubKeyState(world).members) {
      const entry = generateMockEnvelopeEntry(member.pubkey, 'initial')
      envelopes.push(entry)
      getHubKeyState(world).originalEnvelopes.set(name, entry.wrappedKey)
      getHubKeyState(world).currentEnvelopes.set(name, entry.wrappedKey)
    }

    const res = await apiPut(
      request,
      `/hubs/${getHubKeyState(world).hubId}/key`,
      { envelopes },
    )
    expect(res.status).toBe(200)
  },
)

Given('hub key envelopes are set for all {int} members', async ({ request, world }, count: number) => {
  expect(getHubKeyState(world).hubId).toBeTruthy()

  const envelopes: EnvelopeEntry[] = []
  for (const [name, member] of getHubKeyState(world).members) {
    const entry = generateMockEnvelopeEntry(member.pubkey, 'initial')
    envelopes.push(entry)
    getHubKeyState(world).originalEnvelopes.set(name, entry.wrappedKey)
    getHubKeyState(world).currentEnvelopes.set(name, entry.wrappedKey)
  }

  const res = await apiPut(
    request,
    `/hubs/${getHubKeyState(world).hubId}/key`,
    { envelopes },
  )
  expect(res.status).toBe(200)
})

// ── Then: Fetch individual envelopes ──────────────────────────────

Then(
  '{string} should be able to fetch their hub key envelope',
  async ({ request, world }, name: string) => {
    expect(getHubKeyState(world).hubId).toBeTruthy()
    const member = getHubKeyState(world).members.get(name)
    expect(member).toBeTruthy()

    const res = await apiGet<{ envelope: { pubkey: string; wrappedKey: string; ephemeralPubkey: string } }>(
      request,
      `/hubs/${getHubKeyState(world).hubId}/key`,
      member!.nsec,
    )
    expect(res.status).toBe(200)
    expect(res.data.envelope).toBeTruthy()
    expect(res.data.envelope.wrappedKey).toBeTruthy()
    getHubKeyState(world).fetchResults.set(name, { status: res.status, envelope: res.data.envelope.wrappedKey })
  },
)

Then('each envelope should be unique per member', async () => {
  const envelopes = new Set<string>()
  for (const [, result] of getHubKeyState(world).fetchResults) {
    expect(result.envelope).toBeTruthy()
    envelopes.add(result.envelope!)
  }
  // All envelopes should be unique
  expect(envelopes.size).toBe(getHubKeyState(world).fetchResults.size)
})

// ── When: Remove member ───────────────────────────────────────────

When('{string} is removed from the hub', async ({ world }, name: string) => {
  // Mark as removed in local state — omit from subsequent key PUTs.
  // Hub membership is modelled by envelope presence: a replace-all PUT that
  // excludes this member's entry causes setHubKeyEnvelopes to delete their row,
  // so their subsequent GET returns 404 ("No key envelope for this user").
  // Do NOT call DELETE /users/:pubkey — that permanently deletes the account,
  // causing subsequent Schnorr auth to return 401 rather than 404 on GET /hubs/:id/key.
  getHubKeyState(world).currentEnvelopes.delete(name)
})

When(
  'the admin updates hub key envelopes for {string} and {string} only',
  async ({ request, world }, name1: string, name2: string) => {
    expect(getHubKeyState(world).hubId).toBeTruthy()

    const envelopes: EnvelopeEntry[] = []
    for (const name of [name1, name2]) {
      const member = getHubKeyState(world).members.get(name)
      expect(member).toBeTruthy()
      const entry = generateMockEnvelopeEntry(member!.pubkey, 'rotated')
      envelopes.push(entry)
      getHubKeyState(world).currentEnvelopes.set(name, entry.wrappedKey)
    }

    const res = await apiPut(
      request,
      `/hubs/${getHubKeyState(world).hubId}/key`,
      { envelopes },
    )
    expect(res.status).toBe(200)
    getHubKeyState(world).lastEnvelopeCount = envelopes.length
  },
)

// ── Then: Removed member gets 404 ─────────────────────────────────

Then(
  '{string} should receive {int} when fetching their hub key envelope',
  async ({ request, world }, name: string, expectedStatus: number) => {
    expect(getHubKeyState(world).hubId).toBeTruthy()
    const member = getHubKeyState(world).members.get(name)
    expect(member).toBeTruthy()

    const res = await apiGet(
      request,
      `/hubs/${getHubKeyState(world).hubId}/key`,
      member!.nsec,
    )
    expect(res.status).toBe(expectedStatus)
    getHubKeyState(world).fetchResults.set(name, { status: res.status })
  },
)

// ── Key Rotation ──────────────────────────────────────────────────

When(
  'a new hub key is generated and wrapped for remaining members only',
  async ({ request, world }) => {
    expect(getHubKeyState(world).hubId).toBeTruthy()

    const envelopes: EnvelopeEntry[] = []
    for (const [name, member] of getHubKeyState(world).members) {
      // Only wrap for members still tracked in currentEnvelopes (non-removed)
      if (getHubKeyState(world).currentEnvelopes.has(name)) {
        const entry = generateMockEnvelopeEntry(member.pubkey, 'new-key')
        envelopes.push(entry)
        getHubKeyState(world).currentEnvelopes.set(name, entry.wrappedKey)
      }
    }

    const res = await apiPut(
      request,
      `/hubs/${getHubKeyState(world).hubId}/key`,
      { envelopes },
    )
    expect(res.status).toBe(200)
    getHubKeyState(world).lastEnvelopeCount = envelopes.length
  },
)

Then(
  "{string}'s new envelope should differ from the original",
  async ({ world }, name: string) => {
    const original = getHubKeyState(world).originalEnvelopes.get(name)
    const current = getHubKeyState(world).currentEnvelopes.get(name)
    expect(original).toBeTruthy()
    expect(current).toBeTruthy()
    expect(current).not.toBe(original)
  },
)

Then(
  'the new envelopes should contain exactly {int} entries',
  async ({ world }, count: number) => {
    expect(getHubKeyState(world).lastEnvelopeCount).toBe(count)
  },
)
