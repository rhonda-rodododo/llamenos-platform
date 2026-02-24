/**
 * API-driven test setup helpers.
 *
 * These helpers create test data directly via API calls, bypassing the UI.
 * This is significantly faster than using UI automation for setup and reduces
 * test brittleness by not depending on UI selectors for setup steps.
 *
 * Use these helpers in beforeAll/beforeEach hooks to set up test fixtures.
 */

import { type APIRequestContext } from '@playwright/test'
import { generateKeyPair as nostrGenerate } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import { bytesToHex } from '@noble/hashes/utils.js'

interface CreateVolunteerResult {
  pubkey: string
  nsec: string
  name: string
  phone: string
}

interface CreateBanResult {
  phone: string
  reason: string
}

interface CreateShiftResult {
  id: string
  name: string
}

/**
 * Generate a unique phone number for testing.
 */
export function uniquePhone(): string {
  const suffix = Date.now().toString().slice(-7)
  return `+1555${suffix}`
}

/**
 * Generate a unique name for testing.
 */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}`
}

/**
 * Create a volunteer directly via API.
 * Much faster than going through the UI.
 */
export async function createVolunteerViaApi(
  request: APIRequestContext,
  options?: { name?: string; phone?: string; roleIds?: string[] },
): Promise<CreateVolunteerResult> {
  const name = options?.name || uniqueName('TestVol')
  const phone = options?.phone || uniquePhone()
  const roleIds = options?.roleIds || ['role-volunteer']

  // Generate a keypair
  const sk = nostrGenerate()
  const pubkey = bytesToHex(sk.slice(0, 32)) // This is wrong - we need to use the public key
  const nsec = nip19.nsecEncode(sk)

  // Actually, we need to compute the public key properly
  const { getPublicKey } = await import('nostr-tools')
  const actualPubkey = getPublicKey(sk)

  const res = await request.post('/api/volunteers', {
    data: { name, phone, roleIds, pubkey: actualPubkey },
  })

  if (!res.ok()) {
    throw new Error(`Failed to create volunteer: ${res.status()} ${await res.text()}`)
  }

  return { pubkey: actualPubkey, nsec, name, phone }
}

/**
 * Delete a volunteer via API.
 */
export async function deleteVolunteerViaApi(
  request: APIRequestContext,
  pubkey: string,
): Promise<void> {
  const res = await request.delete(`/api/volunteers/${pubkey}`)
  if (!res.ok()) {
    throw new Error(`Failed to delete volunteer: ${res.status()} ${await res.text()}`)
  }
}

/**
 * Create a ban entry directly via API.
 */
export async function createBanViaApi(
  request: APIRequestContext,
  options?: { phone?: string; reason?: string },
): Promise<CreateBanResult> {
  const phone = options?.phone || uniquePhone()
  const reason = options?.reason || 'E2E test ban'

  const res = await request.post('/api/bans', {
    data: { phone, reason },
  })

  if (!res.ok()) {
    throw new Error(`Failed to create ban: ${res.status()} ${await res.text()}`)
  }

  return { phone, reason }
}

/**
 * Remove a ban via API.
 */
export async function removeBanViaApi(
  request: APIRequestContext,
  phone: string,
): Promise<void> {
  const res = await request.delete(`/api/bans/${encodeURIComponent(phone)}`)
  if (!res.ok()) {
    throw new Error(`Failed to remove ban: ${res.status()} ${await res.text()}`)
  }
}

/**
 * Create a shift directly via API.
 */
export async function createShiftViaApi(
  request: APIRequestContext,
  options?: {
    name?: string
    startTime?: string
    endTime?: string
    days?: number[]
    volunteerPubkeys?: string[]
  },
): Promise<CreateShiftResult> {
  const name = options?.name || uniqueName('TestShift')
  const startTime = options?.startTime || '09:00'
  const endTime = options?.endTime || '17:00'
  const days = options?.days || [1, 2, 3, 4, 5]
  const volunteerPubkeys = options?.volunteerPubkeys || []

  const res = await request.post('/api/shifts', {
    data: { name, startTime, endTime, days, volunteerPubkeys },
  })

  if (!res.ok()) {
    throw new Error(`Failed to create shift: ${res.status()} ${await res.text()}`)
  }

  const data = await res.json()
  return { id: data.shift.id, name }
}

/**
 * Delete a shift via API.
 */
export async function deleteShiftViaApi(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  const res = await request.delete(`/api/shifts/${id}`)
  if (!res.ok()) {
    throw new Error(`Failed to delete shift: ${res.status()} ${await res.text()}`)
  }
}

/**
 * Get all volunteers via API.
 */
export async function listVolunteersViaApi(
  request: APIRequestContext,
): Promise<Array<{ pubkey: string; name: string; phone: string }>> {
  const res = await request.get('/api/volunteers')
  if (!res.ok()) {
    throw new Error(`Failed to list volunteers: ${res.status()} ${await res.text()}`)
  }
  const data = await res.json()
  return data.volunteers
}

/**
 * Get all bans via API.
 */
export async function listBansViaApi(
  request: APIRequestContext,
): Promise<Array<{ phone: string; reason: string }>> {
  const res = await request.get('/api/bans')
  if (!res.ok()) {
    throw new Error(`Failed to list bans: ${res.status()} ${await res.text()}`)
  }
  const data = await res.json()
  return data.bans
}

/**
 * Get all shifts via API.
 */
export async function listShiftsViaApi(
  request: APIRequestContext,
): Promise<Array<{ id: string; name: string }>> {
  const res = await request.get('/api/shifts')
  if (!res.ok()) {
    throw new Error(`Failed to list shifts: ${res.status()} ${await res.text()}`)
  }
  const data = await res.json()
  return data.shifts
}

/**
 * Clean up all test data created by a specific test.
 * Useful in afterEach/afterAll hooks.
 */
export async function cleanupTestData(
  request: APIRequestContext,
  data: {
    volunteerPubkeys?: string[]
    banPhones?: string[]
    shiftIds?: string[]
  },
): Promise<void> {
  const errors: Error[] = []

  // Delete volunteers
  for (const pubkey of data.volunteerPubkeys || []) {
    try {
      await deleteVolunteerViaApi(request, pubkey)
    } catch (e) {
      errors.push(e as Error)
    }
  }

  // Delete bans
  for (const phone of data.banPhones || []) {
    try {
      await removeBanViaApi(request, phone)
    } catch (e) {
      errors.push(e as Error)
    }
  }

  // Delete shifts
  for (const id of data.shiftIds || []) {
    try {
      await deleteShiftViaApi(request, id)
    } catch (e) {
      errors.push(e as Error)
    }
  }

  // Log any cleanup errors but don't fail the test
  if (errors.length > 0) {
    console.warn('Cleanup errors:', errors.map(e => e.message).join(', '))
  }
}
