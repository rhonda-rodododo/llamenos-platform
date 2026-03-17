/**
 * Worker entry point.
 * For Bun self-hosted deployment, the server starts via src/server.ts.
 * This file exists for the CF Workers marketing site deployment only.
 */
import app from './app'

export default {
  fetch: app.fetch,
}
