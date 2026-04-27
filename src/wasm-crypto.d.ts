/**
 * Ambient module declaration for the Rust WASM crypto module.
 *
 * The actual binary is produced by `bun run crypto:wasm` (Rust → wasm-pack).
 * This declaration satisfies TypeScript until the build artifact exists.
 * The WASM path is only exercised in browser/test builds — Tauri uses native IPC.
 *
 * To build the WASM artifact: bun run crypto:wasm
 */
declare module '../packages/crypto/dist/wasm/llamenos_core' {
  import type { KeyEnvelope, RecipientEnvelope } from '@protocol/schemas/common'

  export default function init(): Promise<void>

  export interface WasmKeypair {
    nsec: string
    npub: string
    pubkeyHex: string
  }

  export interface WasmSignedNostrEvent {
    id: string
    pubkey: string
    created_at: number
    kind: number
    tags: string[][]
    content: string
    sig: string
  }

  export interface WasmEncryptedNoteResult {
    encryptedContent: string
    authorEnvelope: KeyEnvelope
    adminEnvelopes: RecipientEnvelope[]
  }

  export interface WasmEncryptedMessageResult {
    encryptedContent: string
    readerEnvelopes: RecipientEnvelope[]
  }

  export interface WasmProvisioningEncryptResult {
    encryptedHex: string
    sasCode: string
  }

  export interface WasmProvisioningDecryptResult {
    nsec: string
    sasCode: string
  }

  export declare class WasmCryptoState {
    free(): void
    importKey(nsec: string, pin: string): unknown
    unlockWithPin(dataJson: string, pin: string): string
    lock(): void
    isUnlocked(): boolean
    getPublicKey(): string
    createAuthToken(method: string, path: string): string
    eciesUnwrapKey(envelopeJson: string, label: string): string
    encryptNote(
      payloadJson: string,
      authorPubkey: string,
      adminPubkeysJson: string,
    ): WasmEncryptedNoteResult
    decryptNote(encryptedContent: string, envelopeJson: string): string
    decryptLegacyNote(packed: string): string
    encryptMessage(
      plaintext: string,
      readerPubkeysJson: string,
    ): WasmEncryptedMessageResult
    decryptMessage(
      encryptedContent: string,
      readerEnvelopesJson: string,
    ): string
    decryptCallRecord(
      encryptedContent: string,
      adminEnvelopesJson: string,
    ): string
    decryptTranscription(packed: string, ephemeralPubkeyHex: string): string
    encryptDraft(plaintext: string): string
    decryptDraft(packed: string): string
    encryptExport(jsonString: string): string
    signNostrEvent(eventTemplateJson: string): WasmSignedNostrEvent
    decryptFileMetadata(
      encryptedContentHex: string,
      envelopeJson: string,
    ): string
    unwrapFileKey(envelopeJson: string): string
    unwrapHubKey(envelopeJson: string): string
    rewrapFileKey(
      envelopeJson: string,
      newRecipientPubkeyHex: string,
    ): RecipientEnvelope
    encryptNsecForProvisioning(
      ephemeralPubkeyHex: string,
    ): WasmProvisioningEncryptResult
    generateProvisioningEphemeral(): string
    decryptProvisionedNsec(
      encryptedHex: string,
      primaryPubkeyHex: string,
    ): WasmProvisioningDecryptResult
  }

  export declare function generateKeypair(): WasmKeypair
  export declare function keyPairFromNsec(nsec: string): WasmKeypair
  export declare function eciesWrapKey(
    keyHex: string,
    recipientPubkey: string,
    label: string,
  ): KeyEnvelope
  export declare function isValidNsec(nsec: string): boolean
  export declare function verifySchnorr(
    message: string,
    signature: string,
    pubkey: string,
  ): boolean
}
