/**
 * Nostr relay client — public API.
 *
 * Re-exports the RelayManager, event utilities, and React integration
 * for use throughout the client app.
 */

export { RelayManager } from './relay'
export type { RelayManagerOptions } from './relay'
export { EventDeduplicator, createHubEvent, validateLlamenosEvent, parseLlamenosContent } from './events'
export type {
  LlamenosEvent,
  CallRingEvent,
  CallAnsweredEvent,
  CallEndedEvent,
  CallUpdateEvent,
  VoicemailEvent,
  PresenceSummaryEvent,
  PresenceDetailEvent,
  MessageNewEvent,
  ConversationAssignedEvent,
  ConversationClosedEvent,
  ConversationNewEvent,
  MessageStatusEvent,
  RelayState,
  NostrEventHandler,
} from './types'
export { NostrProvider, useRelay, useRelayState } from './context'
export { useNostrSubscription } from './hooks'
