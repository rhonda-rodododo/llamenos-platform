/**
 * Singleton Key Manager — holds the decrypted secret key in a closure variable.
 *
 * The secretKey is NEVER stored in sessionStorage, window, or any globally
 * accessible object. It lives only in this module's closure scope.
 *
 * States:
 *   Locked:   secretKey === null — only session-token auth available
 *   Unlocked: secretKey is a Uint8Array in memory — full crypto available
 */

import { getPublicKey, nip19 } from 'nostr-tools'
import { decryptStoredKey, storeEncryptedKey, hasStoredKey, clearStoredKey } from './key-store'
import { createAuthToken as _createAuthToken } from './crypto'

// --- Private state (closure-scoped, never exported) ---
let secretKey: Uint8Array | null = null
let publicKey: string | null = null

// --- Auto-lock ---
let idleTimer: ReturnType<typeof setTimeout> | null = null
let lockCallbacks: Set<() => void> = new Set()
let unlockCallbacks: Set<() => void> = new Set()
const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer)
  if (secretKey) {
    idleTimer = setTimeout(() => lock(), IDLE_TIMEOUT_MS)
  }
}

// Lock on tab hide
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && secretKey) {
      lock()
    }
  })
}

// --- Public API ---

/**
 * Unlock the key store by decrypting the nsec with the user's PIN.
 * Returns the hex pubkey on success, null on wrong PIN.
 */
export async function unlock(pin: string): Promise<string | null> {
  const nsec = await decryptStoredKey(pin)
  if (!nsec) return null

  try {
    const decoded = nip19.decode(nsec)
    if (decoded.type !== 'nsec') return null
    secretKey = decoded.data
    publicKey = getPublicKey(secretKey)
    resetIdleTimer()
    unlockCallbacks.forEach(cb => cb())
    return publicKey
  } catch {
    return null
  }
}

/**
 * Lock the key manager — zeros out the secret key bytes.
 */
export function lock() {
  if (secretKey) {
    secretKey.fill(0)
  }
  secretKey = null
  // Don't clear publicKey — it's not secret and useful for display
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  lockCallbacks.forEach(cb => cb())
}

/**
 * Import a key (onboarding / recovery): encrypt and store, then load into memory.
 */
export async function importKey(nsec: string, pin: string): Promise<string> {
  const decoded = nip19.decode(nsec)
  if (decoded.type !== 'nsec') throw new Error('Invalid nsec')
  const sk = decoded.data
  const pk = getPublicKey(sk)

  await storeEncryptedKey(nsec, pin, pk)
  secretKey = sk
  publicKey = pk
  resetIdleTimer()
  unlockCallbacks.forEach(cb => cb())
  return pk
}

/**
 * Get the secret key. Throws if locked.
 */
export function getSecretKey(): Uint8Array {
  if (!secretKey) throw new KeyLockedError()
  resetIdleTimer()
  return secretKey
}

/**
 * Check if the key manager is currently unlocked.
 */
export function isUnlocked(): boolean {
  return secretKey !== null
}

/**
 * Get the public key (hex). Available when unlocked OR if we can derive it
 * from the stored key ID.
 */
export function getPublicKeyHex(): string | null {
  return publicKey
}

/**
 * Check if there's an encrypted key in local storage.
 */
export { hasStoredKey } from './key-store'

/**
 * Create a Schnorr auth token using the in-memory secret key.
 * Throws KeyLockedError if locked.
 */
export function createAuthToken(timestamp: number): string {
  if (!secretKey) throw new KeyLockedError()
  resetIdleTimer()
  return _createAuthToken(secretKey, timestamp)
}

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
 * Wipe the encrypted key from localStorage and lock.
 * Used when max PIN attempts exceeded.
 */
export function wipeKey() {
  lock()
  clearStoredKey()
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
