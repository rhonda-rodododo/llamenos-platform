import { type APIRequestContext } from '@playwright/test'
import { test as base, createBdd } from 'playwright-bdd'
import { createHubViaApi } from '../../api-helpers'

// ── Scenario-scoped World types ──────────────────────────────────────
// Each scenario gets a fresh instance via fixture. Step definitions read/write
// these instead of module-level `let` variables, enabling safe parallelism.

export type AdminWorld = {
  lastUserName: string
  lastUserPubkey: string
  lastShiftName: string
  lastPhone: string
}

export type RolesWorld = {
  cachedRoles: Array<Record<string, unknown>>
  lastCreatedRoleId: string
  volunteerNsec: string
  reporterNsec: string
}

export type CasesWorld = {
  createdCaseTitle: string
  lastCreatedRecordId: string
  volunteerPubkey: string
  lastRecordId: string
  initialFieldCount: number
  // Events
  eventEntityTypeId: string
  lastEventId: string
  lastEventName: string
  // Contacts
  contactCarlosId: string
  contactMariaId: string
  contactWithDataId: string
  // Triage
  triageReportTypeId: string
  triageReportId: string
}

/**
 * Extended test fixture that monitors API responses and page errors.
 * Catches buried 401/403/500 errors and unhandled JS exceptions that
 * would otherwise go unnoticed during test execution.
 *
 * workerHub: worker-scoped hub ID injected into the page via
 * window.__TEST_SET_ACTIVE_HUB — each Playwright worker gets its own
 * isolated hub so parallel tests don't share database state.
 */
export const test = base.extend<
  {
    apiErrors: { responses: Array<{ url: string; status: number }>; pageErrors: Error[] }
    backendRequest: APIRequestContext
    adminWorld: AdminWorld
    rolesWorld: RolesWorld
    casesWorld: CasesWorld
  },
  {
    workerHub: string
  }
>({
  // Backend API request context — targets the backend server directly (not the Vite preview).
  // Used by CMS step definitions that need to call API helpers for Given-step data setup.
  backendRequest: async ({ playwright }, use) => {
    const backendUrl = process.env.TEST_HUB_URL || 'http://localhost:3000'
    const ctx = await playwright.request.newContext({ baseURL: backendUrl })
    await use(ctx)
    await ctx.dispose()
  },
  apiErrors: [async ({ page }, use) => {
    const state = { responses: [] as Array<{ url: string; status: number }>, pageErrors: [] as Error[] }

    // Monitor all API responses for server errors and auth failures
    page.on('response', (response) => {
      const url = response.url()
      const status = response.status()
      // Only track /api/ calls, skip static assets and test-reset
      if (!url.includes('/api/') || url.includes('/api/test-reset')) return
      if (status >= 400) {
        state.responses.push({ url: url.replace(/^https?:\/\/[^/]+/, ''), status })
      }
    })

    // Monitor unhandled JS errors (React crashes, unhandled promise rejections)
    page.on('pageerror', (error) => {
      state.pageErrors.push(error)
    })

    await use(state)

    // After each test: warn about buried errors (soft-fail to avoid breaking existing tests)
    // but hard-fail on 500s which indicate real server bugs
    const serverErrors = state.responses.filter(r => r.status >= 500)
    if (serverErrors.length > 0) {
      const summary = serverErrors.map(r => `${r.status} ${r.url}`).join('\n  ')
      throw new Error(`Server errors detected during test:\n  ${summary}`)
    }

    // Log 401/403 as warnings — these may be intentional (permission tests)
    // but are worth surfacing in trace output
    const authErrors = state.responses.filter(r => r.status === 401 || r.status === 403)
    if (authErrors.length > 0) {
      const summary = authErrors.map(r => `${r.status} ${r.url}`).join(', ')
      console.warn(`[test-monitor] Auth errors during test: ${summary}`)
    }

    // Hard-fail on unhandled page errors (React crashes, etc.)
    if (state.pageErrors.length > 0) {
      const summary = state.pageErrors.map(e => e.message).join('\n  ')
      throw new Error(`Unhandled page errors during test:\n  ${summary}`)
    }
  }, { auto: true }],
  // Scenario-scoped world objects — fresh per test, no cross-scenario leakage.
  adminWorld: async ({}, use) => {
    await use({ lastUserName: '', lastUserPubkey: '', lastShiftName: '', lastPhone: '' })
  },
  rolesWorld: async ({}, use) => {
    await use({ cachedRoles: [], lastCreatedRoleId: '', volunteerNsec: '', reporterNsec: '' })
  },
  casesWorld: async ({}, use) => {
    await use({
      createdCaseTitle: '', lastCreatedRecordId: '', volunteerPubkey: '', lastRecordId: '',
      initialFieldCount: 0,
      eventEntityTypeId: '', lastEventId: '', lastEventName: '',
      contactCarlosId: '', contactMariaId: '', contactWithDataId: '',
      triageReportTypeId: '', triageReportId: '',
    })
  },
  // Worker-scoped hub: created once per Playwright worker process.
  // Each worker gets its own isolated hub so parallel tests don't share state.
  // Hub is NOT deleted after tests — stale hubs accumulate and are purged separately.
  workerHub: [async ({ playwright }, use, workerInfo) => {
    const backendUrl = process.env.TEST_HUB_URL || 'http://localhost:3000'
    const ctx = await playwright.request.newContext({ baseURL: backendUrl })
    const name = `test-hub-${workerInfo.workerIndex}-${Date.now()}`
    const hubId = await createHubViaApi(ctx, name)
    await ctx.dispose()
    await use(hubId)
  }, { scope: 'worker' }],
})

export const { Given, When, Then, Before, After } = createBdd(test)
