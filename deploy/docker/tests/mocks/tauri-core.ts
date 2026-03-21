/**
 * Mock @tauri-apps/api/core for Playwright test builds.
 * Implements crypto via @noble/curves so tests exercise real algorithms.
 */

import { schnorr } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes, utf8ToBytes } from '@noble/ciphers/utils.js'
import { bech32 } from '@scure/base'

let secretKeyHex: string | null = null
let publicKeyHex: string | null = null

function requireUnlocked(): string {
  if (!secretKeyHex) throw new Error('CryptoState is locked')
  return secretKeyHex
}

function pubFromSk(sk: string): string {
  return bytesToHex(schnorr.getPublicKey(sk))
}

function nsecEncode(sk: string): string {
  return bech32.encode('nsec', bech32.toWords(hexToBytes(sk)), 1500)
}

function nsecDecode(nsec: string): string {
  const { prefix, words } = bech32.decode(nsec, 1500)
  if (prefix !== 'nsec') throw new Error('Invalid nsec')
  return bytesToHex(bech32.fromWords(words))
}

function npubEncode(pk: string): string {
  return bech32.encode('npub', bech32.toWords(hexToBytes(pk)), 1500)
}

function eciesWrap(keyHex: string, recipientPubkey: string) {
  const ephSk = bytesToHex(randomBytes(32))
  const ephPk = pubFromSk(ephSk)
  const ikm = sha256(hexToBytes(ephSk + recipientPubkey))
  const nonce = randomBytes(24)
  const ct = xchacha20poly1305(ikm, nonce).encrypt(hexToBytes(keyHex))
  return { wrappedKey: bytesToHex(nonce) + bytesToHex(ct), ephemeralPubkey: ephPk }
}

function pinEncrypt(nsec: string, pin: string, pubkey: string) {
  const sk = nsecDecode(nsec)
  const salt = randomBytes(16)
  const kek = pbkdf2(sha256, utf8ToBytes(pin), salt, { c: 100, dkLen: 32 })
  const nonce = randomBytes(24)
  const ct = xchacha20poly1305(kek, nonce).encrypt(hexToBytes(sk))
  secretKeyHex = sk
  publicKeyHex = pubkey
  return { salt: bytesToHex(salt), iterations: 600_000, nonce: bytesToHex(nonce), ciphertext: bytesToHex(ct), pubkey }
}

function pinDecrypt(data: { salt: string; nonce: string; ciphertext: string; pubkey: string }, pin: string): string {
  const kek = pbkdf2(sha256, utf8ToBytes(pin), hexToBytes(data.salt), { c: 100, dkLen: 32 })
  const sk = xchacha20poly1305(kek, hexToBytes(data.nonce)).decrypt(hexToBytes(data.ciphertext))
  secretKeyHex = bytesToHex(sk)
  publicKeyHex = data.pubkey
  return data.pubkey
}

type Args = Record<string, unknown>
const commands: Record<string, (a: Args) => unknown> = {
  generate_keypair: () => {
    const sk = bytesToHex(randomBytes(32))
    const pk = pubFromSk(sk)
    return { secretKeyHex: sk, publicKey: pk, nsec: nsecEncode(sk), npub: npubEncode(pk) }
  },
  get_public_key: (a) => pubFromSk(a.secretKeyHex as string),
  get_public_key_from_state: () => publicKeyHex,
  is_valid_nsec: (a) => { try { nsecDecode(a.nsec as string); return true } catch { return false } },
  key_pair_from_nsec: (a) => {
    try { const sk = nsecDecode(a.nsec as string); const pk = pubFromSk(sk); return { secretKeyHex: sk, publicKey: pk, nsec: a.nsec, npub: npubEncode(pk) } }
    catch { return null }
  },
  import_key_to_state: (a) => pinEncrypt(a.nsec as string, a.pin as string, a.pubkeyHex as string),
  unlock_with_pin: (a) => pinDecrypt(a.data as { salt: string; nonce: string; ciphertext: string; pubkey: string }, a.pin as string),
  create_auth_token_from_state: (a) => {
    const sk = requireUnlocked()
    const msg = `${a.timestamp}:${a.method}:${a.path}`
    const sig = schnorr.sign(sha256(utf8ToBytes(msg)), sk)
    return `${publicKeyHex}:${a.timestamp}:${bytesToHex(sig)}`
  },
  create_auth_token: (a) => {
    const sk = a.secretKeyHex as string; const pk = pubFromSk(sk)
    const msg = `${a.timestamp}:${a.method}:${a.path}`
    const sig = schnorr.sign(sha256(utf8ToBytes(msg)), sk)
    return `${pk}:${a.timestamp}:${bytesToHex(sig)}`
  },
  verify_schnorr: (a) => { try { return schnorr.verify(a.signature as string, sha256(utf8ToBytes(a.message as string)), a.pubkey as string) } catch { return false } },
  ecies_wrap_key: (a) => eciesWrap(a.keyHex as string, a.recipientPubkey as string),
  ecies_unwrap_key_from_state: () => bytesToHex(randomBytes(32)),
  encrypt_note: (a) => {
    const nk = bytesToHex(randomBytes(32)); const n = randomBytes(24)
    const ct = xchacha20poly1305(hexToBytes(nk), n).encrypt(utf8ToBytes(a.payloadJson as string))
    return { encryptedContent: bytesToHex(n) + bytesToHex(ct), authorEnvelope: eciesWrap(nk, a.authorPubkey as string), adminEnvelopes: (a.adminPubkeys as string[]).map(pk => ({ pubkey: pk, ...eciesWrap(nk, pk) })) }
  },
  decrypt_note_from_state: () => '{"text":"mock note","customFields":{}}',
  decrypt_legacy_note_from_state: () => '{"text":"mock note","customFields":{}}',
  encrypt_message: (a) => {
    const k = bytesToHex(randomBytes(32)); const n = randomBytes(24)
    const ct = xchacha20poly1305(hexToBytes(k), n).encrypt(utf8ToBytes(a.plaintext as string))
    return { encryptedContent: bytesToHex(n) + bytesToHex(ct), readerEnvelopes: (a.readerPubkeys as string[]).map(pk => ({ pubkey: pk, ...eciesWrap(k, pk) })) }
  },
  decrypt_message_from_state: () => 'mock message',
  decrypt_call_record_from_state: () => '{"answeredBy":null,"callerNumber":"+1234567890"}',
  decrypt_transcription_from_state: () => 'mock transcription',
  encrypt_draft_from_state: (a) => btoa(a.plaintext as string),
  decrypt_draft_from_state: (a) => atob(a.packed as string),
  encrypt_export_from_state: (a) => btoa(a.jsonString as string),
  sign_nostr_event_from_state: (a) => {
    const sk = requireUnlocked(); const pk = publicKeyHex!
    const ser = JSON.stringify([0, pk, a.createdAt, a.kind, a.tags, a.content])
    const id = bytesToHex(sha256(utf8ToBytes(ser)))
    const sig = bytesToHex(schnorr.sign(hexToBytes(id), sk))
    return { id, pubkey: pk, created_at: a.createdAt, kind: a.kind, tags: a.tags, content: a.content, sig }
  },
  decrypt_file_metadata_from_state: () => '{}',
  unwrap_file_key_from_state: () => bytesToHex(randomBytes(32)),
  unwrap_hub_key_from_state: () => bytesToHex(randomBytes(32)),
  rewrap_file_key_from_state: (a) => ({ pubkey: a.newRecipientPubkeyHex, ...eciesWrap(bytesToHex(randomBytes(32)), a.newRecipientPubkeyHex as string) }),
  generate_provisioning_ephemeral: () => bytesToHex(randomBytes(32)),
  encrypt_nsec_for_provisioning: (a) => ({ encryptedHex: bytesToHex(randomBytes(64)), sasCode: '0000' }),
  decrypt_provisioned_nsec: () => ({ nsec: nsecEncode(requireUnlocked()), sasCode: '0000' }),
  lock_crypto: () => { secretKeyHex = null },
  is_crypto_unlocked: () => secretKeyHex !== null,
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const handler = commands[cmd]
  if (!handler) throw new Error(`Unknown Tauri command: ${cmd}`)
  return handler(args || {}) as T
}

export function convertFileSrc(path: string): string { return path }
export function isTauri(): boolean { return false }
export class Resource { #rid: number; get rid() { return this.#rid }; constructor(rid: number) { this.#rid = rid }; async close() {} }
export class Channel<T = unknown> { id = 0; #onmessage: (m: T) => void = () => {}; set onmessage(h: (m: T) => void) { this.#onmessage = h }; get onmessage() { return this.#onmessage }; toJSON() { return `__CHANNEL__:${this.id}` } }
export class PluginListener { constructor(public plugin: string, public event: string, public channelId: number) {}; async unregister() {} }
export async function addPluginListener(plugin: string, event: string, _cb: (p: unknown) => void): Promise<PluginListener> { return new PluginListener(plugin, event, 0) }
export const SERIALIZE_TO_IPC_FN = Symbol('serializeToIpc')
