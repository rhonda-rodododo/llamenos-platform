/**
 * WebAuthn enforcement policy step definitions (#672, #676).
 *
 * Covers the self-lockout guard on PATCH /settings/webauthn: an admin with no
 * registered passkey must not be able to enable `requireForAdmins`. Also
 * covers the success branch (admin WITH a passkey → 200 + persisted) — that
 * scenario mutates the server-wide `requireForAdmins` setting, so it only
 * runs in the serial `backend-bdd-global-setting` Playwright project (see
 * playwright.config.ts and #676). The `After` hook below always resets the
 * setting through the API so the mutation never leaks into another scenario,
 * whether the scenario passed or failed.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, After, getState, setState } from './fixtures'
import { setLastResponse, getSharedState } from './shared-state'
import { apiGet, apiPatch, devPost, createUserViaApi } from '../../api-helpers'
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

Given('an admin user with a registered passkey', async ({ request, world }) => {
  const admin = await createUserViaApi(request, { roleIds: ['role-super-admin'] })
  // Real WebAuthn registration needs a hardware authenticator's private key, which
  // BDD can't simulate — insert the credential row directly via the dev-only helper.
  const seed = await devPost(request, '/test-add-webauthn-credential', { pubkey: admin.pubkey })
  expect(seed.status).toBe(200)
  const creds = await apiGet<{ credentials: unknown[] }>(request, '/webauthn/credentials', admin.deviceKey)
  expect(creds.status).toBe(200)
  expect(creds.data.credentials).toHaveLength(1)
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

Then('the passkey requirement for admins is enabled', async ({ request, world }) => {
  const admin = requireAdmin(world)
  const res = await apiGet<WebAuthnSettings>(request, '/settings/webauthn', admin.deviceKey)
  expect(res.status).toBe(200)
  expect(res.data.requireForAdmins).toBe(true)
})

Then('that admin can still manage WebAuthn settings', async ({ request, world }) => {
  const admin = requireAdmin(world)
  // A policy-neutral write proves the admin was not locked out of admin-only mutations.
  const res = await apiPatch<WebAuthnSettings>(request, '/settings/webauthn', { requireForAdmins: false }, admin.deviceKey)
  expect(res.status).toBe(200)
  expect(res.data.requireForAdmins).toBe(false)
})

// ── Teardown ──────────────────────────────────────────────────────────
// `requireForAdmins` is a single server-wide row, not scenario-scoped state.
// Reset it through the real API after every scenario in this file — pass or
// fail — so a scenario that turns it on (or a future one that does) can never
// leak into whichever scenario runs next, in this project or another (#676).
After(async ({ request, world }) => {
  const { admin } = getS(world)
  if (!admin) return
  await apiPatch(request, '/settings/webauthn', { requireForAdmins: false }, admin.deviceKey)
})
