/**
 * Integration tests for ConversationDO — requires @cloudflare/vitest-pool-workers runtime.
 *
 * Tests cover:
 * - Incoming message creates new conversation
 * - Message threading within conversation
 * - Conversation assignment/claim
 * - Conversation status transitions (waiting -> active -> closed)
 * - Message delivery status updates
 * - Auto-assignment logic
 * - Subscriber management for blasts
 */
import { describe, it, expect } from 'vitest'

describe('ConversationDO integration', () => {
  it.todo('creates conversation from incoming message')
  it.todo('adds messages to existing conversation')
  it.todo('assigns conversation to volunteer')
  it.todo('transitions status: waiting -> active on assignment')
  it.todo('transitions status: active -> closed on close')
  it.todo('reopens a closed conversation on new inbound message')
  it.todo('tracks message delivery status')
  it.todo('lists conversations by status')
  it.todo('lists conversations assigned to volunteer')
  it.todo('manages blast subscribers')
})
