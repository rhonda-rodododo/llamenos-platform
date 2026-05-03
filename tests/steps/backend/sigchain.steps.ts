/**
 * Sigchain integrity step definitions.
 * Tests hash-chain continuity, seqNo ordering, and access controls.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { setLastResponse } from './shared-state'
import {
  apiGet,
  apiPost,
  createUserViaApi,
  ADMIN_NSEC,
} from '../../api-helpers'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'

// ── State ──────────────────────��────────────────────────────────────

interface SigchainTestState {
  user?: { nsec: string; pubkey: string }
  secondUser?: { nsec: string; pubkey: string }
  genesisHash?: string
  lastHash?: string
  lastSeqNo?: number
}

const STATE_KEY = 'sigchain_test'

function getS(world: Record<string, unknown>): SigchainTestState {
  return getState<SigchainTestState>(world, STATE_KEY)
}

Before(async ({ world }) => {
  setState<SigchainTestState>(world, STATE_KEY, {})
})

// ── Helpers ─────────────���────────────────────��──────────────────────

function computeLinkHash(prevHash: string, linkType: string, seqNo: number, payload: unknown): string {
  const canonical = `${prevHash}|${linkType}|${seqNo}|${JSON.stringify(payload)}`
  return bytesToHex(sha256(utf8ToBytes(canonical)))
}

function fakeSignature(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(64)))
}

async function appendLink(
  request: import('@playwright/test').APIRequestContext,
  nsec: string,
  targetPubkey: string,
  opts: { seqNo: number; linkType: string; prevHash: string; payload?: Record<string, unknown>; signature?: string; hash?: string },
) {
  const payload = opts.payload ?? { devicePubkey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))) }
  const hash = opts.hash ?? computeLinkHash(opts.prevHash, opts.linkType, opts.seqNo, payload)
  const signature = opts.signature ?? fakeSignature()
  return apiPost(request, `/users/${targetPubkey}/sigchain`, {
    seqNo: opts.seqNo, linkType: opts.linkType, payload, signature, prevHash: opts.prevHash, hash,
  }, nsec)
}

// ── Given ────────────────────���──────────────────────────────────────

Given('a registered user with a known keypair', async ({ request, world }) => {
  const user = await createUserViaApi(request, { name: `Sigchain User ${Date.now()}` })
  getS(world).user = { nsec: user.nsec, pubkey: user.pubkey }
})

Given('the user has a genesis sigchain link', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const payload = { devicePubkey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))) }
  const hash = computeLinkHash('', 'genesis', 0, payload)
  const res = await appendLink(request, s.user!.nsec, s.user!.pubkey, { seqNo: 0, linkType: 'genesis', prevHash: '', payload, hash })
  expect(res.status).toBe(201)
  s.genesisHash = hash
  s.lastHash = hash
  s.lastSeqNo = 0
})

Given('a second registered user', async ({ request, world }) => {
  const user = await createUserViaApi(request, { name: `Second User ${Date.now()}` })
  getS(world).secondUser = { nsec: user.nsec, pubkey: user.pubkey }
})

// ── When ──────────────��───────────────────────────────────���─────────

When('the user appends a genesis sigchain link', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const payload = { devicePubkey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))) }
  const hash = computeLinkHash('', 'genesis', 0, payload)
  const res = await appendLink(request, s.user!.nsec, s.user!.pubkey, { seqNo: 0, linkType: 'genesis', prevHash: '', payload, hash })
  setLastResponse(world, res)
  if (res.status === 201) { s.genesisHash = hash; s.lastHash = hash; s.lastSeqNo = 0 }
})

When('the user appends a {string} link with valid prevHash', async ({ request, world }, linkType: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.lastHash).toBeDefined()
  const newSeqNo = (s.lastSeqNo ?? 0) + 1
  const payload = { devicePubkey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))) }
  const hash = computeLinkHash(s.lastHash!, linkType, newSeqNo, payload)
  const res = await appendLink(request, s.user!.nsec, s.user!.pubkey, { seqNo: newSeqNo, linkType, prevHash: s.lastHash!, payload, hash })
  setLastResponse(world, res)
  if (res.status === 201) { s.lastHash = hash; s.lastSeqNo = newSeqNo }
})

When('the user appends a link with an invalid Ed25519 signature', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.lastHash).toBeDefined()
  const newSeqNo = (s.lastSeqNo ?? 0) + 1
  const payload = { devicePubkey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))) }
  const hash = computeLinkHash(s.lastHash!, 'device_add', newSeqNo, payload)
  const res = await apiPost(request, `/users/${s.user!.pubkey}/sigchain`, {
    seqNo: newSeqNo, linkType: 'device_add', payload,
    signature: 'badbad', // doesn't match 128-char hex regex
    prevHash: s.lastHash!, hash,
  }, s.user!.nsec)
  setLastResponse(world, res)
})

When('the user appends a link with wrong prevHash', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const newSeqNo = (s.lastSeqNo ?? 0) + 1
  const wrongPrevHash = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
  const payload = { devicePubkey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))) }
  const hash = computeLinkHash(wrongPrevHash, 'device_add', newSeqNo, payload)
  const res = await appendLink(request, s.user!.nsec, s.user!.pubkey, { seqNo: newSeqNo, linkType: 'device_add', prevHash: wrongPrevHash, payload, hash })
  setLastResponse(world, res)
})

When('the user appends a link with duplicate seqNo {int}', async ({ request, world }, seqNo: number) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const payload = { devicePubkey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))) }
  const hash = computeLinkHash('', 'genesis', seqNo, payload)
  const res = await appendLink(request, s.user!.nsec, s.user!.pubkey, { seqNo, linkType: 'genesis', prevHash: '', payload, hash })
  setLastResponse(world, res)
})

When('the second user tries to append to the first user\'s sigchain', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.secondUser).toBeDefined()
  const payload = { devicePubkey: bytesToHex(crypto.getRandomValues(new Uint8Array(32))) }
  const hash = computeLinkHash('', 'genesis', 0, payload)
  const res = await appendLink(request, s.secondUser!.nsec, s.user!.pubkey, { seqNo: 0, linkType: 'genesis', prevHash: '', payload, hash })
  setLastResponse(world, res)
})

When('the admin reads the user\'s sigchain', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  setLastResponse(world, await apiGet(request, `/users/${s.user!.pubkey}/sigchain`, ADMIN_NSEC))
})

When('the second user tries to read the first user\'s sigchain', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.secondUser).toBeDefined()
  setLastResponse(world, await apiGet(request, `/users/${s.user!.pubkey}/sigchain`, s.secondUser!.nsec))
})

// ── Then ─────────────��───────────────────────���──────────────────────

Then('the sigchain has {int} link(s)', async ({ request, world }, count: number) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const res = await apiGet<{ links: unknown[] }>(request, `/users/${s.user!.pubkey}/sigchain`, s.user!.nsec)
  expect(res.status).toBe(200)
  expect(res.data.links).toHaveLength(count)
})

Then('the first link has linkType {string}', async ({ request, world }, linkType: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const res = await apiGet<{ links: Array<{ linkType: string }> }>(request, `/users/${s.user!.pubkey}/sigchain`, s.user!.nsec)
  expect(res.data.links[0].linkType).toBe(linkType)
})
