/**
 * DurableObject shim for Node.js — provides the same base class API
 * as cloudflare:workers DurableObject, backed by PostgreSQL.
 */
import type { StorageApi, DOContext } from '../types'
import { PostgresStorage } from './storage/postgres-storage'

/** All storage instances, keyed by namespace — used by alarm poller */
export const storageInstances = new Map<string, PostgresStorage>()

/**
 * WebSocket manager — provides tag-based WebSocket tracking
 * equivalent to CF's Hibernatable WebSocket API.
 */
class WebSocketManager {
  private tagToSockets = new Map<string, Set<WebSocket>>()
  private socketToTags = new WeakMap<WebSocket, string[]>()
  private allSockets = new Set<WebSocket>()

  acceptWebSocket(ws: WebSocket, tags: string[]): void {
    this.allSockets.add(ws)
    this.socketToTags.set(ws, tags)
    for (const tag of tags) {
      let set = this.tagToSockets.get(tag)
      if (!set) {
        set = new Set()
        this.tagToSockets.set(tag, set)
      }
      set.add(ws)
    }
  }

  getWebSockets(tag?: string): WebSocket[] {
    if (tag) {
      return Array.from(this.tagToSockets.get(tag) || [])
    }
    return Array.from(this.allSockets)
  }

  getTags(ws: WebSocket): string[] {
    return this.socketToTags.get(ws) || []
  }

  removeWebSocket(ws: WebSocket): void {
    this.allSockets.delete(ws)
    const tags = this.socketToTags.get(ws) || []
    for (const tag of tags) {
      const set = this.tagToSockets.get(tag)
      if (set) {
        set.delete(ws)
        if (set.size === 0) this.tagToSockets.delete(tag)
      }
    }
  }
}

/**
 * DurableObject base class for Node.js.
 * Provides ctx.storage (PostgreSQL) and ctx.acceptWebSocket/getWebSockets/getTags.
 */
export class DurableObject<Env = unknown> {
  ctx: DOContext
  env: Env

  private _storage: PostgresStorage
  private _wsManager: WebSocketManager

  constructor(ctx: DOContext, env: Env) {
    this.ctx = ctx
    this.env = env
    this._storage = (ctx as any)._storage
    this._wsManager = (ctx as any)._wsManager

    // Wire alarm callback to the instance's alarm() method
    if (this._storage) {
      this._storage.setAlarmCallback(() => this.alarm())
    }
  }

  /** Override in subclass to handle alarms */
  async alarm(): Promise<void> {
    // Default no-op
  }

  /** Override in subclass to handle incoming WebSocket messages */
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Default no-op
  }

  /** Override in subclass to handle WebSocket close */
  async webSocketClose(_ws: WebSocket): Promise<void> {
    // Default no-op
  }

  /** Override in subclass to handle WebSocket errors */
  async webSocketError(_ws: WebSocket): Promise<void> {
    // Default no-op
  }

  /** Must be implemented by subclass */
  async fetch(_request: Request): Promise<Response> {
    return new Response('Not implemented', { status: 501 })
  }
}

/**
 * Sanitize a string for use in a namespace — strip non-alphanumeric characters.
 */
function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * Create a DurableObject context for a given class name and instance ID.
 */
export function createDOContext(className: string, instanceId: string): DOContext & { _storage: PostgresStorage; _wsManager: WebSocketManager } {
  const safeClass = sanitize(className)
  const safeId = sanitize(instanceId)
  if (!safeClass || !safeId) {
    throw new Error(`Invalid DO class/instance: ${className}/${instanceId}`)
  }
  const namespace = `${safeClass}-${safeId}`
  const storage = new PostgresStorage(namespace)
  storageInstances.set(namespace, storage)
  const wsManager = new WebSocketManager()

  return {
    _storage: storage,
    _wsManager: wsManager,
    storage,
    acceptWebSocket: (ws: WebSocket, tags: string[]) => wsManager.acceptWebSocket(ws, tags),
    getWebSockets: (tag?: string) => wsManager.getWebSockets(tag),
    getTags: (ws: WebSocket) => wsManager.getTags(ws),
  }
}

/**
 * Create a DurableObject stub that routes .fetch() to a local instance.
 */
export function createDOStub(instance: DurableObject): { fetch(req: Request): Promise<Response> } {
  return {
    fetch: (req: Request) => instance.fetch(req),
  }
}

/**
 * Simulates DurableObjectNamespace for the Node.js shim.
 * Provides idFromName() and get() to match the CF API surface.
 */
export function createDONamespace<T extends DurableObject>(
  DOClass: new (ctx: DOContext, env: unknown) => T,
  className: string,
  env: unknown,
): { idFromName(name: string): { toString(): string }; get(id: { toString(): string }): { fetch(req: Request): Promise<Response> } } {
  const instances = new Map<string, T>()

  return {
    idFromName(name: string) {
      return { toString: () => name }
    },
    get(id: { toString(): string }) {
      const instanceId = id.toString()
      let instance = instances.get(instanceId)
      if (!instance) {
        const ctx = createDOContext(className, instanceId)
        instance = new DOClass(ctx, env)
        instances.set(instanceId, instance)
      }
      return createDOStub(instance)
    },
  }
}
