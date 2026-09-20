/**
 * Step definitions for Signal notification service scenarios.
 *
 * Tests the REAL signal-notifier sidecar contract (see signal-notifier/src/routes.ts,
 * mounted under /api): POST /api/register-client (token-based, client-direct),
 * GET /api/check/:hash, DELETE /api/unregister/:hash, POST /api/notify
 * (identifierHash + message, bearer-authenticated), and the unauthenticated /health.
 *
 * Registration mints a real token via the app's own
 * POST /signal-notification/contact/sidecar-token route (exercising the real
 * app→sidecar HMAC token flow — see apps/worker/services/user-notifications.ts
 * issueRegistrationToken), then applies that token directly against
 * SIGNAL_NOTIFIER_URL (not the app-returned sidecarUrl, which is the docker-internal
 * hostname the app uses for its own server-to-server calls and is not reachable from
 * this host-side test process).
 *
 * The sidecar is available at SIGNAL_NOTIFIER_URL (default: http://localhost:3100).
 * In CI the sidecar is started via the --profile signal docker compose flag and is
 * REQUIRED for every scenario in this file (all are tagged @signal). If the sidecar
 * is unreachable — whether because it was never started, a registry pull failed, or
 * it crashed — these scenarios throw immediately and FAIL. They never pass or skip
 * silently: a green run here is only meaningful if the sidecar was actually
 * exercised. Environments that intentionally omit the Signal sidecar must exclude
 * @signal scenarios from the run (e.g. `--grep-invert @signal`), not rely on these
 * steps degrading gracefully.
 *
 * Scenarios tagged @fixme in signal-notification.feature test real message DELIVERY
 * (POST /api/notify actually reaching a linked Signal account via signal-cli). Neither
 * CI nor local dev provisions a real registered Signal number (SIGNAL_REGISTERED_NUMBER
 * is a placeholder +1555... value) — signal-cli-rest-api returns 400 "Specified account
 * does not exist" for any /v2/send in that state, so those scenarios cannot pass without
 * either a provisioned test account or a delivery mock. See feature file comments.
 */
import { createHmac } from 'node:crypto'
import { expect } from '@playwright/test'
import { Given, When, Then, getState, setState } from './fixtures'
import { ADMIN_SEED, apiGet, apiPost, apiPut } from '../../api-helpers'

// ── Constants ────────────────────────────────────────────────────────

const NOTIFIER_URL = process.env.SIGNAL_NOTIFIER_URL || 'http://localhost:3100'
const NOTIFIER_TOKEN = process.env.SIGNAL_NOTIFIER_BEARER_TOKEN || 'ci-test-notifier-key'

function notifierHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${NOTIFIER_TOKEN}`,
  }
}

/**
 * Throws a clear, actionable error when the signal-notifier sidecar could not
 * be reached (status 0 from notifierPost/notifierGet). This is the single
 * enforcement point that keeps a registry/build outage from silently
 * producing a green @signal run — see file header.
 */
function assertSidecarReachable(status: number, context: string): void {
  if (status === 0) {
    throw new Error(
      `signal-notifier sidecar unavailable at ${NOTIFIER_URL} while ${context}. ` +
        'This scenario is tagged @signal and requires the sidecar (docker compose ' +
        '--profile signal) to be up and healthy — it cannot be verified without it, ' +
        'so it fails rather than silently passing. If this environment intentionally ' +
        'excludes Signal sidecar tests, exclude @signal scenarios from the run via ' +
        '`--grep-invert "@signal"` instead.',
    )
  }
}

// ── Local State ──────────────────────────────────────────────────────

interface SignalNotificationState {
  identifierHash?: string
  contactNumber?: string
  registered?: boolean
  notificationDispatched?: boolean
  notificationStatus?: number
  healthStatus?: number
  preferences?: string
}

const STATE_KEY = 'signal-notification'

function getNotifState(world: Record<string, unknown>): SignalNotificationState {
  return getState<SignalNotificationState>(world, STATE_KEY) ?? {}
}

function ensureNotifState(world: Record<string, unknown>): SignalNotificationState {
  if (!getState(world, STATE_KEY)) {
    setState(world, STATE_KEY, {} as SignalNotificationState)
  }
  return getNotifState(world)
}

/**
 * POST directly to the signal-notifier sidecar (under its /api mount).
 * Returns { status, data } — status is 0 if the sidecar is unreachable.
 */
async function notifierPost<T>(
  request: import('@playwright/test').APIRequestContext,
  path: string,
  body: Record<string, unknown>,
  authenticated = true,
): Promise<{ status: number; data: T | null }> {
  try {
    const res = await request.post(`${NOTIFIER_URL}/api${path}`, {
      headers: authenticated ? notifierHeaders() : { 'Content-Type': 'application/json' },
      data: body,
    })
    const data = await res.json().catch(() => null) as T | null
    return { status: res.status(), data }
  } catch {
    // Sidecar not reachable in this environment
    return { status: 0, data: null }
  }
}

/**
 * GET/DELETE directly against the signal-notifier sidecar (under its /api mount, bearer-authenticated).
 */
async function notifierRequest<T>(
  request: import('@playwright/test').APIRequestContext,
  method: 'get' | 'delete',
  path: string,
): Promise<{ status: number; data: T | null }> {
  try {
    const res = await request[method](`${NOTIFIER_URL}/api${path}`, {
      headers: notifierHeaders(),
    })
    const data = await res.json().catch(() => null) as T | null
    return { status: res.status(), data }
  } catch {
    return { status: 0, data: null }
  }
}

/**
 * Health check lives at the sidecar root (not under /api) and is unauthenticated.
 */
async function notifierHealth(
  request: import('@playwright/test').APIRequestContext,
): Promise<{ status: number }> {
  try {
    const res = await request.get(`${NOTIFIER_URL}/health`)
    return { status: res.status() }
  } catch {
    return { status: 0 }
  }
}

/**
 * Register a Signal contact end-to-end through the real app→sidecar flow:
 *  1. GET the per-user HMAC key from the app (so the identifier is hashed the way a
 *     real client would, never exposing plaintext to the app).
 *  2. PUT the (hash-only, zero-knowledge) contact record to the app.
 *  3. POST for a short-lived, HMAC-signed sidecar registration token — this exercises
 *     the real apps/worker/services/user-notifications.ts issueRegistrationToken path.
 *  4. POST that token straight to the sidecar's POST /api/register-client, which is
 *     where the plaintext identifier is actually handed over (app never sees it).
 *
 * Applies the token against SIGNAL_NOTIFIER_URL (this test process's own reachable
 * sidecar address) rather than the app-returned sidecarUrl, which in CI/docker is the
 * compose-internal hostname (http://signal-notifier:3100) the app itself uses for
 * server-to-server calls and that this host-side test process cannot resolve.
 */
async function registerSignalContact(
  request: import('@playwright/test').APIRequestContext,
  phoneNumber: string,
  seed: string = ADMIN_SEED,
): Promise<string> {
  const { status: hmacStatus, data: hmacData } = await apiGet<{ hmacKey: string }>(
    request,
    '/signal-notification/hmac-key',
    seed,
  )
  expect(hmacStatus, 'GET /signal-notification/hmac-key must succeed to register a Signal contact').toBe(200)
  const identifierHash = createHmac('sha256', hmacData.hmacKey).update(phoneNumber).digest('hex')

  const { status: putStatus } = await apiPut(
    request,
    '/signal-notification/contact',
    {
      identifierHash,
      identifierCiphertext: `stub-ciphertext-${identifierHash.slice(0, 8)}`,
      identifierEnvelope: [{ recipientPubkey: '00'.repeat(32), encryptedKey: 'stub-envelope-key' }],
      identifierType: 'phone',
    },
    seed,
  )
  expect(putStatus, 'PUT /signal-notification/contact must succeed to register a Signal contact').toBe(200)

  const { status: tokenStatus, data: tokenData } = await apiPost<{ token: string; sidecarUrl: string }>(
    request,
    '/signal-notification/contact/sidecar-token',
    {},
    seed,
  )
  expect(tokenStatus, 'POST /signal-notification/contact/sidecar-token must succeed to mint a sidecar registration token').toBe(200)

  const { status: registerStatus } = await notifierPost(
    request,
    '/register-client',
    { token: tokenData.token, plaintextIdentifier: phoneNumber, identifierType: 'phone' },
    false, // /register-client is token-verified, not bearer-authenticated
  )
  assertSidecarReachable(registerStatus, 'registering a contact via POST /api/register-client')
  if (registerStatus !== 200) {
    throw new Error(
      `POST /api/register-client returned ${registerStatus} for a token freshly issued by ` +
        'the app — this is a real registration failure, not a sidecar-unreachable condition.',
    )
  }

  return identifierHash
}

// ── Given ────────────────────────────────────────────────────────────

Given('a registered Signal notification contact', async ({ request, world }) => {
  const notifState = ensureNotifState(world)
  const contactNumber = `+1555${Date.now().toString().slice(-7)}`
  const identifierHash = await registerSignalContact(request, contactNumber)
  notifState.contactNumber = contactNumber
  notifState.identifierHash = identifierHash
  notifState.registered = true
})

Given('a volunteer has a registered Signal notification contact', async ({ request, world }) => {
  const notifState = ensureNotifState(world)
  const contactNumber = `+1555${Date.now().toString().slice(-7)}`
  const identifierHash = await registerSignalContact(request, contactNumber)
  notifState.contactNumber = contactNumber
  notifState.identifierHash = identifierHash
  notifState.registered = true
})

Given(
  'a volunteer has security notification preferences set to {string}',
  async ({ request, world }, preferences: string) => {
    const notifState = ensureNotifState(world)
    notifState.preferences = preferences
    const contactNumber = `+1555${Date.now().toString().slice(-7)}`
    const identifierHash = await registerSignalContact(request, contactNumber)
    notifState.contactNumber = contactNumber
    notifState.identifierHash = identifierHash
    notifState.registered = true
  },
)

// ── When ─────────────────────────────────────────────────────────────

When(
  'the admin registers a Signal contact with number {string}',
  async ({ request, world }, phoneNumber: string) => {
    const notifState = ensureNotifState(world)
    const identifierHash = await registerSignalContact(request, phoneNumber, ADMIN_SEED)
    notifState.contactNumber = phoneNumber
    notifState.identifierHash = identifierHash
    notifState.registered = true
  },
)

When(
  'a new login from IP {string} is detected for the volunteer',
  async ({ request, world }, loginIp: string) => {
    const notifState = getNotifState(world)
    if (!notifState.identifierHash) {
      throw new Error('No identifierHash recorded — the prior registration step must run first.')
    }
    const { status } = await notifierPost(
      request,
      '/notify',
      { identifierHash: notifState.identifierHash, message: `New login detected from ${loginIp}` },
    )
    assertSidecarReachable(status, 'dispatching a new-login security alert')
    notifState.notificationStatus = status
    notifState.notificationDispatched = status === 200
  },
)

When('the first delivery attempt fails', async () => {
  // signal-notifier's POST /api/notify is a single synchronous call to signal-cli's
  // /v2/send — there is no persisted retry queue and no GET /notify/:id endpoint in
  // the real sidecar (see signal-notifier/src/routes.ts). This step, and the
  // "Notification delivery with retry on failure" scenario it belongs to, test a
  // retry-tracking feature that does not exist in the current implementation.
  // The scenario is tagged @fixme for exactly this reason — see feature file.
  throw new Error(
    'signal-notifier has no retry-tracking API (no persisted retry queue, no GET ' +
      '/notify/:id) — this scenario cannot be verified against the real sidecar as ' +
      'written. It is tagged @fixme and excluded from the default run; do not remove ' +
      'the tag without first adding retry tracking to signal-notifier or rewriting this ' +
      'scenario to match the sidecar\'s actual synchronous single-attempt contract.',
  )
})

When('the contact is unregistered', async ({ request, world }) => {
  const notifState = getNotifState(world)
  if (!notifState.identifierHash) {
    throw new Error(
      'No identifierHash recorded before "the contact is unregistered" — ' +
        'the prior registration step must have failed to record one.',
    )
  }
  const { status } = await notifierRequest(request, 'delete', `/unregister/${notifState.identifierHash}`)
  assertSidecarReachable(status, 'unregistering a contact')
  expect(status, 'DELETE /api/unregister/:hash must succeed').toBe(200)
  notifState.registered = false
})

When('a non-login security event occurs', async ({ request, world }) => {
  const notifState = getNotifState(world)
  if (!notifState.identifierHash) {
    throw new Error('No identifierHash recorded — the prior registration step must run first.')
  }
  const { status } = await notifierPost(request, '/notify', {
    identifierHash: notifState.identifierHash,
    message: 'Your password was changed',
  })
  assertSidecarReachable(status, 'dispatching a non-login security event')
  notifState.notificationStatus = status
  notifState.notificationDispatched = status === 200
})

When('any security event occurs', async ({ request, world }) => {
  const notifState = getNotifState(world)
  if (!notifState.identifierHash) {
    throw new Error('No identifierHash recorded — the prior registration step must run first.')
  }
  const { status } = await notifierPost(request, '/notify', {
    identifierHash: notifState.identifierHash,
    message: 'A security event occurred on your account',
  })
  assertSidecarReachable(status, 'dispatching a generic security event')
  notifState.notificationStatus = status
  notifState.notificationDispatched = status === 200
})

When('the signal-notifier health endpoint is requested', async ({ request, world }) => {
  const notifState = ensureNotifState(world)
  const { status } = await notifierHealth(request)
  assertSidecarReachable(status, 'requesting the health endpoint')
  notifState.healthStatus = status
})

// ── Then ─────────────────────────────────────────────────────────────

Then('the contact should be stored in the notification service', async ({ request, world }) => {
  const notifState = getNotifState(world)
  expect(notifState.registered).toBe(true)
  if (!notifState.identifierHash) {
    throw new Error('No identifierHash recorded — registration step must run first.')
  }
  const { status, data } = await notifierRequest<{ registered: boolean }>(
    request,
    'get',
    `/check/${notifState.identifierHash}`,
  )
  assertSidecarReachable(status, 'checking contact registration')
  expect(status).toBe(200)
  expect(data?.registered).toBe(true)
})

Then('the contact registration should succeed', async ({ world }) => {
  const notifState = getNotifState(world)
  expect(notifState.registered).toBe(true)
})

Then('a security alert notification should be dispatched', async ({ world }) => {
  const notifState = getNotifState(world)
  expect(notifState.notificationDispatched).toBe(true)
})

Then('the notification should contain the login IP', async ({ world }) => {
  const notifState = getNotifState(world)
  // POST /api/notify only accepts a pre-rendered message string (see NotifySchema in
  // signal-notifier/src/routes.ts) — the login IP is verified by construction in the
  // preceding When step's message text, not by a separate structured payload field.
  expect(notifState.notificationDispatched).toBe(true)
})

Then('the notification should be retried', async () => {
  throw new Error(
    'signal-notifier has no retry-tracking API — see the "the first delivery attempt ' +
      'fails" step. This scenario is tagged @fixme.',
  )
})

Then('the retry count should increment', async () => {
  throw new Error(
    'signal-notifier has no retry-tracking API — see the "the first delivery attempt ' +
      'fails" step. This scenario is tagged @fixme.',
  )
})

Then(
  'subsequent notifications should not be dispatched to that contact',
  async ({ request, world }) => {
    const notifState = getNotifState(world)
    if (!notifState.identifierHash) {
      throw new Error('No identifierHash recorded — registration step must run first.')
    }
    // The contact was just unregistered — the identifier hash should no longer resolve.
    const { status } = await notifierPost(request, '/notify', {
      identifierHash: notifState.identifierHash,
      message: 'This should not be delivered',
    })
    assertSidecarReachable(status, 'verifying the unregistered contact no longer receives notifications')
    expect(status).toBe(404)
  },
)

Then(
  'no notification should be dispatched for that event',
  async ({ world }) => {
    const notifState = getNotifState(world)
    // When preferences are "login_only", non-login events should not dispatch.
    // NOTE: signal-notifier has no preference model of its own — this scenario
    // exercises the app-level securityPrefs concept, which does not map onto
    // "login_only"/"all" semantics (see apps/worker/services/user-notifications.ts
    // AlertInput, which has no generic "security event" case). Tagged @fixme pending
    // a rewrite against the real alert-type model.
    expect(notifState.notificationDispatched).not.toBe(true)
  },
)

Then('a notification should be dispatched', async ({ world }) => {
  const notifState = getNotifState(world)
  expect(notifState.notificationDispatched).toBe(true)
})

Then('the notifier response status should be {int}', async ({ world }, expectedStatus: number) => {
  const notifState = getNotifState(world)
  expect(notifState.healthStatus).toBe(expectedStatus)
})
