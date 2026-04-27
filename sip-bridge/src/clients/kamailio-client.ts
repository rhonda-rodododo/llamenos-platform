import type {
  BridgeClient,
  BridgeEvent,
  BridgeHealthStatus,
  BridgeOptions,
  OriginateParams,
} from '../bridge-client'

export interface KamailioConfig {
  /** JSONRPC endpoint URL, e.g. http://kamailio:5060/jsonrpc */
  jsonrpcUrl: string
  /** Dispatcher set ID for dispatcher.list/set_state calls. Default: 1 */
  dispatcherSetId?: number
}

export interface DispatcherEntry {
  uri: string
  flags: string
  priority: number
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: string
  id: number
  result?: T
  error?: { code: number; message: string }
}

type EventHandler = (event: BridgeEvent) => void

/**
 * Kamailio JSONRPC Client — management-only BridgeClient adapter.
 *
 * Kamailio is a SIP proxy, NOT a PBX. All call-control methods throw.
 * Implements BridgeClient for uniform lifecycle management.
 */
export class KamailioClient implements BridgeClient {
  private readonly config: KamailioConfig
  private readonly dispatcherSetId: number
  private rpcId = 0

  constructor(config: KamailioConfig) {
    this.config = config
    this.dispatcherSetId = config.dispatcherSetId ?? 1
  }

  async connect(): Promise<void> {
    const health = await this.healthCheck()
    if (!health.ok) {
      throw new Error(
        `[kamailio] Cannot connect: JSONRPC endpoint not reachable at ${this.config.jsonrpcUrl}`
      )
    }
    console.log('[kamailio] JSONRPC endpoint reachable — connection verified')
  }

  disconnect(): void {
    // HTTP is stateless
  }

  isConnected(): boolean {
    return true
  }

  onEvent(_handler: EventHandler): void {
    // Kamailio does not push call events
  }

  offEvent(_handler: EventHandler): void {
    // No-op
  }

  // ---- System ----

  async healthCheck(): Promise<BridgeHealthStatus> {
    const start = Date.now()
    try {
      const result = await this.jsonrpc<{ version: string }>('core.version')
      return {
        ok: true,
        latencyMs: Date.now() - start,
        details: { version: result.version, endpoint: this.config.jsonrpcUrl },
      }
    } catch {
      return { ok: false, latencyMs: Date.now() - start }
    }
  }

  // ---- Call Control — not supported ----

  async originate(_params: OriginateParams): Promise<{ id: string }> {
    throw new Error('Kamailio is a SIP proxy — call control is not supported. Use the PBX client.')
  }

  async hangup(_channelId: string): Promise<void> {
    throw new Error('Kamailio is a SIP proxy — call control is not supported. Use the PBX client.')
  }

  async answer(_channelId: string): Promise<void> {
    throw new Error('Kamailio is a SIP proxy — call control is not supported. Use the PBX client.')
  }

  async bridge(_c1: string, _c2: string, _options?: BridgeOptions): Promise<string> {
    throw new Error('Kamailio is a SIP proxy — call control is not supported. Use the PBX client.')
  }

  async destroyBridge(_bridgeId: string): Promise<void> {
    throw new Error('Kamailio is a SIP proxy — call control is not supported. Use the PBX client.')
  }

  async playMedia(_c: string, _m: string, _p?: string): Promise<string> {
    throw new Error('Kamailio is a SIP proxy — media control is not supported. Use the PBX client.')
  }

  async stopPlayback(_p: string): Promise<void> {
    throw new Error('Kamailio is a SIP proxy — media control is not supported. Use the PBX client.')
  }

  async startMoh(_c: string, _m?: string): Promise<void> {
    throw new Error('Kamailio is a SIP proxy — media control is not supported. Use the PBX client.')
  }

  async stopMoh(_c: string): Promise<void> {
    throw new Error('Kamailio is a SIP proxy — media control is not supported. Use the PBX client.')
  }

  async recordChannel(_c: string, _p: { name: string }): Promise<void> {
    throw new Error('Kamailio is a SIP proxy — recording is not supported. Use the PBX client.')
  }

  async recordBridge(_b: string, _p: { name: string }): Promise<void> {
    throw new Error('Kamailio is a SIP proxy — recording is not supported. Use the PBX client.')
  }

  async stopRecording(_n: string): Promise<void> {
    throw new Error('Kamailio is a SIP proxy — recording is not supported. Use the PBX client.')
  }

  async getRecordingFile(_n: string): Promise<ArrayBuffer | null> {
    throw new Error('Kamailio is a SIP proxy — recording is not supported. Use the PBX client.')
  }

  async deleteRecording(_n: string): Promise<void> {
    throw new Error('Kamailio is a SIP proxy — recording is not supported. Use the PBX client.')
  }

  async setChannelVar(_c: string, _v: string, _val: string): Promise<void> {
    throw new Error('Kamailio is a SIP proxy — channel variables are not supported.')
  }

  async getChannelVar(_c: string, _v: string): Promise<string> {
    throw new Error('Kamailio is a SIP proxy — channel variables are not supported.')
  }

  async listChannels(): Promise<Array<{ id: string; state: string; caller: string }>> {
    throw new Error('Kamailio is a SIP proxy — channel listing is not supported.')
  }

  async listBridges(): Promise<Array<{ id: string; channels: string[] }>> {
    throw new Error('Kamailio is a SIP proxy — bridge listing is not supported.')
  }

  // ---- Kamailio-specific management ----

  async getDispatchers(): Promise<DispatcherEntry[]> {
    const result = await this.jsonrpc<{
      RECORDS?: Array<{
        SET: {
          ID: number
          TARGETS: Array<{ DEST: { URI: string; FLAGS: string; PRIORITY: number } }>
        }
      }>
    }>('dispatcher.list')

    const entries: DispatcherEntry[] = []
    for (const record of result.RECORDS ?? []) {
      if (record.SET.ID !== this.dispatcherSetId) continue
      for (const target of record.SET.TARGETS ?? []) {
        entries.push({
          uri: target.DEST.URI,
          flags: target.DEST.FLAGS,
          priority: target.DEST.PRIORITY,
        })
      }
    }
    return entries
  }

  async setDispatcherState(uri: string, state: 'active' | 'inactive'): Promise<void> {
    const stateCode = state === 'active' ? 0 : 1
    await this.jsonrpc('dispatcher.set_state', [stateCode, this.dispatcherSetId, uri])
  }

  async reloadDispatchers(): Promise<void> {
    await this.jsonrpc('dispatcher.reload')
  }

  // ---- Private helpers ----

  private async jsonrpc<T = unknown>(method: string, params?: unknown[]): Promise<T> {
    const id = ++this.rpcId
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params: params ?? [],
      id,
    })

    const response = await globalThis.fetch(this.config.jsonrpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      throw new Error(
        `[kamailio] JSONRPC HTTP ${response.status} for "${method}": ${response.statusText}`
      )
    }

    const data = (await response.json()) as JsonRpcResponse<T>
    if (data.error) {
      throw new Error(
        `[kamailio] JSONRPC error for "${method}": [${data.error.code}] ${data.error.message}`
      )
    }
    return data.result as T
  }
}
