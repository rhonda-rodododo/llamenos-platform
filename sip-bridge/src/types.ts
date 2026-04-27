// ---- ARI Event Types ----

/** Base ARI event — all events include these fields */
export interface AriEvent {
  type: string
  application: string
  timestamp: string
}

/** StasisStart — a channel has entered the Stasis application */
export interface StasisStartEvent extends AriEvent {
  type: 'StasisStart'
  args: string[]
  channel: AriChannel
}

/** StasisEnd — a channel has left the Stasis application */
export interface StasisEndEvent extends AriEvent {
  type: 'StasisEnd'
  channel: AriChannel
}

/** ChannelDtmfReceived — a DTMF digit was received on a channel */
export interface ChannelDtmfReceivedEvent extends AriEvent {
  type: 'ChannelDtmfReceived'
  digit: string
  duration_ms: number
  channel: AriChannel
}

/** ChannelStateChange — a channel's state has changed */
export interface ChannelStateChangeEvent extends AriEvent {
  type: 'ChannelStateChange'
  channel: AriChannel
}

/** ChannelHangupRequest — a hangup was requested on a channel */
export interface ChannelHangupRequestEvent extends AriEvent {
  type: 'ChannelHangupRequest'
  cause: number
  channel: AriChannel
}

/** ChannelDestroyed — a channel has been destroyed */
export interface ChannelDestroyedEvent extends AriEvent {
  type: 'ChannelDestroyed'
  cause: number
  cause_txt: string
  channel: AriChannel
}

/** PlaybackFinished — a playback has finished */
export interface PlaybackFinishedEvent extends AriEvent {
  type: 'PlaybackFinished'
  playback: AriPlayback
}

/** RecordingFinished — a recording has finished */
export interface RecordingFinishedEvent extends AriEvent {
  type: 'RecordingFinished'
  recording: AriRecording
}

/** RecordingFailed — a recording has failed */
export interface RecordingFailedEvent extends AriEvent {
  type: 'RecordingFailed'
  recording: AriRecording
}

/** ChannelEnteredBridge — a channel entered a bridge */
export interface ChannelEnteredBridgeEvent extends AriEvent {
  type: 'ChannelEnteredBridge'
  bridge: AriBridge
  channel: AriChannel
}

/** ChannelLeftBridge — a channel left a bridge */
export interface ChannelLeftBridgeEvent extends AriEvent {
  type: 'ChannelLeftBridge'
  bridge: AriBridge
  channel: AriChannel
}

export type AnyAriEvent =
  | StasisStartEvent
  | StasisEndEvent
  | ChannelDtmfReceivedEvent
  | ChannelStateChangeEvent
  | ChannelHangupRequestEvent
  | ChannelDestroyedEvent
  | PlaybackFinishedEvent
  | RecordingFinishedEvent
  | RecordingFailedEvent
  | ChannelEnteredBridgeEvent
  | ChannelLeftBridgeEvent
  | AriEvent // fallback for unknown events

// ---- ARI Resource Types ----

export interface AriChannel {
  id: string
  name: string
  state:
    | 'Down'
    | 'Rsrved'
    | 'OffHook'
    | 'Dialing'
    | 'Ring'
    | 'Ringing'
    | 'Up'
    | 'Busy'
    | 'Dialing Offhook'
    | 'Pre-ring'
    | 'Unknown'
  caller: { name: string; number: string }
  connected: { name: string; number: string }
  accountcode: string
  dialplan: { context: string; exten: string; priority: number }
  creationtime: string
  language: string
}

export interface AriBridge {
  id: string
  technology: string
  bridge_type: string
  bridge_class: string
  creator: string
  name: string
  channels: string[]
}

export interface AriPlayback {
  id: string
  media_uri: string
  target_uri: string
  language: string
  state: 'queued' | 'playing' | 'complete' | 'failed'
}

export interface AriRecording {
  name: string
  format: string
  state: 'queued' | 'recording' | 'paused' | 'done' | 'failed' | 'canceled'
  target_uri: string
  duration?: number
  talking_duration?: number
  silence_duration?: number
  cause?: string
}

// ---- Webhook Types (sent to Worker) ----

/** Webhook payload sent to the Worker in JSON format */
export interface WebhookPayload {
  event:
    | 'incoming'
    | 'language-selected'
    | 'captcha'
    | 'call-status'
    | 'wait-music'
    | 'queue-exit'
    | 'volunteer-answer'
    | 'call-recording'
    | 'voicemail-recording'
    | 'voicemail-complete'
  channelId: string
  callerNumber: string
  calledNumber?: string
  digits?: string
  callStatus?:
    | 'initiated'
    | 'ringing'
    | 'in-progress'
    | 'completed'
    | 'busy'
    | 'no-answer'
    | 'failed'
  queueTime?: number
  queueResult?: 'leave' | 'queue-full' | 'error' | 'bridged' | 'hangup'
  recordingStatus?: 'completed' | 'failed'
  recordingName?: string
  metadata?: Record<string, string>
}

// ---- Command Types (received from Worker) ----

/** Commands the Worker can send back to the bridge */
export type BridgeCommand =
  | PlaybackCommand
  | GatherCommand
  | BridgeCallCommand
  | HangupCommand
  | RecordCommand
  | RingCommand
  | QueueCommand
  | RejectCommand
  | RedirectCommand

export interface PlaybackCommand {
  action: 'playback'
  channelId: string
  media: string
  text?: string
  language?: string
}

export interface GatherCommand {
  action: 'gather'
  channelId: string
  numDigits: number
  timeout: number
  media?: string
  text?: string
  language?: string
  callbackPath: string
  callbackParams?: Record<string, string>
}

export interface BridgeCallCommand {
  action: 'bridge'
  callerChannelId: string
  volunteerChannelId: string
  record?: boolean
  /** Bridge type for SFrame E2EE: 'passthrough' disables media termination */
  bridgeType?: 'mixing' | 'passthrough'
  recordingCallbackPath?: string
  recordingCallbackParams?: Record<string, string>
}

export interface HangupCommand {
  action: 'hangup'
  channelId: string
  cause?: number
}

export interface RecordCommand {
  action: 'record'
  channelId: string
  name: string
  maxDuration: number
  beep: boolean
  callbackPath: string
  callbackParams?: Record<string, string>
}

export interface RingCommand {
  action: 'ring'
  endpoint: string
  callerId: string
  timeout: number
  answerCallbackPath: string
  answerCallbackParams?: Record<string, string>
  statusCallbackPath: string
  statusCallbackParams?: Record<string, string>
}

export interface QueueCommand {
  action: 'queue'
  channelId: string
  musicOnHold?: string
  waitCallbackPath?: string
  waitCallbackInterval?: number
  exitCallbackPath?: string
  callbackParams?: Record<string, string>
}

export interface RejectCommand {
  action: 'reject'
  channelId: string
  cause?: number
}

export interface RedirectCommand {
  action: 'redirect'
  path: string
  params?: Record<string, string>
  channelId: string
}

// ---- Bridge Internal State ----

/** Active call state tracked by the bridge */
export interface ActiveCall {
  channelId: string
  callerNumber: string
  calledNumber: string
  startedAt: number
  language?: string
  /**
   * Tier 5 voice E2EE call mode.
   * - `sframe`: entered via `[volunteers-sframe]` dialplan context — MUST NOT record.
   * - `pstn`: regular carrier leg — normal recording semantics.
   */
  mode: 'sframe' | 'pstn'
  bridgeId?: string
  ringingChannels: string[]
  dtmfBuffer: string
  activeGather?: {
    numDigits: number
    timeout: number
    callbackPath: string
    callbackParams?: Record<string, string>
    timeoutTimer?: ReturnType<typeof setTimeout>
  }
  queue?: {
    waitTimer?: ReturnType<typeof setTimeout>
    exitCallbackPath?: string
    callbackParams?: Record<string, string>
    startedAt: number
  }
}

/** Recording callback with creation timestamp for TTL pruning */
export interface RecordingCallbackEntry {
  callbackPath: string
  callbackParams: Record<string, string>
  channelId: string
  createdAt: number
}

/** Configuration for the bridge service */
export interface BridgeConfig {
  /** PBX type: asterisk, freeswitch, or kamailio */
  pbxType: 'asterisk' | 'freeswitch' | 'kamailio'
  /** ARI WebSocket URL (asterisk only) */
  ariUrl: string
  /** ARI REST API URL (asterisk only) */
  ariRestUrl: string
  /** ARI username (asterisk only) */
  ariUsername: string
  /** ARI password (asterisk only) */
  ariPassword: string
  /** ESL host (freeswitch only) */
  eslHost: string
  /** ESL port (freeswitch only) */
  eslPort: number
  /** ESL password (freeswitch only) */
  eslPassword: string
  /** Kamailio JSONRPC URL (kamailio only) */
  kamailioJsonrpcUrl: string
  /** Worker webhook URL */
  workerWebhookUrl: string
  /** Shared HMAC secret for signing */
  bridgeSecret: string
  /** HTTP server port */
  bridgePort: number
  /** HTTP server bind address */
  bridgeHost: string
  /** Stasis application name (asterisk only) */
  stasisApp: string
  /** SIP trunk provider hostname */
  sipProvider?: string
  /** SIP trunk username */
  sipUsername?: string
  /** SIP trunk password */
  sipPassword?: string
  /** Maximum time (ms) to wait for initial PBX connection. Default 5 minutes. */
  connectionTimeoutMs: number
}
