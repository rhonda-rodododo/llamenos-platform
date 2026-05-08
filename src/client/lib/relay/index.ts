/**
 * WebSocket relay client — public API.
 *
 * Re-exports the RelayConnection, event types, and React integration.
 */

export { RelayConnection } from './connection'
export type { RelayConnectionOptions } from './connection'
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
  RelayEventHandler,
} from './types'
export { RelayProvider, useRelay, useRelayState } from './context'
export { useRelaySubscription } from './hooks'
