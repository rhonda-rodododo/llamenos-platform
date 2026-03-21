/**
 * Mock @tauri-apps/api/core for Playwright test builds.
 *
 * All crypto operations route through the Rust-compiled WasmCryptoState,
 * ensuring tests exercise the same crypto code as the native desktop app.
 * There is no JS/@noble fallback — WASM is required.
 *
 * Aliased via vite.config.ts when PLAYWRIGHT_TEST=true.
 */

// Production guard: prevent test mocks from loading in production builds.
if (!import.meta.env.PLAYWRIGHT_TEST) {
  throw new Error('FATAL: Tauri IPC mock loaded outside test environment.')
}

import { initWasmCrypto, getWasmState, getWasmModule } from './wasm-crypto-state'

// ── WASM initialization ──────────────────────────────────────────────
// Every invoke() call awaits this before touching any WASM function.
// initWasmCrypto() itself is idempotent (caches its own promise), so
// we simply call it on every invoke — no separate cache needed.
// This eliminates the double-promise-cache that could desync if the
// bundler instantiates modules in an unexpected order.

async function ensureWasmReady(): Promise<void> {
  await initWasmCrypto()
}

// ── Types ─────────────────────────────────────────────────────────────

type Args = Record<string, unknown>
type CommandHandler = (a: Args) => unknown | Promise<unknown>

// ── Command handlers ──────────────────────────────────────────────────

const commands: Record<string, CommandHandler> = {
  // --- Keypair operations (stateless) ---

  generate_keypair: () => {
    const result = getWasmModule().generateKeypair()
    return { secretKeyHex: result.skHex, publicKey: result.pubkeyHex, nsec: result.nsec, npub: result.npub }
  },

  get_public_key: (a) =>
    getWasmModule().getPublicKeyFromSecret(a.secretKeyHex as string),

  get_public_key_from_state: () =>
    getWasmState().getPublicKey(),

  is_valid_nsec: (a) =>
    getWasmModule().isValidNsec(a.nsec as string),

  key_pair_from_nsec: (a) => {
    try {
      const result = getWasmModule().keyPairFromNsec(a.nsec as string)
      return { secretKeyHex: result.skHex, publicKey: result.pubkeyHex, nsec: result.nsec, npub: result.npub }
    } catch {
      return null
    }
  },

  // --- CryptoState management ---

  import_key_to_state: (a) =>
    getWasmState().importKey(a.nsec as string, a.pin as string),

  unlock_with_pin: (a) => {
    const data = a.data as Record<string, unknown>
    return getWasmState().unlockWithPin(JSON.stringify(data), a.pin as string)
  },

  lock_crypto: () => {
    getWasmState().lock()
  },

  is_crypto_unlocked: () =>
    getWasmState().isUnlocked(),

  // --- Auth tokens ---

  create_auth_token_from_state: (a) =>
    JSON.stringify(getWasmState().createAuthToken(a.method as string, a.path as string)),

  create_auth_token: (a) =>
    JSON.stringify(
      getWasmModule().createAuthTokenStateless(a.secretKeyHex as string, a.method as string, a.path as string),
    ),

  verify_schnorr: (a) => {
    try {
      return getWasmModule().verifySchnorr(a.msgHashHex as string, a.signature as string, a.pubkey as string)
    } catch {
      return false
    }
  },

  // --- ECIES operations ---

  ecies_wrap_key: (a) =>
    getWasmModule().eciesWrapKey(a.keyHex as string, a.recipientPubkey as string, a.label as string),

  ecies_unwrap_key_from_state: (a) => {
    const envelope = a.envelope as { wrappedKey: string; ephemeralPubkey: string }
    return getWasmState().eciesUnwrapKey(JSON.stringify(envelope), a.label as string)
  },

  // --- Note encryption/decryption ---

  encrypt_note: (a) =>
    getWasmState().encryptNote(
      a.payloadJson as string,
      a.authorPubkey as string,
      JSON.stringify(a.adminPubkeys),
    ),

  decrypt_note_from_state: (a) => {
    const envelope = a.envelope as { wrappedKey: string; ephemeralPubkey: string }
    return getWasmState().decryptNote(a.encryptedContent as string, JSON.stringify(envelope))
  },

  decrypt_legacy_note_from_state: (a) =>
    getWasmState().decryptLegacyNote(a.packed as string),

  // --- Message encryption/decryption ---

  encrypt_message: (a) =>
    getWasmState().encryptMessage(a.plaintext as string, JSON.stringify(a.readerPubkeys)),

  decrypt_message_from_state: (a) =>
    getWasmState().decryptMessage(
      a.encryptedContent as string,
      JSON.stringify(a.readerEnvelopes),
    ),

  // --- Call record decryption ---

  decrypt_call_record_from_state: (a) =>
    getWasmState().decryptCallRecord(
      a.encryptedContent as string,
      JSON.stringify(a.adminEnvelopes),
    ),

  // --- Transcription decryption ---

  decrypt_transcription_from_state: (a) =>
    getWasmState().decryptTranscription(
      a.packed as string,
      a.ephemeralPubkeyHex as string,
    ),

  // --- Draft encryption/decryption ---

  encrypt_draft_from_state: (a) =>
    getWasmState().encryptDraft(a.plaintext as string),

  decrypt_draft_from_state: (a) =>
    getWasmState().decryptDraft(a.packed as string),

  // --- Export encryption ---

  encrypt_export_from_state: (a) =>
    getWasmState().encryptExport(a.jsonString as string),

  // --- Nostr event signing ---

  sign_nostr_event_from_state: (a) => {
    const eventTemplate = {
      kind: a.kind as number,
      created_at: a.createdAt as number,
      tags: a.tags as string[][],
      content: a.content as string,
    }
    return getWasmState().signNostrEvent(JSON.stringify(eventTemplate))
  },

  // --- File crypto ---

  decrypt_file_metadata_from_state: (a) => {
    const envelope = {
      wrappedKey: a.encryptedContentHex as string,
      ephemeralPubkey: a.ephemeralPubkeyHex as string,
    }
    return getWasmState().decryptFileMetadata(a.encryptedContentHex as string, JSON.stringify(envelope))
  },

  unwrap_file_key_from_state: (a) => {
    const envelope = a.envelope as { wrappedKey: string; ephemeralPubkey: string }
    return getWasmState().unwrapFileKey(JSON.stringify(envelope))
  },

  unwrap_hub_key_from_state: (a) => {
    const envelope = a.envelope as { wrappedKey: string; ephemeralPubkey: string }
    return getWasmState().unwrapHubKey(JSON.stringify(envelope))
  },

  rewrap_file_key_from_state: (a) => {
    const envelope = {
      wrappedKey: a.encryptedFileKeyHex as string,
      ephemeralPubkey: a.ephemeralPubkeyHex as string,
    }
    return getWasmState().rewrapFileKey(JSON.stringify(envelope), a.newRecipientPubkeyHex as string)
  },

  // --- Provisioning ---

  generate_provisioning_ephemeral: () =>
    getWasmState().generateProvisioningEphemeral(),

  encrypt_nsec_for_provisioning: (a) =>
    getWasmState().encryptNsecForProvisioning(a.ephemeralPubkeyHex as string),

  decrypt_provisioned_nsec: (a) =>
    getWasmState().decryptProvisionedNsec(
      a.encryptedHex as string,
      a.primaryPubkeyHex as string,
    ),

  // --- PIN lockout (WASM handles internally) ---

  get_pin_lockout_state: () => ({
    failedAttempts: 0,
    lockoutUntil: 0,
  }),

  set_pin_failed_attempts: () => {
    // No-op — lockout is handled internally by Rust
  },

  reset_pin_lockout: () => {
    // No-op — lockout is handled internally by Rust
  },
}

// ── Public API ────────────────────────────────────────────────────────

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  await ensureWasmReady()
  const handler = commands[cmd]
  if (!handler) throw new Error(`Unknown Tauri command: ${cmd}`)
  return await handler(args || {}) as T
}

// Expose invoke on window for test helpers (page.evaluate can't use dynamic imports
// because Vite aliases are resolved at build time, not at runtime)
if (typeof window !== 'undefined') {
  (window as Record<string, unknown>).__TEST_INVOKE = invoke
}

export function convertFileSrc(path: string): string { return path }
export function isTauri(): boolean { return false }

export class Resource {
  #rid: number
  get rid() { return this.#rid }
  constructor(rid: number) { this.#rid = rid }
  async close() {}
}

export class Channel<T = unknown> {
  id = 0
  #onmessage: (m: T) => void = () => {}
  set onmessage(h: (m: T) => void) { this.#onmessage = h }
  get onmessage() { return this.#onmessage }
  toJSON() { return `__CHANNEL__:${this.id}` }
}

export class PluginListener {
  constructor(public plugin: string, public event: string, public channelId: number) {}
  async unregister() {}
}

export async function addPluginListener(
  plugin: string, event: string, _cb: (p: unknown) => void,
): Promise<PluginListener> {
  return new PluginListener(plugin, event, 0)
}

export const SERIALIZE_TO_IPC_FN = Symbol('serializeToIpc')
