/**
 * Panic Wipe — triple-Escape detector and emergency key destruction.
 *
 * For device seizure scenarios: user taps Escape 3 times within 1 second,
 * all cryptographic material is zeroed, storage is cleared, and the app
 * redirects to the login page. No confirmation dialog is shown.
 */

import * as keyManager from './key-manager'

const REQUIRED_TAPS = 3
const WINDOW_MS = 1000
const FLASH_DURATION_MS = 200

let escapeTimes: number[] = []
let panicWipeCallback: (() => void) | null = null

/**
 * Execute the panic wipe: zero keys, clear all storage, redirect.
 */
export function performPanicWipe(): void {
  // 1. Fire the UI flash callback FIRST so the overlay renders
  //    before storage clearing triggers React auth redirect
  panicWipeCallback?.()

  // 2. Zero out the cryptographic key in memory immediately
  try {
    keyManager.wipeKey()
  } catch {
    // Key may already be wiped or locked — continue
  }

  // 3. Clear all storage synchronously — must happen before React auth
  //    callbacks trigger a router redirect to /login
  try { localStorage.clear() } catch { /* Storage may be unavailable */ }
  try { sessionStorage.clear() } catch { /* Storage may be unavailable */ }

  // Clear IndexedDB databases (async, fire-and-forget)
  try {
    if (typeof indexedDB !== 'undefined') {
      indexedDB.databases?.().then(dbs => {
        dbs.forEach(db => {
          if (db.name) indexedDB.deleteDatabase(db.name)
        })
      }).catch(() => {})
    }
  } catch { /* IndexedDB may be unavailable */ }

  // 4. Defer redirect — gives React one frame to paint the overlay
  setTimeout(async () => {
    // Clear Tauri Store (async cleanup)
    try {
      const { Store } = await import('@tauri-apps/plugin-store')
      for (const name of ['keys.json', 'settings.json', 'drafts.json']) {
        try {
          const store = await Store.load(name)
          await store.clear()
          await store.save()
        } catch { /* Store may not exist */ }
      }
    } catch { /* Tauri Store may be unavailable */ }

    // Full-page redirect (destroys all React state)
    window.location.href = '/login'
  }, FLASH_DURATION_MS)
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') {
    escapeTimes = []
    return
  }

  const now = Date.now()
  escapeTimes.push(now)

  // Remove taps outside the window
  escapeTimes = escapeTimes.filter(t => now - t <= WINDOW_MS)

  if (escapeTimes.length >= REQUIRED_TAPS) {
    escapeTimes = []
    performPanicWipe()
  }
}

/**
 * Initialize the panic wipe keyboard listener.
 * Call once at app startup (root layout).
 */
export function initPanicWipe(onWipe?: () => void): () => void {
  panicWipeCallback = onWipe ?? null
  document.addEventListener('keydown', handleKeyDown)

  return () => {
    document.removeEventListener('keydown', handleKeyDown)
    panicWipeCallback = null
  }
}
