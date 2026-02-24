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
  // 1. Zero out the cryptographic key
  try {
    keyManager.wipeKey()
  } catch {
    // Key may already be wiped or locked — continue
  }

  // 2. Clear all browser storage
  try {
    localStorage.clear()
  } catch {
    // Storage may be unavailable
  }
  try {
    sessionStorage.clear()
  } catch {
    // Storage may be unavailable
  }

  // 3. Clear IndexedDB databases
  try {
    if (typeof indexedDB !== 'undefined') {
      indexedDB.databases?.().then(dbs => {
        dbs.forEach(db => {
          if (db.name) indexedDB.deleteDatabase(db.name)
        })
      }).catch(() => {})
    }
  } catch {
    // IndexedDB may be unavailable
  }

  // 4. Unregister service workers
  try {
    navigator.serviceWorker?.getRegistrations().then(registrations => {
      registrations.forEach(reg => reg.unregister())
    }).catch(() => {})
  } catch {
    // SW API may be unavailable
  }

  // 5. Fire the UI flash callback
  panicWipeCallback?.()

  // 6. Redirect after brief flash
  setTimeout(() => {
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
