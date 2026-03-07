import { test as base, createBdd } from 'playwright-bdd'

/**
 * Extended test fixture that monitors API responses and page errors.
 * Catches buried 401/403/500 errors and unhandled JS exceptions that
 * would otherwise go unnoticed during test execution.
 */
export const test = base.extend<{
  apiErrors: { responses: Array<{ url: string; status: number }>; pageErrors: Error[] }
}>({
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
})

export const { Given, When, Then, Before, After } = createBdd(test)
