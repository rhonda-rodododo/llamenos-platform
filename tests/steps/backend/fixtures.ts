import { test as base, createBdd } from 'playwright-bdd'

/**
 * Backend BDD fixture — API-only, no browser page required.
 *
 * Uses Playwright's APIRequestContext for HTTP calls to the backend.
 * All backend step definitions import Given/When/Then from this file.
 */
export const test = base.extend({})

export const { Given, When, Then, Before, After } = createBdd(test)
