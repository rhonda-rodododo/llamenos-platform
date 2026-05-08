/**
 * WebSocket relay message schemas.
 *
 * Defines all client→server and server→client messages for the
 * authenticated WebSocket relay that replaces the Nostr/strfry relay.
 */
import { z } from 'zod'

// --- Protocol version ---
export const WS_PROTOCOL_VERSION = 1

// --- Client → Server messages ---

/** Auth response to server challenge */
export const wsAuthMessageSchema = z.object({
  type: z.literal('auth'),
  pubkey: z.string(),
  nonce: z.string(),
  ts: z.number(),
  sig: z.string(),
})

/** Subscribe to events for a hub */
export const wsSubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  hubId: z.string(),
  kinds: z.array(z.number()),
})

/** Unsubscribe from a hub */
export const wsUnsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  hubId: z.string(),
})

/** Request replay of missed events */
export const wsReplayMessageSchema = z.object({
  type: z.literal('replay'),
  hubId: z.string(),
  since: z.number(),
})

/** Client keepalive */
export const wsPingMessageSchema = z.object({
  type: z.literal('ping'),
})

/** Union of all client messages */
export const wsClientMessageSchema = z.discriminatedUnion('type', [
  wsAuthMessageSchema,
  wsSubscribeMessageSchema,
  wsUnsubscribeMessageSchema,
  wsReplayMessageSchema,
  wsPingMessageSchema,
])

// --- Server → Client messages ---

/** Auth challenge sent after upgrade */
export const wsChallengeMessageSchema = z.object({
  type: z.literal('challenge'),
  nonce: z.string(),
})

/** Auth confirmed with hub memberships */
export const wsAuthenticatedMessageSchema = z.object({
  type: z.literal('authenticated'),
  hubs: z.array(z.string()),
})

/** Real-time event delivery */
export const wsEventMessageSchema = z.object({
  type: z.literal('event'),
  v: z.number(),
  hubId: z.string(),
  kind: z.number(),
  payload: z.string(),
  epoch: z.number(),
  ts: z.number(),
  sig: z.string(),
})

/** Subscription confirmed */
export const wsSubscribedMessageSchema = z.object({
  type: z.literal('subscribed'),
  hubId: z.string(),
  kinds: z.array(z.number()),
})

/** Unsubscription confirmed (including forced revocation) */
export const wsUnsubscribedMessageSchema = z.object({
  type: z.literal('unsubscribed'),
  hubId: z.string(),
  reason: z.string().optional(),
})

/** Keepalive response */
export const wsPongMessageSchema = z.object({
  type: z.literal('pong'),
})

/** Error message */
export const wsErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
})

/** Union of all server messages */
export const wsServerMessageSchema = z.discriminatedUnion('type', [
  wsChallengeMessageSchema,
  wsAuthenticatedMessageSchema,
  wsEventMessageSchema,
  wsSubscribedMessageSchema,
  wsUnsubscribedMessageSchema,
  wsPongMessageSchema,
  wsErrorMessageSchema,
])

// --- Inferred types ---

export type WsAuthMessage = z.infer<typeof wsAuthMessageSchema>
export type WsSubscribeMessage = z.infer<typeof wsSubscribeMessageSchema>
export type WsUnsubscribeMessage = z.infer<typeof wsUnsubscribeMessageSchema>
export type WsReplayMessage = z.infer<typeof wsReplayMessageSchema>
export type WsPingMessage = z.infer<typeof wsPingMessageSchema>
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>

export type WsChallengeMessage = z.infer<typeof wsChallengeMessageSchema>
export type WsAuthenticatedMessage = z.infer<typeof wsAuthenticatedMessageSchema>
export type WsEventMessage = z.infer<typeof wsEventMessageSchema>
export type WsSubscribedMessage = z.infer<typeof wsSubscribedMessageSchema>
export type WsUnsubscribedMessage = z.infer<typeof wsUnsubscribedMessageSchema>
export type WsPongMessage = z.infer<typeof wsPongMessageSchema>
export type WsErrorMessage = z.infer<typeof wsErrorMessageSchema>
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>
