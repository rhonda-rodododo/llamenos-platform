/**
 * Hub membership isolation step definitions (#1044, #1037).
 *
 * Every actor is created the way production creates them: Vera through a real
 * hub invite + signed redemption, Hugo through hub-scoped user creation, and
 * Gloria through the unscoped (global-role) path. Assertions go through the real
 * authenticated API as each actor.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, After, getState, setState } from './fixtures'
import { setLastResponse } from './shared-state'
import {
  apiGet,
  apiPost,
  apiDelete,
  createHubViaApi,
  deleteHubViaApi,
  createUserViaApi,
  generateTestKeypair,
  uniquePhone,
  ADMIN_SEED,
} from '../../api-helpers'
import { ed25519 } from '@noble/curves/ed25519.js'
import { hexToBytes, bytesToHex, utf8ToBytes } from '@shared/encoding'
import { LABEL_DEVICE_AUTH } from '@shared/crypto-labels'

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

interface Actor {
  pubkey: string
  seedHex: string
  phone: string
}

interface HubIsolationState {
  /** Feature label → hub id */
  hubs: Record<string, string>
  /** Hubs this file created and must delete */
  ownedHubs: string[]
  actors: Record<string, Actor>
  /** Invitee name → invite code */
  invites: Record<string, string>
  lastUsers?: Array<{ pubkey: string; phone?: string; hubRoles?: Array<{ hubId: string }> }>
  /** Who produced `lastUsers` — a member of the listed hub */
  lastLister?: string
  lastInvites?: Array<{ code: string; name: string }>
  /** Isolated rate-limit bucket for invite redemption */
  ip: string
}

const STATE_KEY = 'hub_membership_isolation'

function getS(world: Record<string, unknown>): HubIsolationState {
  return getState<HubIsolationState>(world, STATE_KEY)
}

function hub(world: Record<string, unknown>, label: string): string {
  const id = getS(world).hubs[label]
  expect(id, `hub "${label}" not set up`).toBeTruthy()
  return id
}

function actor(world: Record<string, unknown>, name: string): Actor {
  const a = getS(world).actors[name]
  expect(a, `actor "${name}" not set up`).toBeTruthy()
  return a
}

Before(async ({ world }) => {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  setState<HubIsolationState>(world, STATE_KEY, { hubs: {}, ownedHubs: [], actors: {}, invites: {}, ip })
})

After(async ({ request, world }) => {
  const s = getS(world)
  for (const hubId of s?.ownedHubs ?? []) {
    await deleteHubViaApi(request, hubId)
  }
})

/** Redeem an invite exactly as a client does: an Ed25519 token over the redeem request. */
async function redeemInvite(
  request: import('@playwright/test').APIRequestContext,
  code: string,
  seedHex: string,
  pubkey: string,
  ip: string,
): Promise<number> {
  const timestamp = Date.now()
  const message = utf8ToBytes(`${LABEL_DEVICE_AUTH}:${pubkey}:${timestamp}:POST:/api/invites/redeem`)
  const token = bytesToHex(ed25519.sign(message, hexToBytes(seedHex)))
  const res = await request.post(`${BASE_URL}/api/invites/redeem`, {
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    data: { code, pubkey, timestamp, token },
  })
  return res.status()
}

async function createHubInvite(
  request: import('@playwright/test').APIRequestContext,
  hubId: string,
  name: string,
  phone: string,
): Promise<string> {
  const res = await apiPost<{ invite: { code: string } }>(request, `/hubs/${hubId}/invites`, {
    name, phone, roleIds: ['role-volunteer'],
  }, ADMIN_SEED)
  expect(res.status, `creating an invite in hub ${hubId}`).toBe(201)
  return res.data.invite.code
}

const HUB_DATA_PATHS = ['/notes', '/calls/active', '/conversations', '/records']

// ── Given ───────────────────────────────────────────────────────────

Given('hub {string} and hub {string} exist', async ({ request, world, workerHub }, a: string, b: string) => {
  const s = getS(world)
  s.hubs[a] = workerHub
  const other = await createHubViaApi(request, `bdd-iso-${b}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  s.hubs[b] = other
  s.ownedHubs.push(other)
})

Given('{string} is a volunteer invited to and registered in hub {string}', async ({ request, world }, name: string, hubLabel: string) => {
  const s = getS(world)
  const phone = uniquePhone()
  const code = await createHubInvite(request, hub(world, hubLabel), name, phone)
  const kp = generateTestKeypair()
  expect(await redeemInvite(request, code, kp.seedHex, kp.pubkey, s.ip), 'redeeming the invite').toBe(200)
  s.actors[name] = { pubkey: kp.pubkey, seedHex: kp.seedHex, phone }
})

Given('{string} is an admin of hub {string} only', async ({ request, world }, name: string, hubLabel: string) => {
  const user = await createUserViaApi(request, { name, roleIds: ['role-hub-admin'], hubId: hub(world, hubLabel) })
  getS(world).actors[name] = { pubkey: user.pubkey, seedHex: user.seedHex, phone: user.phone }
})

Given('hub {string} has an outstanding invite for {string}', async ({ request, world }, hubLabel: string, name: string) => {
  getS(world).invites[name] = await createHubInvite(request, hub(world, hubLabel), name, uniquePhone())
})

Given('{string} holds the global hub-admin role and no hub membership', async ({ request, world }, name: string) => {
  const user = await createUserViaApi(request, { name, roleIds: ['role-hub-admin'] })
  getS(world).actors[name] = { pubkey: user.pubkey, seedHex: user.seedHex, phone: user.phone }
})

// ── When ────────────────────────────────────────────────────────────

When('{string} lists the users of hub {string}', async ({ request, world }, name: string, hubLabel: string) => {
  const res = await apiGet<{ users: HubIsolationState['lastUsers'] }>(request, `/hubs/${hub(world, hubLabel)}/users`, actor(world, name).seedHex)
  setLastResponse(world, res)
  getS(world).lastUsers = res.data?.users
  getS(world).lastLister = name
})

When('{string} fetches {string} through hub {string}', async ({ request, world }, viewer: string, target: string, hubLabel: string) => {
  // Control: the same route returns a member of the hub — the viewer — so the
  // 404 asserted for the target is isolation, not a route that 404s everyone.
  const self = await apiGet(request, `/hubs/${hub(world, hubLabel)}/users/${actor(world, viewer).pubkey}`, actor(world, viewer).seedHex)
  expect(self.status, `${viewer} fetching themself through hub ${hubLabel}`).toBe(200)
  setLastResponse(world, await apiGet(
    request,
    `/hubs/${hub(world, hubLabel)}/users/${actor(world, target).pubkey}`,
    actor(world, viewer).seedHex,
  ))
})

When('{string} lists the invites of hub {string}', async ({ request, world }, name: string, hubLabel: string) => {
  const res = await apiGet<{ invites: HubIsolationState['lastInvites'] }>(request, `/hubs/${hub(world, hubLabel)}/invites`, actor(world, name).seedHex)
  setLastResponse(world, res)
  getS(world).lastInvites = res.data?.invites
})

When('{string} revokes the hub {string} invite through hub {string}', async ({ request, world }, name: string, _owner: string, via: string) => {
  const code = Object.values(getS(world).invites)[0]
  expect(code, 'an outstanding invite').toBeTruthy()
  setLastResponse(world, await apiDelete(request, `/hubs/${hub(world, via)}/invites/${code}`, actor(world, name).seedHex))
})

When('the admin removes {string} from hub {string}', async ({ request, world }, name: string, hubLabel: string) => {
  const res = await apiDelete(request, `/hubs/${hub(world, hubLabel)}/members/${actor(world, name).pubkey}`, ADMIN_SEED)
  expect(res.status).toBe(200)
})

When('the admin creates a volunteer invite without a hub', async ({ request, world }) => {
  setLastResponse(world, await apiPost(request, '/invites', {
    name: 'Hubless Volunteer', phone: uniquePhone(), roleIds: ['role-volunteer'],
  }, ADMIN_SEED))
})

// ── Then ────────────────────────────────────────────────────────────

Then('the user list does not include {string}', async ({ world }, name: string) => {
  const users = getS(world).lastUsers
  expect(users, 'a user list').toBeDefined()
  // Control: the list is the hub's members — it contains whoever listed it —
  // so "does not include" cannot pass on an empty list.
  expect(users!.map(u => u.pubkey), 'the lister, a member of the listed hub').toContain(actor(world, getS(world).lastLister!).pubkey)
  const target = actor(world, name)
  expect(users!.map(u => u.pubkey)).not.toContain(target.pubkey)
  // Nor their phone number, anywhere in the response
  expect(JSON.stringify(users)).not.toContain(target.phone)
})

Then('no listed user carries a role assignment for hub {string}', async ({ world }, hubLabel: string) => {
  const foreignHub = hub(world, hubLabel)
  for (const user of getS(world).lastUsers ?? []) {
    expect((user.hubRoles ?? []).map(hr => hr.hubId), `hubRoles of ${user.pubkey}`).not.toContain(foreignHub)
  }
})

Then('the invite list does not include {string}', async ({ world }, name: string) => {
  const invites = getS(world).lastInvites
  expect(invites, 'an invite list').toBeDefined()
  expect(invites!.map(i => i.name)).not.toContain(name)
  expect(invites!.map(i => i.code)).not.toContain(getS(world).invites[name])
})

Then('{string} holds no global role and a role assignment for hub {string} only', async ({ request, world }, name: string, hubLabel: string) => {
  // Read the account as the super-admin, through the unscoped (server-wide) route
  const res = await apiGet<{ roles: string[]; hubRoles: Array<{ hubId: string; roleIds: string[] }> }>(
    request, `/users/${actor(world, name).pubkey}`, ADMIN_SEED,
  )
  expect(res.status).toBe(200)
  expect(res.data.roles).toEqual([])
  expect(res.data.hubRoles).toEqual([{ hubId: hub(world, hubLabel), roleIds: ['role-volunteer'] }])
})

Then('{string} can list the notes of hub {string}', async ({ request, world }, name: string, hubLabel: string) => {
  const res = await apiGet(request, `/hubs/${hub(world, hubLabel)}/notes`, actor(world, name).seedHex)
  expect(res.status, `${name} listing hub ${hubLabel} notes`).toBe(200)
})

Then('{string} is refused the notes, active calls, conversations and records of hub {string}', async ({ request, world }, name: string, hubLabel: string) => {
  const hubId = hub(world, hubLabel)
  for (const path of HUB_DATA_PATHS) {
    const res = await apiGet(request, `/hubs/${hubId}${path}`, actor(world, name).seedHex)
    expect(res.status, `${name} GET /hubs/${hubLabel}${path}`).toBe(403)
  }
})

Then('{string} is refused the users of hub {string}', async ({ request, world }, name: string, hubLabel: string) => {
  const res = await apiGet(request, `/hubs/${hub(world, hubLabel)}/users`, actor(world, name).seedHex)
  expect(res.status).toBe(403)
})

Then('{string} cannot add herself to hub {string}', async ({ request, world }, name: string, hubLabel: string) => {
  const self = actor(world, name)
  const res = await apiPost(request, `/hubs/${hub(world, hubLabel)}/members`, {
    pubkey: self.pubkey, roleIds: ['role-hub-admin'],
  }, self.seedHex)
  expect(res.status).toBe(403)
  const account = await apiGet<{ hubRoles: unknown[] }>(request, `/users/${self.pubkey}`, ADMIN_SEED)
  expect(account.data.hubRoles).toEqual([])
})
