/**
 * Integration tests for IdentityDO — requires @cloudflare/vitest-pool-workers runtime.
 *
 * These tests run inside Miniflare with real Durable Object storage.
 * Run with: bun run test:worker:integration
 *
 * Tests cover:
 * - Volunteer registration and lookup
 * - Admin pubkey bootstrap
 * - Session creation and validation
 * - WebAuthn credential storage
 * - Invite code redemption
 * - Volunteer deactivation
 */
import { describe, it, expect } from 'vitest'

describe('IdentityDO integration', () => {
  it.todo('creates a new volunteer via registration')
  it.todo('looks up volunteer by pubkey')
  it.todo('lists all volunteers')
  it.todo('updates volunteer profile')
  it.todo('deactivates a volunteer')
  it.todo('creates and validates a session token')
  it.todo('rejects expired session tokens')
  it.todo('stores WebAuthn credentials')
  it.todo('creates invite codes')
  it.todo('redeems invite codes')
  it.todo('rejects expired invite codes')
  it.todo('prevents duplicate invite redemption')
})
