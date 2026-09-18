/**
 * WebAuthn enforcement policy step definitions (#672).
 *
 * Covers the self-lockout guard on PATCH /settings/webauthn: an admin with no
 * registered passkey must not be able to enable `requireForAdmins`.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { setLastResponse, getSharedState } from './shared-state'
import { apiGet, apiPatch, createUserViaApi } from '../../api-helpers'
import type { WebAuthnSettings } from '@protocol/schemas'

interface WebAuthnPolicyState {
  admin?: { deviceKey: string; pubkey: string }
}

const STATE_KEY = 'webauthn_policy'

function getS(world: Record<string, unknown>): WebAuthnPolicyState {
  return getState<WebAuthnPolicyState>(world, STATE_KEY)
}

function requireAdmin(world: Record<string, unknown>): { deviceKey: string; pubkey: string } {
  const { admin } = getS(world)
  if (!admin) throw new Error('No admin in scenario state — run "an admin user with no registered passkey" first')
  return admin
}

Before(async ({ world }) => {
  setState<WebAuthnPolicyState>(world, STATE_KEY, {})
})

Given('an admin user with no registered passkey', async ({ request, world }) => {
  const admin = await createUserViaApi(request, { roleIds: ['role-super-admin'] })
  const creds = await apiGet<{ credentials: unknown[] }>(request, '/webauthn/credentials', admin.deviceKey)
  expect(creds.status).toBe(200)
  expect(creds.data.credentials).toHaveLength(0)
  getS(world).admin = { deviceKey: admin.deviceKey, pubkey: admin.pubkey }
})

When('that admin enables the passkey requirement for admins', async ({ request, world }) => {
  const admin = requireAdmin(world)
  setLastResponse(world, await apiPatch(request, '/settings/webauthn', { requireForAdmins: true }, admin.deviceKey))
})

Then('the response error code is {string}', async ({ world }, code: string) => {
  const resp = getSharedState(world).lastResponse
  expect((resp?.data as { code?: string } | null | undefined)?.code).toBe(code)
})

Then('the passkey requirement for admins is still disabled', async ({ request, world }) => {
  const admin = requireAdmin(world)
  const res = await apiGet<WebAuthnSettings>(request, '/settings/webauthn', admin.deviceKey)
  expect(res.status).toBe(200)
  expect(res.data.requireForAdmins).toBe(false)
})

Then('that admin can still manage WebAuthn settings', async ({ request, world }) => {
  const admin = requireAdmin(world)
  // A policy-neutral write proves the admin was not locked out of admin-only mutations.
  const res = await apiPatch<WebAuthnSettings>(request, '/settings/webauthn', { requireForAdmins: false }, admin.deviceKey)
  expect(res.status).toBe(200)
  expect(res.data.requireForAdmins).toBe(false)
})
