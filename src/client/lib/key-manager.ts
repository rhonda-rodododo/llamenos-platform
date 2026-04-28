/**
 * Singleton Key Manager — manages crypto lock/unlock state.
 *
 * **Tauri-only**: The nsec lives exclusively in Rust CryptoState.
 * This module tracks unlock state and cached public key for the UI.
 * It never holds or touches the secret key.
 *
 * States:
 *   Locked:   unlocked === false — only session-token auth available
 *   Unlocked: unlocked === true — CryptoState has nsec, full crypto available
 */

import {
  decryptWithPin,
  lockCrypto,
  encryptWithPin,
  clearStoredKey as platformClearStoredKey,
  pubkeyFromNsec,
  hasStoredKey as platformHasStoredKey,
  getDevicePubkeys,
} from './platform'

// --- Private state (closure-scoped, never exported) ---
let unlocked = false
let publicKey: string | null = null
let encryptionPubkey: string | null = null

// --- Auto-lock ---
let idleTimer: ReturnType<typeof setTimeout> | null = null
let lockCallbacks: Set<() => void> = new Set()
let unlockCallbacks: Set<() => void> = new Set()
const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
let autoLockDisabled = false

function resetIdleTimer() {
  if (autoLockDisabled) return
  if (idleTimer) clearTimeout(idleTimer)
  if (unlocked) {
    idleTimer = setTimeout(() => lock(), IDLE_TIMEOUT_MS)
  }
}

// Lock on tab hide — with configurable grace period so users can switch windows to copy/paste
let visibilityTimer: ReturnType<typeof setTimeout> | null = null
const LOCK_DELAY_KEY = 'llamenos-lock-delay'
const DEFAULT_LOCK_DELAY_MS = 30_000 // 30 seconds

function getLockDelay(): number {
  try {
    const stored = localStorage.getItem(LOCK_DELAY_KEY)
    if (stored) {
      const ms = parseInt(stored, 10)
      if (ms >= 0 && ms <= 600_000) return ms // 0 = immediate, max 10 min
    }
  } catch { /* localStorage unavailable */ }
  return DEFAULT_LOCK_DELAY_MS
}

/** Set the tab-switch lock delay in milliseconds (0 = lock immediately, max 600000 = 10 min) */
export function setLockDelay(ms: number) {
  const clamped = Math.max(0, Math.min(600_000, ms))
  localStorage.setItem(LOCK_DELAY_KEY, String(clamped))
}

/** Get the current tab-switch lock delay in milliseconds */
export function getLockDelayMs(): number {
  return getLockDelay()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (autoLockDisabled) return
    if (document.hidden && unlocked) {
      const delay = getLockDelay()
      if (delay === 0) {
        lock()
      } else {
        visibilityTimer = setTimeout(() => lock(), delay)
      }
    } else if (!document.hidden && visibilityTimer) {
      // User came back within grace period — cancel the lock
      clearTimeout(visibilityTimer)
      visibilityTimer = null
    }
  })
}

// --- Public API ---

/**
 * Unlock the key store by decrypting the nsec with the user's PIN.
 * Returns the hex pubkey on success, null on wrong PIN.
 * Throws on lockout or key wipe (errors propagate from Rust-side tracking).
 *
 * The nsec is loaded into Rust CryptoState and NEVER enters the webview.
 */
export async function unlock(pin: string): Promise<string | null> {
  // decryptWithPin throws on lockout/wipe — let it propagate
  const pubkey = await decryptWithPin(pin)
  if (!pubkey) return null

  publicKey = pubkey
  // Fetch encryption pubkey from device state (v3 — separate Ed25519/X25519 keys)
  const deviceState = await getDevicePubkeys()
  encryptionPubkey = deviceState?.encryptionPubkeyHex ?? null
  unlocked = true
  resetIdleTimer()
  unlockCallbacks.forEach(cb => cb())
  return publicKey
}

/**
 * Lock the key manager — zeros nsec in Rust CryptoState.
 */
export function lock() {
  unlocked = false
  // Don't clear publicKey — it's not secret and useful for display
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  // Lock Rust CryptoState (fire-and-forget)
  lockCrypto().catch(() => {})
  lockCallbacks.forEach(cb => cb())
}

/**
 * Import a key (onboarding / recovery): encrypt and store, then load into CryptoState.
 */
export async function importKey(nsec: string, pin: string): Promise<string> {
  const pubkeyHex = await pubkeyFromNsec(nsec)
  if (!pubkeyHex) throw new Error('Invalid nsec')

  // encryptWithPin calls import_key_to_state — encrypts + loads into CryptoState
  await encryptWithPin(nsec, pin, pubkeyHex)

  publicKey = pubkeyHex
  unlocked = true
  resetIdleTimer()
  unlockCallbacks.forEach(cb => cb())
  return pubkeyHex
}

/**
 * Mark the key manager as unlocked with a known pubkey.
 * Used when CryptoState is already loaded (e.g. post-bootstrap, post-onboarding)
 * and we need to sync the key-manager's tracked state without re-decrypting.
 */
export function markUnlocked(pubkeyHex: string): void {
  publicKey = pubkeyHex
  unlocked = true
  resetIdleTimer()
  unlockCallbacks.forEach(cb => cb())
}

/**
 * Check if the key manager is currently unlocked.
 */
export function isUnlocked(): boolean {
  return unlocked
}

/**
 * Get the signing public key (hex). Available when unlocked OR if we have it cached.
 */
export function getPublicKeyHex(): string | null {
  return publicKey
}

/**
 * Get the X25519 encryption public key (hex). Available after unlock.
 */
export function getEncryptionPubkeyHex(): string | null {
  return encryptionPubkey
}

/**
 * Check if there's an encrypted key in Tauri Store.
 * Async — re-exports from platform.ts.
 */
export { hasStoredKey } from './platform'

/**
 * Register a callback for lock events.
 */
export function onLock(cb: () => void): () => void {
  lockCallbacks.add(cb)
  return () => lockCallbacks.delete(cb)
}

/**
 * Register a callback for unlock events.
 */
export function onUnlock(cb: () => void): () => void {
  unlockCallbacks.add(cb)
  return () => unlockCallbacks.delete(cb)
}

/**
 * Wipe the encrypted key from storage and lock.
 * Used when max PIN attempts exceeded.
 */
export async function wipeKey() {
  lock()
  await platformClearStoredKey()
}

/**
 * Disable auto-lock timers (idle + tab-hide).
 * Used in demo mode where frequent lock-outs ruin the experience.
 */
export function disableAutoLock() {
  autoLockDisabled = true
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  if (visibilityTimer) {
    clearTimeout(visibilityTimer)
    visibilityTimer = null
  }
}

/**
 * Error thrown when crypto operations are attempted while locked.
 */
export class KeyLockedError extends Error {
  constructor() {
    super('Key is locked. Enter PIN to unlock.')
    this.name = 'KeyLockedError'
  }
}

/** Validate a PIN format (6-8 digits, matching Rust crypto crate). */
export function isValidPin(pin: string): boolean {
  return /^\d{6,8}$/.test(pin)
}
