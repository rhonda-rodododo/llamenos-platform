/**
 * DurableObject shim for Node.js — provides the same base class API
 * as cloudflare:workers DurableObject, backed by better-sqlite3.
 *
 * Each DO instance gets a SQLite database at data/{className}.db
 * with a `kv` table for key-value storage.
 */
import Database from 'better-sqlite3'
import type { StorageApi, DOContext } from '../types'
import path from 'node:path'
import fs from 'node:fs'

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')

/**
 * SQLite-backed storage that implements our StorageApi interface.
 */
class SqliteStorage implements StorageApi {
  private db: Database.Database
  private alarmTimer: ReturnType<typeof setTimeout> | null = null
  private alarmCallback: (() => Promise<void>) | null = null

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)')
  }

  setAlarmCallback(cb: () => Promise<void>) {
    this.alarmCallback = cb
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined
    if (!row) return undefined
    return JSON.parse(row.value) as T
  }

  async put(key: string, value: unknown): Promise<void> {
    this.db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
  }

  async delete(key: string): Promise<void> {
    this.db.prepare('DELETE FROM kv WHERE key = ?').run(key)
  }

  async deleteAll(): Promise<void> {
    this.db.prepare('DELETE FROM kv').run()
    if (this.alarmTimer) {
      clearTimeout(this.alarmTimer)
      this.alarmTimer = null
    }
  }

  async list(options?: { prefix?: string }): Promise<Map<string, unknown>> {
    const result = new Map<string, unknown>()
    let rows: Array<{ key: string; value: string }>
    if (options?.prefix) {
      // Escape LIKE wildcards to prevent injection
      const escaped = options.prefix.replace(/[%_\\]/g, '\\$&')
      rows = this.db.prepare("SELECT key, value FROM kv WHERE key LIKE ? ESCAPE '\\'").all(`${escaped}%`) as Array<{ key: string; value: string }>
    } else {
      rows = this.db.prepare('SELECT key, value FROM kv').all() as Array<{ key: string; value: string }>
    }
    for (const row of rows) {
      result.set(row.key, JSON.parse(row.value))
    }
    return result
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    const ms = typeof scheduledTime === 'number' ? scheduledTime : scheduledTime.getTime()
    const delay = Math.max(0, ms - Date.now())

    // Clear existing alarm
    if (this.alarmTimer) {
      clearTimeout(this.alarmTimer)
    }

    this.alarmTimer = setTimeout(async () => {
      this.alarmTimer = null
      if (this.alarmCallback) {
        try {
          await this.alarmCallback()
        } catch (err) {
          console.error('[alarm] Error in alarm callback:', err)
        }
      }
    }, delay)
  }

  async getAlarm(): Promise<number | null> {
    // We don't persist alarm times; return null
    return null
  }

  async deleteAlarm(): Promise<void> {
    if (this.alarmTimer) {
      clearTimeout(this.alarmTimer)
      this.alarmTimer = null
    }
  }

  close() {
    if (this.alarmTimer) clearTimeout(this.alarmTimer)
    this.db.close()
  }
}

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
 * Provides ctx.storage (SQLite) and ctx.acceptWebSocket/getWebSockets/getTags.
 */
export class DurableObject<Env = unknown> {
  ctx: DOContext
  env: Env

  private _storage: SqliteStorage
  private _wsManager: WebSocketManager

  constructor(ctx: DOContext, env: Env) {
    // ctx is passed from the Node.js shim layer with storage pre-initialized
    this.ctx = ctx
    this.env = env
    this._storage = (ctx as unknown as { _storage: SqliteStorage })._storage
    this._wsManager = (ctx as unknown as { _wsManager: WebSocketManager })._wsManager

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
 * Sanitize a string for use in a filename — strip path separators and
 * non-alphanumeric characters to prevent directory traversal.
 */
function sanitizeForPath(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * Create a DurableObject context for a given class name and instance ID.
 */
export function createDOContext(className: string, instanceId: string): DOContext & { _storage: SqliteStorage; _wsManager: WebSocketManager } {
  const safeClass = sanitizeForPath(className)
  const safeId = sanitizeForPath(instanceId)
  if (!safeClass || !safeId) {
    throw new Error(`Invalid DO class/instance: ${className}/${instanceId}`)
  }
  const dbPath = path.join(DATA_DIR, `${safeClass}-${safeId}.db`)
  const storage = new SqliteStorage(dbPath)
  const wsManager = new WebSocketManager()

  const ctx: DOContext & { _storage: SqliteStorage; _wsManager: WebSocketManager } = {
    _storage: storage,
    _wsManager: wsManager,
    storage,
    acceptWebSocket: (ws: WebSocket, tags: string[]) => wsManager.acceptWebSocket(ws, tags),
    getWebSockets: (tag?: string) => wsManager.getWebSockets(tag),
    getTags: (ws: WebSocket) => wsManager.getTags(ws),
  }

  return ctx
}

/**
 * Create a DurableObject stub that routes .fetch() to a local instance.
 * This replaces CF's `env.BINDING.get(env.BINDING.idFromName(...))` pattern.
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
