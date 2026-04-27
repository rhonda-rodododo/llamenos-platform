import type { AriClient } from './ari-client'
import type { WebhookSender } from './webhook-sender'
import type {
  AnyAriEvent,
  StasisStartEvent,
  StasisEndEvent,
  ChannelDtmfReceivedEvent,
  ChannelStateChangeEvent,
  ChannelHangupRequestEvent,
  ChannelDestroyedEvent,
  RecordingFinishedEvent,
  RecordingFailedEvent,
  PlaybackFinishedEvent,
  ActiveCall,
  BridgeCommand,
  BridgeConfig,
  WebhookPayload,
} from './types'

/** Recording callback with creation timestamp for TTL pruning */
interface RecordingCallbackEntry {
  callbackPath: string
  callbackParams: Record<string, string>
  channelId: string
  createdAt: number
}

/** TTL for recording callbacks — entries older than this are pruned */
const RECORDING_CALLBACK_TTL_MS = 5 * 60 * 1000 // 5 minutes
/** Interval for the TTL sweep timer */
const RECORDING_CALLBACK_SWEEP_INTERVAL_MS = 60 * 1000 // 60 seconds

/**
 * CommandHandler — the central orchestrator that:
 * 1. Receives ARI events and translates them into CF Worker webhooks
 * 2. Receives HTTP commands from the CF Worker (or TwiML translated to commands)
 *    and executes them as ARI REST calls
 * 3. Maintains call state for coordinating multi-step flows
 */
export class CommandHandler {
  private ari: AriClient
  private webhook: WebhookSender
  private config: BridgeConfig

  /** Active calls indexed by channel ID.
   *  Pruning: entries removed via cleanupCall() on StasisEnd/ChannelDestroyed. */
  private calls = new Map<string, ActiveCall>()

  /** Map of queue name (= parentCallSid) → caller channel ID.
   *  Pruning: entries removed via cleanupCall(). */
  private queues = new Map<string, string>()

  /** Map of bridge ID → { callerChannelId, volunteerChannelId }.
   *  Pruning: entries removed via cleanupCall() → cleanupBridge(). */
  private bridges = new Map<string, { callerChannelId: string; volunteerChannelId: string }>()

  /** Map of recording name → callback info.
   *  Pruning: event-driven on RecordingFinished/Failed, TTL sweep every 60s,
   *  and bulk removal per-channel via cleanupCall(). */
  private recordingCallbacks = new Map<string, RecordingCallbackEntry>()

  /** Map of volunteer channel ID → parent call SID (for ringing coordination).
   *  Pruning: entries removed via cleanupCall() and onStasisEnd volunteer path. */
  private ringingMap = new Map<string, string>()

  /** Configured hotline number (for the To field) */
  private hotlineNumber: string = ''

  /** Handle for the recording callback TTL sweep interval */
  private recordingCallbackSweepTimer: ReturnType<typeof setInterval>

  constructor(ari: AriClient, webhook: WebhookSender, config: BridgeConfig) {
    this.ari = ari
    this.webhook = webhook
    this.config = config

    // Start periodic TTL sweep for stale recording callbacks
    this.recordingCallbackSweepTimer = setInterval(() => {
      this.pruneStaleRecordingCallbacks()
    }, RECORDING_CALLBACK_SWEEP_INTERVAL_MS)
  }

  /** Stop background timers (for graceful shutdown) */
  dispose(): void {
    clearInterval(this.recordingCallbackSweepTimer)
  }

  /** Set the hotline phone number (for webhook payloads) */
  setHotlineNumber(number: string): void {
    this.hotlineNumber = number
  }

  // ================================================================
  // Centralized Call Lifecycle Cleanup
  // ================================================================

  /**
   * cleanupCall — single function that tears down ALL state for a call.
   * Must be called unconditionally when a call ends (StasisEnd, ChannelDestroyed).
   * Clears: gather timeout, queue interval, recording callbacks, bridges,
   * ringing channels, and finally removes from the calls Map.
   */
  private cleanupCall(channelId: string): void {
    const call = this.calls.get(channelId)
    if (call) {
      // 1. Clear gather timeout timer
      if (call.activeGather?.timeoutTimer) {
        clearTimeout(call.activeGather.timeoutTimer)
        call.activeGather = undefined
      }

      // 2. Clear queue wait interval
      if (call.queue?.waitTimer) {
        clearInterval(call.queue.waitTimer)
        call.queue = undefined
      }

      // 3. Clean up bridge (hang up other leg, destroy bridge)
      this.cleanupBridge(channelId)

      // 4. Cancel all ringing channels spawned by this call
      this.cancelRingingForCall(channelId)

      // 5. Remove recording callbacks associated with this channel
      for (const [name, entry] of this.recordingCallbacks) {
        if (entry.channelId === channelId) {
          this.recordingCallbacks.delete(name)
        }
      }

      // 6. Remove from calls map
      this.calls.delete(channelId)
    }

    // 7. Remove from queues
    this.queues.delete(channelId)

    // 8. If this was a volunteer ringing channel, clean up ringing state
    const parentSid = this.ringingMap.get(channelId)
    if (parentSid) {
      this.ringingMap.delete(channelId)
      const parentCall = this.calls.get(parentSid)
      if (parentCall) {
        parentCall.ringingChannels = parentCall.ringingChannels.filter(id => id !== channelId)
      }
    }
  }

  /** Prune recording callbacks older than RECORDING_CALLBACK_TTL_MS */
  private pruneStaleRecordingCallbacks(): void {
    const now = Date.now()
    let pruned = 0
    for (const [name, entry] of this.recordingCallbacks) {
      if (now - entry.createdAt > RECORDING_CALLBACK_TTL_MS) {
        this.recordingCallbacks.delete(name)
        pruned++
      }
    }
    if (pruned > 0) {
      console.log(`[handler] Pruned ${pruned} stale recording callback(s)`)
    }
  }

  // ================================================================
  // ARI Event Handlers
  // ================================================================

  /** Process an ARI event */
  async handleEvent(event: AnyAriEvent): Promise<void> {
    switch (event.type) {
      case 'StasisStart':
        await this.onStasisStart(event as StasisStartEvent)
        break
      case 'StasisEnd':
        await this.onStasisEnd(event as StasisEndEvent)
        break
      case 'ChannelDtmfReceived':
        await this.onDtmfReceived(event as ChannelDtmfReceivedEvent)
        break
      case 'ChannelStateChange':
        await this.onChannelStateChange(event as ChannelStateChangeEvent)
        break
      case 'ChannelHangupRequest':
        await this.onHangupRequest(event as ChannelHangupRequestEvent)
        break
      case 'ChannelDestroyed':
        await this.onChannelDestroyed(event as ChannelDestroyedEvent)
        break
      case 'RecordingFinished':
        await this.onRecordingFinished(event as RecordingFinishedEvent)
        break
      case 'RecordingFailed':
        await this.onRecordingFailed(event as RecordingFailedEvent)
        break
      case 'PlaybackFinished':
        await this.onPlaybackFinished(event as PlaybackFinishedEvent)
        break
      default:
        // Ignore unknown events
        break
    }
  }

  /** StasisStart — new call entered the Stasis application */
  private async onStasisStart(event: StasisStartEvent): Promise<void> {
    const channel = event.channel
    const args = event.args || []

    console.log(`[handler] StasisStart channel=${channel.id} caller=${channel.caller.number} args=${args.join(',')}`)

    // Check if this is a volunteer outbound leg (originated by us for ringing)
    if (args[0] === 'dialed') {
      // This is an outbound call to a volunteer — they answered
      const parentCallSid = args[1]
      const pubkey = args[2]
      if (parentCallSid && pubkey) {
        await this.onVolunteerAnswered(channel.id, parentCallSid, pubkey)
      }
      return
    }

    // Incoming call — answer the channel and notify the Worker
    await this.ari.answerChannel(channel.id)

    const call: ActiveCall = {
      channelId: channel.id,
      callerNumber: channel.caller.number || 'unknown',
      calledNumber: channel.connected.number || this.hotlineNumber,
      startedAt: Date.now(),
      ringingChannels: [],
      dtmfBuffer: '',
    }
    this.calls.set(channel.id, call)

    // Send incoming webhook to Worker (Step 1: /api/telephony/incoming)
    const payload: WebhookPayload = {
      event: 'incoming',
      CallSid: channel.id,
      From: call.callerNumber,
      To: call.calledNumber,
    }

    const response = await this.webhook.sendWebhook('/api/telephony/incoming', payload)
    if (response.ok) {
      const twiml = await response.text()
      const commands = this.webhook.parseTwimlToCommands(twiml, channel.id)
      await this.executeCommands(commands)
    }
  }

  /** StasisEnd — channel left Stasis */
  private async onStasisEnd(event: StasisEndEvent): Promise<void> {
    const channelId = event.channel.id
    console.log(`[handler] StasisEnd channel=${channelId}`)
    this.cleanupCall(channelId)
  }

  /** DTMF digit received */
  private async onDtmfReceived(event: ChannelDtmfReceivedEvent): Promise<void> {
    const channelId = event.channel.id
    const digit = event.digit

    console.log(`[handler] DTMF channel=${channelId} digit=${digit}`)

    const call = this.calls.get(channelId)
    if (!call) return

    // If there's an active gather, add the digit to the buffer
    if (call.activeGather) {
      call.dtmfBuffer += digit

      // Check if we've collected enough digits
      if (call.dtmfBuffer.length >= call.activeGather.numDigits) {
        // Clear the timeout
        if (call.activeGather.timeoutTimer) {
          clearTimeout(call.activeGather.timeoutTimer)
        }

        const digits = call.dtmfBuffer
        const gather = call.activeGather
        call.dtmfBuffer = ''
        call.activeGather = undefined

        // Stop any playing prompt
        try {
          await this.ari.stopPlayback(`gather-${channelId}`)
        } catch { /* playback may not exist */ }

        // Send digits to Worker via callback
        await this.sendGatherResult(channelId, call, digits, gather.callbackPath, gather.callbackParams)
      }
    }
  }

  /** Channel state changed */
  private async onChannelStateChange(event: ChannelStateChangeEvent): Promise<void> {
    const channel = event.channel
    const parentSid = this.ringingMap.get(channel.id)

    if (parentSid && channel.state === 'Up') {
      // Volunteer answered — handled in StasisStart with 'dialed' arg
      console.log(`[handler] ChannelStateChange channel=${channel.id} state=${channel.state} (volunteer ringing)`)
    }
  }

  /** Hangup requested */
  private async onHangupRequest(event: ChannelHangupRequestEvent): Promise<void> {
    const channelId = event.channel.id
    console.log(`[handler] HangupRequest channel=${channelId}`)

    const call = this.calls.get(channelId)
    if (!call) return

    // If caller was in queue, send queue-exit webhook with 'hangup' result
    if (call.queue) {
      await this.sendQueueExit(channelId, call, 'hangup')
    }
  }

  /** Channel destroyed */
  private async onChannelDestroyed(event: ChannelDestroyedEvent): Promise<void> {
    const channelId = event.channel.id
    console.log(`[handler] ChannelDestroyed channel=${channelId} cause=${event.cause_txt}`)

    // Send call-status webhook for volunteer calls before cleanup
    const parentSid = this.ringingMap.get(channelId)
    if (parentSid) {
      const parentCall = this.calls.get(parentSid)
      const callerNumber = parentCall?.callerNumber ?? 'unknown'

      // Determine status from cause
      let callStatus: 'completed' | 'busy' | 'no-answer' | 'failed' = 'completed'
      switch (event.cause) {
        case 17: callStatus = 'busy'; break     // User busy
        case 19: callStatus = 'no-answer'; break // No answer
        case 21: callStatus = 'failed'; break    // Call rejected
        default: callStatus = 'completed'
      }

      const payload: WebhookPayload = {
        event: 'call-status',
        CallSid: channelId,
        From: callerNumber,
        To: this.hotlineNumber,
        CallStatus: callStatus,
      }

      // Extract pubkey from app args if we stored it
      const queryParams: Record<string, string> = { parentCallSid: parentSid }
      await this.webhook.sendWebhook('/api/telephony/call-status', payload, queryParams)
    }

    // Unconditional cleanup — catches anything onStasisEnd might have missed
    this.cleanupCall(channelId)
  }

  /** Recording finished */
  private async onRecordingFinished(event: RecordingFinishedEvent): Promise<void> {
    const recording = event.recording
    console.log(`[handler] RecordingFinished name=${recording.name} duration=${recording.duration}`)

    const callback = this.recordingCallbacks.get(recording.name)
    if (callback) {
      const call = this.calls.get(callback.channelId)
      const payload: WebhookPayload = {
        event: 'call-recording',
        CallSid: callback.channelId,
        From: call?.callerNumber ?? 'unknown',
        To: this.hotlineNumber,
        RecordingStatus: 'completed',
        RecordingSid: recording.name,
      }
      await this.webhook.sendWebhook(callback.callbackPath, payload, callback.callbackParams)
      this.recordingCallbacks.delete(recording.name)
    }
  }

  /** Recording failed */
  private async onRecordingFailed(event: RecordingFailedEvent): Promise<void> {
    const recording = event.recording
    console.log(`[handler] RecordingFailed name=${recording.name}`)

    const callback = this.recordingCallbacks.get(recording.name)
    if (callback) {
      const call = this.calls.get(callback.channelId)
      const payload: WebhookPayload = {
        event: 'call-recording',
        CallSid: callback.channelId,
        From: call?.callerNumber ?? 'unknown',
        To: this.hotlineNumber,
        RecordingStatus: 'failed',
        RecordingSid: recording.name,
      }
      await this.webhook.sendWebhook(callback.callbackPath, payload, callback.callbackParams)
      this.recordingCallbacks.delete(recording.name)
    }
  }

  /** Playback finished */
  private async onPlaybackFinished(event: PlaybackFinishedEvent): Promise<void> {
    // If this was a gather prompt that finished without digits, handle timeout
    const playback = event.playback
    if (playback.id.startsWith('gather-')) {
      const channelId = playback.id.replace('gather-', '')
      const call = this.calls.get(channelId)
      if (call?.activeGather && call.dtmfBuffer.length === 0) {
        // Start the timeout timer for DTMF input after prompt finishes
        const gather = call.activeGather
        call.activeGather.timeoutTimer = setTimeout(async () => {
          // Timeout — send empty digits
          if (call.activeGather === gather) {
            call.activeGather = undefined
            call.dtmfBuffer = ''
            await this.sendGatherResult(channelId, call, '', gather.callbackPath, gather.callbackParams)
          }
        }, gather.timeout * 1000)
      }
    }
  }

  // ================================================================
  // Volunteer Ringing
  // ================================================================

  /** Called when a volunteer answers an outbound ringing call */
  private async onVolunteerAnswered(
    volunteerChannelId: string,
    parentCallSid: string,
    pubkey: string,
  ): Promise<void> {
    console.log(`[handler] Volunteer answered channel=${volunteerChannelId} parent=${parentCallSid} pubkey=${pubkey}`)

    // Send volunteer-answer webhook
    const parentCall = this.calls.get(parentCallSid)
    const payload: WebhookPayload = {
      event: 'volunteer-answer',
      CallSid: volunteerChannelId,
      From: parentCall?.callerNumber ?? 'unknown',
      To: this.hotlineNumber,
    }

    const queryParams = {
      parentCallSid,
      pubkey,
    }

    const response = await this.webhook.sendWebhook('/api/telephony/volunteer-answer', payload, queryParams)
    if (response.ok) {
      const twiml = await response.text()
      const commands = this.webhook.parseTwimlToCommands(twiml, volunteerChannelId)

      // Cancel ringing for other volunteers
      if (parentCall) {
        for (const ringChannelId of parentCall.ringingChannels) {
          if (ringChannelId !== volunteerChannelId) {
            try {
              await this.ari.hangupChannel(ringChannelId)
            } catch { /* may already be gone */ }
          }
        }
        parentCall.ringingChannels = []
      }

      await this.executeCommands(commands)
    }
  }

  // ================================================================
  // Command Execution
  // ================================================================

  /** Execute a list of bridge commands (translated from TwiML or received directly) */
  async executeCommands(commands: BridgeCommand[]): Promise<void> {
    for (const cmd of commands) {
      try {
        await this.executeCommand(cmd)
      } catch (err) {
        console.error(`[handler] Command failed:`, cmd.action, err)
      }
    }
  }

  /** Execute a single bridge command */
  private async executeCommand(cmd: BridgeCommand): Promise<void> {
    switch (cmd.action) {
      case 'playback':
        await this.execPlayback(cmd)
        break
      case 'gather':
        await this.execGather(cmd)
        break
      case 'bridge':
        await this.execBridge(cmd)
        break
      case 'hangup':
        await this.execHangup(cmd)
        break
      case 'record':
        await this.execRecord(cmd)
        break
      case 'ring':
        await this.execRing(cmd)
        break
      case 'queue':
        await this.execQueue(cmd)
        break
      case 'reject':
        await this.execReject(cmd)
        break
      case 'redirect':
        await this.execRedirect(cmd)
        break
    }
  }

  /** Play audio on a channel */
  private async execPlayback(cmd: BridgeCommand & { action: 'playback' }): Promise<void> {
    if (cmd.text) {
      // For TTS, we use Asterisk's built-in TTS or pre-rendered audio files.
      // The actual TTS implementation depends on Asterisk's TTS engine config.
      // For now, use Asterisk sound files as placeholders.
      // In production, you'd use a TTS engine (Festival, Cepstral, Google TTS)
      // or pre-render audio files and serve them via HTTP.
      console.log(`[handler] TTS playback: "${cmd.text.substring(0, 50)}..." lang=${cmd.language}`)
      // Use Asterisk TTS if available, otherwise log warning
      try {
        await this.ari.playMedia(cmd.channelId, `sound:beep`)
      } catch (err) {
        console.warn(`[handler] TTS playback failed, channel may be gone:`, err)
      }
    } else {
      // Direct media playback
      const media = cmd.media.startsWith('http') ? cmd.media : `sound:${cmd.media}`
      try {
        await this.ari.playMedia(cmd.channelId, media)
      } catch (err) {
        console.warn(`[handler] Playback failed:`, err)
      }
    }
  }

  /** Gather DTMF digits */
  private async execGather(cmd: BridgeCommand & { action: 'gather' }): Promise<void> {
    const call = this.calls.get(cmd.channelId)
    if (!call) return

    // Set up gather state
    call.dtmfBuffer = ''
    call.activeGather = {
      numDigits: cmd.numDigits,
      timeout: cmd.timeout,
      callbackPath: cmd.callbackPath,
      callbackParams: cmd.callbackParams,
    }

    // Play the prompt (if any)
    if (cmd.text || cmd.media) {
      const media = cmd.media
        ? (cmd.media.startsWith('http') ? cmd.media : `sound:${cmd.media}`)
        : 'sound:beep'
      try {
        await this.ari.playMedia(cmd.channelId, media, `gather-${cmd.channelId}`)
      } catch (err) {
        console.warn(`[handler] Gather playback failed:`, err)
        // Start timeout even if playback fails
        call.activeGather.timeoutTimer = setTimeout(async () => {
          if (call.activeGather) {
            const gather = call.activeGather
            call.activeGather = undefined
            call.dtmfBuffer = ''
            await this.sendGatherResult(cmd.channelId, call, '', gather.callbackPath, gather.callbackParams)
          }
        }, cmd.timeout * 1000)
      }
    } else {
      // No prompt — just wait for digits
      call.activeGather.timeoutTimer = setTimeout(async () => {
        if (call.activeGather) {
          const gather = call.activeGather
          call.activeGather = undefined
          const digits = call.dtmfBuffer
          call.dtmfBuffer = ''
          await this.sendGatherResult(cmd.channelId, call, digits, gather.callbackPath, gather.callbackParams)
        }
      }, cmd.timeout * 1000)
    }
  }

  /** Bridge two channels */
  private async execBridge(cmd: BridgeCommand & { action: 'bridge' }): Promise<void> {
    // Resolve the caller channel from the queue
    let callerChannelId = cmd.callerChannelId
    if (this.queues.has(callerChannelId)) {
      callerChannelId = this.queues.get(callerChannelId)!
    }

    console.log(`[handler] Bridging caller=${callerChannelId} volunteer=${cmd.volunteerChannelId}`)

    // Stop hold music on the caller
    const callerCall = this.calls.get(callerChannelId)
    if (callerCall?.queue?.waitTimer) {
      clearInterval(callerCall.queue.waitTimer)
      callerCall.queue = undefined
    }
    try {
      await this.ari.stopMoh(callerChannelId)
    } catch { /* may not be on hold */ }

    // Create bridge
    const bridgeId = `bridge-${callerChannelId}-${Date.now()}`
    const bridge = await this.ari.createBridge({ bridgeId, type: 'mixing', name: bridgeId })

    // Add both channels to bridge
    await this.ari.addChannelToBridge(bridge.id, callerChannelId)
    await this.ari.addChannelToBridge(bridge.id, cmd.volunteerChannelId)

    // Track bridge state
    this.bridges.set(bridge.id, {
      callerChannelId,
      volunteerChannelId: cmd.volunteerChannelId,
    })

    if (callerCall) {
      callerCall.bridgeId = bridge.id
    }

    // Start recording if requested
    if (cmd.record) {
      const recordingName = `call-${callerChannelId}-${Date.now()}`
      try {
        await this.ari.recordBridge(bridge.id, {
          name: recordingName,
          format: 'wav',
        })

        if (cmd.recordingCallbackPath) {
          this.recordingCallbacks.set(recordingName, {
            callbackPath: cmd.recordingCallbackPath,
            callbackParams: cmd.recordingCallbackParams ?? {},
            channelId: callerChannelId,
            createdAt: Date.now(),
          })
        }
      } catch (err) {
        console.error(`[handler] Failed to start bridge recording:`, err)
      }
    }
  }

  /** Hang up a channel */
  private async execHangup(cmd: BridgeCommand & { action: 'hangup' }): Promise<void> {
    console.log(`[handler] Hangup channel=${cmd.channelId}`)
    await this.ari.hangupChannel(cmd.channelId, cmd.cause ? `cause-${cmd.cause}` : 'normal')
  }

  /** Record a channel */
  private async execRecord(cmd: BridgeCommand & { action: 'record' }): Promise<void> {
    console.log(`[handler] Recording channel=${cmd.channelId} name=${cmd.name}`)

    if (cmd.beep) {
      try {
        await this.ari.playMedia(cmd.channelId, 'tone:1004/200')
      } catch { /* beep failed, continue anyway */ }
    }

    try {
      await this.ari.recordChannel(cmd.channelId, {
        name: cmd.name,
        format: 'wav',
        maxDurationSeconds: cmd.maxDuration,
        beep: false, // We already beeped
        terminateOn: '#',
      })

      this.recordingCallbacks.set(cmd.name, {
        callbackPath: cmd.callbackPath,
        callbackParams: cmd.callbackParams ?? {},
        channelId: cmd.channelId,
        createdAt: Date.now(),
      })
    } catch (err) {
      console.error(`[handler] Failed to start recording:`, err)
    }
  }

  /** Originate an outbound call (ring a volunteer) */
  private async execRing(cmd: BridgeCommand & { action: 'ring' }): Promise<void> {
    console.log(`[handler] Ringing ${cmd.endpoint} for call`)

    try {
      const channel = await this.ari.originate({
        endpoint: cmd.endpoint,
        callerId: cmd.callerId,
        timeout: cmd.timeout,
        app: this.config.stasisApp,
        appArgs: `dialed,${cmd.answerCallbackParams?.parentCallSid ?? ''},${cmd.answerCallbackParams?.pubkey ?? ''}`,
      })

      // Track this as a ringing channel
      const parentSid = cmd.answerCallbackParams?.parentCallSid
      if (parentSid) {
        this.ringingMap.set(channel.id, parentSid)
        const parentCall = this.calls.get(parentSid)
        if (parentCall) {
          parentCall.ringingChannels.push(channel.id)
        }
      }

      console.log(`[handler] Originated channel=${channel.id} for ${cmd.endpoint}`)
    } catch (err) {
      console.error(`[handler] Failed to originate call to ${cmd.endpoint}:`, err)
    }
  }

  /** Place a caller in queue (hold with music) */
  private async execQueue(cmd: BridgeCommand & { action: 'queue' }): Promise<void> {
    const call = this.calls.get(cmd.channelId)
    if (!call) return

    console.log(`[handler] Queuing channel=${cmd.channelId}`)

    // Register this channel as the queue for its callSid
    this.queues.set(cmd.channelId, cmd.channelId)

    // Start music on hold
    try {
      await this.ari.startMoh(cmd.channelId, cmd.musicOnHold ?? 'default')
    } catch (err) {
      console.warn(`[handler] Failed to start MOH:`, err)
    }

    // Set up periodic wait callback
    const queueStartTime = Date.now()

    call.queue = {
      startedAt: queueStartTime,
      exitCallbackPath: cmd.exitCallbackPath,
      callbackParams: cmd.callbackParams,
    }

    if (cmd.waitCallbackPath) {
      call.queue.waitTimer = setInterval(async () => {
        const queueTime = Math.floor((Date.now() - queueStartTime) / 1000)

        const payload: WebhookPayload = {
          event: 'wait-music',
          CallSid: cmd.channelId,
          From: call.callerNumber,
          To: this.hotlineNumber,
          QueueTime: String(queueTime),
        }

        try {
          const response = await this.webhook.sendWebhook(
            cmd.waitCallbackPath!,
            payload,
            cmd.callbackParams,
          )

          if (response.ok) {
            const twiml = await response.text()
            const commands = this.webhook.parseTwimlToCommands(twiml, cmd.channelId)

            // Check for Leave command (means leave queue → voicemail)
            const leaveCmd = commands.find(c => c.action === 'redirect' && 'path' in c && c.path === '__leave_queue__')
            if (leaveCmd) {
              // Clear queue
              this.cleanupCallQueue(cmd.channelId)
              // Send queue-exit webhook with 'leave' result
              await this.sendQueueExit(cmd.channelId, call, 'leave')
            }
          }
        } catch (err) {
          console.error(`[handler] Wait callback failed:`, err)
        }
      }, (cmd.waitCallbackInterval ?? 10) * 1000) as unknown as ReturnType<typeof setTimeout>
    }
  }

  /** Reject a call */
  private async execReject(cmd: BridgeCommand & { action: 'reject' }): Promise<void> {
    console.log(`[handler] Rejecting channel=${cmd.channelId}`)
    await this.ari.hangupChannel(cmd.channelId, 'busy')
  }

  /** Redirect — send a new webhook to the Worker */
  private async execRedirect(cmd: BridgeCommand & { action: 'redirect' }): Promise<void> {
    if (cmd.path === '__leave_queue__') {
      // Handled by queue logic
      return
    }

    console.log(`[handler] Redirect channel=${cmd.channelId} to ${cmd.path}`)

    const call = this.calls.get(cmd.channelId)
    const payload: WebhookPayload = {
      event: 'incoming', // Generic event for redirects
      CallSid: cmd.channelId,
      From: call?.callerNumber ?? 'unknown',
      To: this.hotlineNumber,
    }

    const response = await this.webhook.sendWebhook(cmd.path, payload, cmd.params)
    if (response.ok) {
      const twiml = await response.text()
      const commands = this.webhook.parseTwimlToCommands(twiml, cmd.channelId)
      await this.executeCommands(commands)
    }
  }

  // ================================================================
  // HTTP Command Handler (for commands received from CF Worker)
  // ================================================================

  /**
   * Handle an HTTP command from the CF Worker.
   * The Worker can send direct commands to control calls.
   */
  async handleHttpCommand(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    try {
      const action = body.action as string
      if (!action) return { ok: false, error: 'Missing action' }

      switch (action) {
        case 'hangup': {
          const channelId = body.channelId as string
          if (!channelId) return { ok: false, error: 'Missing channelId' }
          await this.ari.hangupChannel(channelId)
          return { ok: true }
        }

        case 'ring': {
          const cmd = body as unknown as BridgeCommand & { action: 'ring' }
          await this.execRing(cmd)
          return { ok: true }
        }

        case 'cancelRinging': {
          const channelIds = body.channelIds as string[]
          const exceptId = body.exceptId as string | undefined
          if (!channelIds) return { ok: false, error: 'Missing channelIds' }
          for (const id of channelIds) {
            if (id !== exceptId) {
              try {
                await this.ari.hangupChannel(id)
              } catch { /* may already be gone */ }
            }
          }
          return { ok: true }
        }

        case 'getRecordingAudio': {
          // This is handled separately — see index.ts route
          return { ok: false, error: 'Use GET /recordings/:name endpoint' }
        }

        case 'status': {
          return {
            ok: true,
            ...this.getStatus(),
          } as { ok: boolean }
        }

        default:
          return { ok: false, error: `Unknown action: ${action}` }
      }
    } catch (err) {
      console.error('[handler] HTTP command failed:', err)
      return { ok: false, error: String(err) }
    }
  }

  /** Get bridge status for monitoring */
  getStatus(): Record<string, unknown> {
    return {
      activeCalls: this.calls.size,
      activeQueues: this.queues.size,
      activeBridges: this.bridges.size,
      ringingChannels: this.ringingMap.size,
      pendingRecordings: this.recordingCallbacks.size,
    }
  }

  // ================================================================
  // Helper Methods
  // ================================================================

  /** Send gathered DTMF digits to the Worker */
  private async sendGatherResult(
    channelId: string,
    call: ActiveCall,
    digits: string,
    callbackPath: string,
    callbackParams?: Record<string, string>,
  ): Promise<void> {
    const payload: WebhookPayload = {
      event: 'language-selected', // Gather results use same format
      CallSid: channelId,
      From: call.callerNumber,
      To: this.hotlineNumber,
      Digits: digits,
    }

    const response = await this.webhook.sendWebhook(callbackPath, payload, callbackParams)
    if (response.ok) {
      const twiml = await response.text()
      const commands = this.webhook.parseTwimlToCommands(twiml, channelId)
      await this.executeCommands(commands)
    }
  }

  /** Send queue-exit webhook */
  private async sendQueueExit(
    channelId: string,
    call: ActiveCall,
    result: 'leave' | 'queue-full' | 'error' | 'bridged' | 'hangup',
  ): Promise<void> {
    const exitPath = call.queue?.exitCallbackPath
    if (!exitPath) return

    const payload: WebhookPayload = {
      event: 'queue-exit',
      CallSid: channelId,
      From: call.callerNumber,
      To: this.hotlineNumber,
      QueueResult: result,
    }

    const response = await this.webhook.sendWebhook(exitPath, payload, call.queue?.callbackParams)
    if (response.ok) {
      const twiml = await response.text()
      const commands = this.webhook.parseTwimlToCommands(twiml, channelId)
      await this.executeCommands(commands)
    }
  }

  /** Clean up queue state for a call (used by queue leave logic) */
  private cleanupCallQueue(channelId: string): void {
    const call = this.calls.get(channelId)
    if (call?.queue?.waitTimer) {
      clearInterval(call.queue.waitTimer)
      call.queue = undefined
    }
    this.queues.delete(channelId)
  }

  /** Clean up bridge state for a call */
  private cleanupBridge(channelId: string): void {
    for (const [bridgeId, state] of this.bridges) {
      if (state.callerChannelId === channelId || state.volunteerChannelId === channelId) {
        // Hang up the other leg and destroy the bridge
        const otherChannel = state.callerChannelId === channelId
          ? state.volunteerChannelId
          : state.callerChannelId

        this.ari.hangupChannel(otherChannel).catch(() => {})
        this.ari.destroyBridge(bridgeId).catch(() => {})
        this.bridges.delete(bridgeId)
        break
      }
    }
  }

  /** Cancel all ringing channels for a call */
  private cancelRingingForCall(channelId: string): void {
    const call = this.calls.get(channelId)
    if (!call) return

    for (const ringId of call.ringingChannels) {
      this.ari.hangupChannel(ringId).catch(() => {})
      this.ringingMap.delete(ringId)
    }
    call.ringingChannels = []
  }
}
