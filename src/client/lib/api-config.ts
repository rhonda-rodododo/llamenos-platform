const useTauri = typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || !!import.meta.env.PLAYWRIGHT_TEST)

const STORE_KEY = 'llamenos-api-config'
const API_BASE_KEY = 'apiBaseUrl'

const DEFAULT_API_BASE = '/api'

let cachedApiBase: string = DEFAULT_API_BASE
let initialized = false

async function getStore() {
  if (useTauri) {
    const { Store } = await import('@tauri-apps/plugin-store')
    return Store.load(`${STORE_KEY}.json`)
  }
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = localStorage.getItem(`llamenos:${key}`)
      if (raw === null) return null
      return JSON.parse(raw) as T
    },
    async set(key: string, value: unknown): Promise<void> {
      localStorage.setItem(`llamenos:${key}`, JSON.stringify(value))
    },
    async delete(key: string): Promise<void> {
      localStorage.removeItem(`llamenos:${key}`)
    },
    async save(): Promise<void> {
      // No-op — localStorage persists automatically
    },
  }
}

export async function initApiBase(): Promise<void> {
  if (initialized) return
  if (!useTauri) {
    cachedApiBase = DEFAULT_API_BASE
    initialized = true
    return
  }
  try {
    const store = await getStore()
    const stored = await store.get<string>(API_BASE_KEY)
    cachedApiBase = stored || DEFAULT_API_BASE
  } catch {
    cachedApiBase = DEFAULT_API_BASE
  }
  initialized = true
}

export function getApiBase(): string {
  return cachedApiBase
}

export async function setApiBase(url: string): Promise<void> {
  const normalized = url.trim() || DEFAULT_API_BASE
  cachedApiBase = normalized
  if (useTauri) {
    const store = await getStore()
    await store.set(API_BASE_KEY, normalized)
    await store.save()
  }
}

export async function resetApiBase(): Promise<void> {
  cachedApiBase = DEFAULT_API_BASE
  if (useTauri) {
    const store = await getStore()
    await store.delete(API_BASE_KEY)
    await store.save()
  }
}

export function getApiUrl(path: string): string {
  const base = cachedApiBase
  if (base.startsWith('http')) {
    return `${base}${path}`
  }
  return `${base}${path}`
}
