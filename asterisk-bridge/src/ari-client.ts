import type {
  AnyAriEvent,
  AriChannel,
  AriBridge,
  AriRecording,
  AriPlayback,
  BridgeConfig,
} from './types'

type EventHandler = (event: AnyAriEvent) => void

/**
 * ARI Client — connects to Asterisk's ARI via WebSocket for events
 * and REST API for commands. No external dependencies; uses built-in
 * WebSocket and fetch.
 */
export class AriClient {
  private config: BridgeConfig
  private ws: WebSocket | null = null
  private eventHandlers = new Set<EventHandler>()
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private shouldReconnect = true
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private authHeader: string

  constructor(config: BridgeConfig) {
    this.config = config
    this.authHeader = 'Basic ' + btoa(`${config.ariUsername}:${config.ariPassword}`)
  }

  /** Register an event handler for all ARI events */
  onEvent(handler: EventHandler): void {
    this.eventHandlers.add(handler)
  }

  /** Unregister an event handler */
  offEvent(handler: EventHandler): void {
    this.eventHandlers.delete(handler)
  }

  /** Connect to the ARI WebSocket */
  async connect(): Promise<void> {
    this.shouldReconnect = true
    await this.doConnect()
  }

  /** Disconnect from ARI */
  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private async doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Close the old WebSocket before creating a new one — this removes
      // all listeners attached to it, preventing listener accumulation
      // across reconnects.
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }

      const wsUrl = `${this.config.ariUrl}?app=${this.config.stasisApp}&api_key=${this.config.ariUsername}:${this.config.ariPassword}`

      console.log(`[ari] Connecting to ${this.config.ariUrl}...`)

      const ws = new WebSocket(wsUrl)

      ws.addEventListener('open', () => {
        console.log('[ari] WebSocket connected')
        this.reconnectDelay = 1000
        this.ws = ws
        resolve()
      })

      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer)) as AnyAriEvent
          // Snapshot-before-fanout: copy Set before iterating to prevent
          // order-dependent issues if a handler adds/removes handlers.
          const snapshot = [...this.eventHandlers]
          for (const handler of snapshot) {
            try {
              handler(data)
            } catch (err) {
              console.error('[ari] Event handler error:', err)
            }
          }
        } catch (err) {
          console.error('[ari] Failed to parse event:', err)
        }
      })

      ws.addEventListener('close', (event) => {
        console.log(`[ari] WebSocket closed: code=${event.code} reason=${event.reason}`)
        this.ws = null
        if (this.shouldReconnect) {
          this.scheduleReconnect()
        }
      })

      ws.addEventListener('error', (event) => {
        console.error('[ari] WebSocket error:', event)
        if (!this.ws) {
          reject(new Error('Failed to connect to ARI WebSocket'))
        }
      })
    })
  }

  private scheduleReconnect(): void {
    console.log(`[ari] Reconnecting in ${this.reconnectDelay}ms...`)
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        await this.doConnect()
      } catch (err) {
        console.error('[ari] Reconnection failed:', err)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
        if (this.shouldReconnect) {
          this.scheduleReconnect()
        }
      }
    }, this.reconnectDelay)
  }

  // ---- ARI REST API Methods ----

  /** Make an authenticated REST request to ARI */
  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.ariRestUrl}${path}`
    const headers: Record<string, string> = {
      'Authorization': this.authHeader,
    }

    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(30_000) }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }

    const res = await fetch(url, init)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`ARI ${method} ${path} failed: ${res.status} ${text}`)
    }

    // Some ARI endpoints return 204 No Content
    if (res.status === 204) return undefined as T

    return res.json() as T
  }

  // ---- Channel Operations ----

  /** Answer a channel */
  async answerChannel(channelId: string): Promise<void> {
    await this.request('POST', `/channels/${channelId}/answer`)
  }

  /** Hang up a channel */
  async hangupChannel(channelId: string, reason = 'normal'): Promise<void> {
    try {
      await this.request('DELETE', `/channels/${channelId}?reason=${reason}`)
    } catch (err) {
      // Channel may already be gone
      console.warn(`[ari] Failed to hangup channel ${channelId}:`, err)
    }
  }

  /** Get channel info */
  async getChannel(channelId: string): Promise<AriChannel> {
    return this.request<AriChannel>('GET', `/channels/${channelId}`)
  }

  /** Originate a new outbound call */
  async originate(params: {
    endpoint: string
    callerId?: string
    timeout?: number
    app: string
    appArgs?: string
    channelId?: string
  }): Promise<AriChannel> {
    const body: Record<string, unknown> = {
      endpoint: params.endpoint,
      app: params.app,
      timeout: params.timeout ?? 30,
    }
    if (params.callerId) body.callerId = params.callerId
    if (params.appArgs) body.appArgs = params.appArgs
    if (params.channelId) body.channelId = params.channelId

    return this.request<AriChannel>('POST', '/channels', body)
  }

  /** Place a channel on hold (start music on hold) */
  async startMoh(channelId: string, mohClass = 'default'): Promise<void> {
    await this.request('POST', `/channels/${channelId}/moh?mohClass=${mohClass}`)
  }

  /** Stop music on hold */
  async stopMoh(channelId: string): Promise<void> {
    await this.request('DELETE', `/channels/${channelId}/moh`)
  }

  /** Start ringing indication on a channel */
  async startRinging(channelId: string): Promise<void> {
    await this.request('POST', `/channels/${channelId}/ring`)
  }

  /** Stop ringing indication on a channel */
  async stopRinging(channelId: string): Promise<void> {
    await this.request('DELETE', `/channels/${channelId}/ring`)
  }

  /** Set a channel variable */
  async setChannelVar(channelId: string, variable: string, value: string): Promise<void> {
    await this.request('POST', `/channels/${channelId}/variable?variable=${variable}&value=${encodeURIComponent(value)}`)
  }

  /** Get a channel variable */
  async getChannelVar(channelId: string, variable: string): Promise<string> {
    const res = await this.request<{ value: string }>('GET', `/channels/${channelId}/variable?variable=${variable}`)
    return res.value
  }

  // ---- Playback Operations ----

  /** Play media on a channel */
  async playMedia(channelId: string, media: string, playbackId?: string): Promise<AriPlayback> {
    const params = new URLSearchParams({ media })
    if (playbackId) params.set('playbackId', playbackId)
    return this.request<AriPlayback>('POST', `/channels/${channelId}/play?${params}`)
  }

  /** Stop a playback */
  async stopPlayback(playbackId: string): Promise<void> {
    try {
      await this.request('DELETE', `/playbacks/${playbackId}`)
    } catch {
      // Playback may already be done
    }
  }

  // ---- Bridge Operations ----

  /** Create a mixing bridge */
  async createBridge(params?: { bridgeId?: string; type?: string; name?: string }): Promise<AriBridge> {
    const body: Record<string, unknown> = {
      type: params?.type ?? 'mixing',
    }
    if (params?.bridgeId) body.bridgeId = params.bridgeId
    if (params?.name) body.name = params.name
    return this.request<AriBridge>('POST', '/bridges', body)
  }

  /** Add a channel to a bridge */
  async addChannelToBridge(bridgeId: string, channelId: string): Promise<void> {
    await this.request('POST', `/bridges/${bridgeId}/addChannel?channel=${channelId}`)
  }

  /** Remove a channel from a bridge */
  async removeChannelFromBridge(bridgeId: string, channelId: string): Promise<void> {
    try {
      await this.request('POST', `/bridges/${bridgeId}/removeChannel?channel=${channelId}`)
    } catch {
      // Channel may already be gone
    }
  }

  /** Destroy a bridge */
  async destroyBridge(bridgeId: string): Promise<void> {
    try {
      await this.request('DELETE', `/bridges/${bridgeId}`)
    } catch {
      // Bridge may already be gone
    }
  }

  /** Start music on hold in a bridge */
  async startBridgeMoh(bridgeId: string, mohClass = 'default'): Promise<void> {
    await this.request('POST', `/bridges/${bridgeId}/moh?mohClass=${mohClass}`)
  }

  /** Play media on a bridge */
  async playMediaOnBridge(bridgeId: string, media: string): Promise<AriPlayback> {
    return this.request<AriPlayback>('POST', `/bridges/${bridgeId}/play?media=${media}`)
  }

  // ---- Recording Operations ----

  /** Start recording a channel */
  async recordChannel(channelId: string, params: {
    name: string
    format?: string
    maxDurationSeconds?: number
    beep?: boolean
    terminateOn?: string
  }): Promise<AriRecording> {
    const body: Record<string, unknown> = {
      name: params.name,
      format: params.format ?? 'wav',
      maxDurationSeconds: params.maxDurationSeconds ?? 0,
      beep: params.beep ?? false,
      terminateOn: params.terminateOn ?? 'none',
    }
    return this.request<AriRecording>('POST', `/channels/${channelId}/record`, body)
  }

  /** Stop a recording */
  async stopRecording(recordingName: string): Promise<void> {
    try {
      await this.request('POST', `/recordings/live/${recordingName}/stop`)
    } catch {
      // Recording may already be done
    }
  }

  /** Get a stored recording */
  async getRecording(recordingName: string): Promise<AriRecording> {
    return this.request<AriRecording>('GET', `/recordings/stored/${recordingName}`)
  }

  /** Get the audio file of a stored recording (returns raw bytes) */
  async getRecordingFile(recordingName: string): Promise<ArrayBuffer | null> {
    const url = `${this.config.ariRestUrl}/recordings/stored/${recordingName}/file`
    const res = await fetch(url, {
      headers: { 'Authorization': this.authHeader },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    return res.arrayBuffer()
  }

  /** Delete a stored recording */
  async deleteRecording(recordingName: string): Promise<void> {
    try {
      await this.request('DELETE', `/recordings/stored/${recordingName}`)
    } catch {
      // Recording may already be deleted
    }
  }

  // ---- Bridge Recording Operations ----

  /** Start recording a bridge */
  async recordBridge(bridgeId: string, params: {
    name: string
    format?: string
    maxDurationSeconds?: number
    beep?: boolean
  }): Promise<AriRecording> {
    const body: Record<string, unknown> = {
      name: params.name,
      format: params.format ?? 'wav',
      maxDurationSeconds: params.maxDurationSeconds ?? 0,
      beep: params.beep ?? false,
      terminateOn: 'none',
    }
    return this.request<AriRecording>('POST', `/bridges/${bridgeId}/record`, body)
  }

  // ---- Asterisk Operations ----

  /** Get Asterisk system info (useful for health checks) */
  async getAsteriskInfo(): Promise<unknown> {
    return this.request('GET', '/asterisk/info')
  }

  /** List active channels */
  async listChannels(): Promise<AriChannel[]> {
    return this.request<AriChannel[]>('GET', '/channels')
  }

  /** List active bridges */
  async listBridges(): Promise<AriBridge[]> {
    return this.request<AriBridge[]>('GET', '/bridges')
  }
}
