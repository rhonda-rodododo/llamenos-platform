# Epic 93: Tauri-Only TypeScript Migration

**Status**: Planned
**Depends on**: Epic 92 (Rust IPC Expansion)
**Blocks**: Epic 94 (Build Cleanup & Dead Code Removal)

## Goal

Rewrite all TypeScript crypto plumbing so that:
1. The nsec **NEVER** enters the webview (except for device provisioning via `get_nsec_from_state`)
2. `getSecretKey()` is eliminated — no more `Uint8Array` secret key in the browser
3. All `secretKeyHex` params are removed from `platform.ts` functions
4. `key-manager.ts` no longer holds a `secretKey` closure
5. All `isBrowser()` branches are removed from `platform.ts`
6. `finalizeEvent(template, sk)` is replaced with `platform.signNostrEvent()`

## Scope

This is the big rewrite. Every file that currently calls `getSecretKey()` or imports from `crypto.ts` directly must be migrated.

## Phase 1: platform.ts Rewrite

### Current State

`platform.ts` (458 lines) has two code paths for every function: `isTauri()` → IPC vs `isBrowser()` → JS. After this rewrite, every function becomes a direct `tauriInvoke` call.

### New platform.ts Structure

**Remove all `isBrowser()` branches.** Every function is now Tauri-only.

#### Functions that DROP `secretKeyHex` param

These functions currently accept `secretKeyHex` but ignore it on desktop (CryptoState is used). Remove the param entirely:

```typescript
// BEFORE:
export async function createAuthToken(
  secretKeyHex: string, timestamp: number, method: string, path: string,
): Promise<string>

// AFTER:
export async function createAuthToken(
  timestamp: number, method: string, path: string,
): Promise<string> {
  return tauriInvoke<string>('create_auth_token_from_state', { timestamp, method, path })
}
```

Full list of signature changes:

| Function | Removed params | New signature |
|----------|---------------|---------------|
| `createAuthToken` | `secretKeyHex` | `(timestamp, method, path)` |
| `eciesUnwrapKey` | `secretKeyHex` | `(envelope, label)` |
| `decryptNote` | `secretKeyHex` | `(encryptedContent, envelope)` |
| `decryptMessage` | `secretKeyHex, readerPubkey` | `(encryptedContent, readerEnvelopes)` |
| `decryptCallRecord` | `secretKeyHex, readerPubkey` | `(encryptedContent, adminEnvelopes)` |
| `decryptLegacyNote` | `secretKeyHex` | `(packed)` |
| `decryptTranscription` | `secretKeyHex` | `(packed, ephemeralPubkeyHex)` |
| `encryptDraft` | `secretKeyHex` | `(plaintext)` |
| `decryptDraft` | `secretKeyHex` | `(packed)` |
| `encryptExport` | `secretKeyHex` | `(jsonString)` — now returns `Promise<string>` (base64) |
| `getPublicKey` | `secretKeyHex` | removed entirely (use `getPublicKeyFromState`) |

#### New functions

```typescript
/** Sign a Nostr event using CryptoState. Replaces finalizeEvent(template, sk). */
export async function signNostrEvent(
  kind: number,
  createdAt: number,
  tags: string[][],
  content: string,
): Promise<SignedNostrEvent> {
  return tauriInvoke<SignedNostrEvent>('sign_nostr_event_from_state', {
    kind, createdAt, tags, content,
  })
}

export interface SignedNostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

/** Decrypt file metadata via ECIES through Rust CryptoState. */
export async function decryptFileMetadata(
  encryptedContentHex: string,
  ephemeralPubkeyHex: string,
): Promise<string | null> {
  try {
    return await tauriInvoke<string>('decrypt_file_metadata_from_state', {
      encryptedContentHex, ephemeralPubkeyHex,
    })
  } catch { return null }
}

/** Unwrap a file key envelope via CryptoState. */
export async function unwrapFileKey(
  envelope: KeyEnvelope,
): Promise<string> {
  return tauriInvoke<string>('unwrap_file_key_from_state', { envelope })
}

/** Unwrap a hub key envelope via CryptoState. */
export async function unwrapHubKey(
  envelope: KeyEnvelope,
): Promise<string> {
  return tauriInvoke<string>('unwrap_hub_key_from_state', { envelope })
}

/** Re-wrap a file key for a new recipient. */
export async function rewrapFileKey(
  encryptedFileKeyHex: string,
  ephemeralPubkeyHex: string,
  newRecipientPubkeyHex: string,
): Promise<RecipientKeyEnvelope> {
  return tauriInvoke<RecipientKeyEnvelope>('rewrap_file_key_from_state', {
    encryptedFileKeyHex, ephemeralPubkeyHex, newRecipientPubkeyHex,
  })
}

/** Get nsec from CryptoState (for device provisioning/backup ONLY). */
export async function getNsecFromState(): Promise<string> {
  return tauriInvoke<string>('get_nsec_from_state')
}

/** Validate nsec format (stateless IPC). */
export async function isValidNsec(nsec: string): Promise<boolean> {
  return tauriInvoke<boolean>('is_valid_nsec', { nsec })
}

/** Parse nsec to keypair (stateless, for onboarding sign-in). */
export async function keyPairFromNsec(nsec: string): Promise<PlatformKeyPair | null> {
  try {
    return await tauriInvoke<PlatformKeyPair>('key_pair_from_nsec', { nsec })
  } catch { return null }
}
```

#### Type re-exports

Keep type exports from crypto.ts for now (Epic 94 will move them to a types file):

```typescript
export type { KeyEnvelope, RecipientKeyEnvelope } from './crypto'
```

#### Remove

- All `import('./crypto')` dynamic imports
- All `import('@noble/hashes/utils.js')` dynamic imports
- All `isTauri()` / `isBrowser()` branching
- The `getPublicKey(secretKeyHex)` function (replaced by `getPublicKeyFromState()`)

### Impact: `isValidNsec` becomes async

Currently `isValidNsec` is re-exported synchronously. After this change, it's async (IPC call). All call sites must be updated:

**Current call sites** (from grep):
- `src/client/routes/login.tsx` — `isValidNsec(nsec)` in form validation
- `src/client/routes/onboarding.tsx` — `isValidNsec(nsec)` in validation
- `src/client/components/setup/AdminBootstrap.tsx` — `isValidNsec(nsec)` in validation

These are all in async event handlers already, so adding `await` is straightforward.

### Impact: `encryptExport` return type changes

Currently returns `Uint8Array`. After Epic 92, the Rust side returns base64 string. The TypeScript caller (notes.tsx export) will need to decode:

```typescript
// Before:
const encrypted = await encryptExport(jsonString, skHex) // Uint8Array
const blob = new Blob([encrypted])

// After:
const base64 = await encryptExport(jsonString) // base64 string
const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
const blob = new Blob([binary])
```

## Phase 2: key-manager.ts Rewrite

### Remove from key-manager.ts

1. **The `secretKey: Uint8Array | null` closure variable** — the whole point of this epic
2. **`getSecretKey(): Uint8Array`** — eliminated
3. **`getNsec(): string | null`** — replaced by `platform.getNsecFromState()`
4. **`createAuthToken()`** — replaced by direct `platform.createAuthToken()` calls
5. **Import of `createAuthToken as _createAuthToken` from `'./crypto'`**
6. **Import of `decryptStoredKey, storeEncryptedKey` from `'./key-store'`**
7. **Import of `getPublicKey, nip19` from `'nostr-tools'`**

### Keep in key-manager.ts

1. **`publicKey: string | null`** — cached locally, updated on unlock/lock events
2. **`isUnlocked(): boolean`** — but backed by cached state instead of checking `secretKey !== null`
3. **`getPublicKeyHex(): string | null`** — returns cached `publicKey`
4. **Lock/unlock callbacks** — still needed for UI reactivity
5. **Idle timer and visibility change handler** — still needed for auto-lock
6. **`hasStoredKey`** — re-exported from platform.ts (was key-store.ts)
7. **`wipeKey()`** — calls `platform.clearStoredKey()` + `lock()`

### New unlock/lock flow

```typescript
import { decryptWithPin, lockCrypto, isCryptoUnlocked, getPublicKeyFromState, clearStoredKey as platformClear } from './platform'

let publicKey: string | null = null
let unlocked = false

export async function unlock(pin: string): Promise<string | null> {
  const pubkey = await decryptWithPin(pin)
  if (!pubkey) return null

  publicKey = pubkey
  unlocked = true
  resetIdleTimer()
  unlockCallbacks.forEach(cb => cb())
  return publicKey
}

export function lock() {
  unlocked = false
  // Don't clear publicKey — it's not secret and useful for display
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  lockCrypto().catch(() => {})
  lockCallbacks.forEach(cb => cb())
}

export function isUnlocked(): boolean {
  return unlocked
}

export function getPublicKeyHex(): string | null {
  return publicKey
}
```

### New importKey flow

```typescript
export async function importKey(nsec: string, pin: string): Promise<string> {
  // Stateless IPC: validate + derive pubkey
  const kp = await keyPairFromNsec(nsec)
  if (!kp) throw new Error('Invalid nsec')

  // platform.encryptWithPin calls import_key_to_state — stores encrypted + loads CryptoState
  await encryptWithPin(nsec, pin, kp.publicKey)

  publicKey = kp.publicKey
  unlocked = true
  resetIdleTimer()
  unlockCallbacks.forEach(cb => cb())
  return kp.publicKey
}
```

**Note**: `nsec` crosses the IPC boundary during `importKey()` — this is intentional and acceptable because:
1. It only happens during onboarding (once per device)
2. Tauri IPC is in-process (same OS process, not network)
3. The nsec is immediately encrypted and loaded into CryptoState

### hasStoredKey migration

Currently re-exports from `key-store.ts`. Change to re-export from `platform.ts`:

```typescript
export { hasStoredKey } from './platform'
```

## Phase 3: auth.tsx Migration

### Current Issues

`auth.tsx` line 2:
```typescript
import { keyPairFromNsec, createAuthToken } from './crypto'
```

`signIn()` at line 200-206:
```typescript
const keyPair = keyPairFromNsec(nsec)
const token = createAuthToken(keyPair.secretKey, Date.now(), 'POST', '/api/auth/login')
```

### Migration

Replace imports:
```typescript
import { keyPairFromNsec, createAuthToken } from './platform'
```

Rewrite `signIn()`:
```typescript
const signIn = useCallback(async (nsec: string) => {
  setState(s => ({ ...s, isLoading: true, error: null }))
  const keyPair = await keyPairFromNsec(nsec)
  if (!keyPair) {
    setState(s => ({ ...s, isLoading: false, error: 'Invalid secret key' }))
    return
  }
  try {
    // Stateless IPC: sign auth token for the login request
    // (nsec is not yet in CryptoState — that happens via importKey after successful login)
    const token = await createAuthToken(Date.now(), 'POST', '/api/auth/login')
    // Wait — this won't work because CryptoState isn't loaded yet during sign-in!
    // Need to use stateless auth token creation for this one case.
```

**Problem**: During `signIn()`, the user enters an nsec that hasn't been imported yet. CryptoState is empty. We need a stateless auth token for this case.

**Solution**: Add a stateless `create_auth_token_for_nsec` IPC command, or use the existing stateless `create_auth_token` command:

```typescript
const signIn = useCallback(async (nsec: string) => {
  setState(s => ({ ...s, isLoading: true, error: null }))
  const keyPair = await keyPairFromNsec(nsec)
  if (!keyPair) {
    setState(s => ({ ...s, isLoading: false, error: 'Invalid secret key' }))
    return
  }
  try {
    // Use STATELESS auth token (nsec not yet in CryptoState)
    const tokenJson = await tauriInvoke<string>('create_auth_token', {
      secretKeyHex: keyPair.secretKeyHex,
      timestamp: Date.now(),
      method: 'POST',
      path: '/api/auth/login',
    })
    const parsed = JSON.parse(tokenJson)
    await login(parsed.pubkey, parsed.timestamp, parsed.token)
    const me = await getMe()
    // ... rest of setState
  } catch (err) {
    // ... error handling
  }
}, [])
```

But wait — we don't want to expose `tauriInvoke` from `auth.tsx`. Better approach: keep a `createAuthTokenStateless(secretKeyHex, ...)` variant in platform.ts for the sign-in flow:

```typescript
// platform.ts — for sign-in only (nsec not yet in CryptoState)
export async function createAuthTokenStateless(
  secretKeyHex: string,
  timestamp: number,
  method: string,
  path: string,
): Promise<string> {
  return tauriInvoke<string>('create_auth_token', {
    secretKeyHex, timestamp, method, path,
  })
}
```

Then in auth.tsx:
```typescript
import { keyPairFromNsec, createAuthTokenStateless } from './platform'

const signIn = useCallback(async (nsec: string) => {
  const keyPair = await keyPairFromNsec(nsec)
  if (!keyPair) { /* error */ return }
  const tokenJson = await createAuthTokenStateless(
    keyPair.secretKeyHex, Date.now(), 'POST', '/api/auth/login'
  )
  const parsed = JSON.parse(tokenJson)
  await login(parsed.pubkey, parsed.timestamp, parsed.token)
  // ...
}, [])
```

This is acceptable because:
1. The nsec only exists as a hex string in JS for the duration of the sign-in call
2. It's never stored in a closure or state variable
3. After sign-in completes, `importKey()` loads it into CryptoState and it's never accessed in JS again

### Remove hasStoredKey import from key-store

```typescript
// Before:
import { hasStoredKey } from './key-store'

// After:
import { hasStoredKey } from './platform'
// Note: hasStoredKey is now async! Must await it.
```

`hasStoredKey` is called in auth.tsx indirectly via key-manager's re-export. Actually, checking the code, `auth.tsx` imports it from `./key-store` directly at line 4. This needs to change to import from `./platform`, and the call site needs to handle async.

## Phase 4: api.ts Migration

### Current State

`api.ts` line 1:
```typescript
import * as keyManager from './key-manager'
```

`getAuthHeaders()` at line 9-25:
```typescript
function getAuthHeaders(method: string, apiPath: string): Record<string, string> {
  const sessionToken = sessionStorage.getItem('llamenos-session-token')
  if (sessionToken) {
    return { 'Authorization': `Session ${sessionToken}` }
  }
  if (keyManager.isUnlocked()) {
    try {
      const token = keyManager.createAuthToken(Date.now(), method, `${API_BASE}${apiPath}`)
      return { 'Authorization': `Bearer ${token}` }
    } catch { return {} }
  }
  return {}
}
```

### Migration

`keyManager.createAuthToken()` is being removed. Replace with `platform.createAuthToken()` which is async:

```typescript
import * as keyManager from './key-manager'
import { createAuthToken } from './platform'

async function getAuthHeaders(method: string, apiPath: string): Promise<Record<string, string>> {
  const sessionToken = sessionStorage.getItem('llamenos-session-token')
  if (sessionToken) {
    return { 'Authorization': `Session ${sessionToken}` }
  }
  if (keyManager.isUnlocked()) {
    try {
      const token = await createAuthToken(Date.now(), method, `${API_BASE}${apiPath}`)
      return { 'Authorization': `Bearer ${token}` }
    } catch { return {} }
  }
  return {}
}
```

Since `getAuthHeaders` becomes async, `request()` must await it:

```typescript
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = ((options.method as string) || 'GET').toUpperCase()
  const pathOnly = path.split('?')[0]
  const headers = {
    'Content-Type': 'application/json',
    ...await getAuthHeaders(method, pathOnly),  // <-- add await
    ...options.headers,
  }
  // ... rest unchanged
}
```

This is a safe change since `request()` is already async.

## Phase 5: Consumer File Updates

### 5.1 Route files that use `bytesToHex(keyManager.getSecretKey())`

All these files follow the same pattern — remove the `skHex` variable and drop the arg:

**`src/client/routes/notes.tsx`** (lines 67, 106, 211):
```typescript
// BEFORE:
const skHex = bytesToHex(keyManager.getSecretKey())
const decryptedJson = await decryptNote(note.encryptedContent, envelope, skHex)

// AFTER:
const decryptedJson = await decryptNote(note.encryptedContent, envelope)
```

Also remove `import { bytesToHex } from '@noble/hashes/utils.js'` from these files.

**`src/client/routes/calls.tsx`** (line 73):
```typescript
// BEFORE:
const skHex = bytesToHex(keyManager.getSecretKey())
const meta = await decryptCallRecord(call.encryptedContent, call.adminEnvelopes, skHex, publicKey)

// AFTER:
const meta = await decryptCallRecord(call.encryptedContent, call.adminEnvelopes)
```

**`src/client/routes/reports.tsx`** (line 375):
```typescript
// BEFORE:
const skHex = bytesToHex(keyManager.getSecretKey())
const plaintext = await decryptMessage(msg.encryptedContent, msg.readerEnvelopes, skHex, publicKey)

// AFTER:
const plaintext = await decryptMessage(msg.encryptedContent, msg.readerEnvelopes)
```

**`src/client/lib/use-draft.ts`** (lines 32, 59):
```typescript
// BEFORE:
const skHex = bytesToHex(keyManager.getSecretKey())
const decrypted = await decryptDraft(raw, skHex)
const encrypted = await encryptDraft(JSON.stringify(data), skHex)

// AFTER:
const decrypted = await decryptDraft(raw)
const encrypted = await encryptDraft(JSON.stringify(data))
```

Also remove `import { bytesToHex } from '@noble/hashes/utils.js'` from use-draft.ts.

### 5.2 ConversationThread.tsx (line 71-76)

```typescript
// BEFORE:
function resolveSecretKey(): Uint8Array | null {
  if (keyManager.isUnlocked()) {
    try { return keyManager.getSecretKey() } catch { return null }
  }
  return null
}
// ... later:
const skHex = bytesToHex(resolveSecretKey()!)
const plaintext = await decryptMessage(msg.encryptedContent, msg.readerEnvelopes, skHex, publicKey)

// AFTER:
// Remove resolveSecretKey entirely
// ... later:
const plaintext = await decryptMessage(msg.encryptedContent, msg.readerEnvelopes)
```

### 5.3 FilePreview.tsx (line 21-26)

```typescript
// BEFORE:
function resolveSecretKey(): Uint8Array | null {
  if (keyManager.isUnlocked()) {
    try { return keyManager.getSecretKey() } catch { return null }
  }
  return null
}

// AFTER:
// Remove resolveSecretKey entirely
// File decryption now uses platform.unwrapFileKey() and platform.decryptFileMetadata()
```

### 5.4 settings.tsx (device provisioning, lines 562-584)

```typescript
// BEFORE:
const nsecStr = keyManager.getNsec()
const secretKey = keyManager.getSecretKey()
const publicKey = keyManager.getPublicKeyHex()!
const sas = computeSASForPrimaryDevice(secretKey, room.ephemeralPubkey)
const encrypted = encryptNsecForDevice(nsecStr, room.ephemeralPubkey, secretKey)

// AFTER:
const nsecStr = await getNsecFromState()
const publicKey = keyManager.getPublicKeyHex()!
// SAS computation needs the secret key — move to Rust or keep ephemeral
// Actually, SAS uses ECDH between the device's key and the ephemeral,
// so we need a new IPC command or a different approach.
```

**Issue**: `computeSASForPrimaryDevice(secretKey, ephemeralPubkey)` needs the raw secret key for ECDH. Options:
1. Add a `compute_sas_from_state(ephemeral_pubkey)` IPC command to llamenos-core
2. Accept that during device provisioning, the nsec briefly exists in JS (via `getNsecFromState()`)

**Decision**: Option 2 for now. The nsec is already being sent (encrypted) to the new device. Having it briefly in JS for SAS computation doesn't materially change the threat model. The provisioning.ts functions already handle ECDH in JS. We can revisit this when the provisioning protocol is moved fully to Rust.

```typescript
// Revised approach:
const nsecStr = await getNsecFromState()
const publicKey = keyManager.getPublicKeyHex()!
// Decode nsec temporarily for SAS computation
const { nip19 } = await import('nostr-tools')
const decoded = nip19.decode(nsecStr)
if (decoded.type !== 'nsec') throw new Error('Invalid nsec')
const secretKeyBytes = decoded.data
const sas = computeSASForPrimaryDevice(secretKeyBytes, room.ephemeralPubkey)
const encrypted = encryptNsecForDevice(nsecStr, room.ephemeralPubkey, secretKeyBytes)
// secretKeyBytes is GC'd after this scope
```

This is acceptable because provisioning is an admin-initiated explicit action that already sends the nsec to another device.

## Phase 6: file-crypto.ts Migration

### Current State

`file-crypto.ts` imports directly from `'./crypto'`:
```typescript
import { eciesWrapKey, eciesUnwrapKey } from './crypto'
```

Functions take `secretKey: Uint8Array`:
- `unwrapFileKey(encryptedFileKeyHex, ephemeralPubkeyHex, secretKey)`
- `decryptFileMetadata(encryptedContentHex, ephemeralPubkeyHex, secretKey)`
- `decryptFile(encryptedContent, envelope, secretKey)`
- `rewrapFileKey(encryptedFileKeyHex, ephemeralPubkeyHex, adminSecretKey, newRecipientPubkeyHex)`

### Migration

Replace ECIES operations with platform.ts calls. Keep `@noble/ciphers` for symmetric content encryption (uses random key, not nsec):

```typescript
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import type { EncryptedFileMetadata, RecipientEnvelope } from '@shared/types'
import {
  eciesWrapKey,
  unwrapFileKey as platformUnwrapFileKey,
  decryptFileMetadata as platformDecryptMetadata,
  rewrapFileKey as platformRewrapFileKey,
} from './platform'

export async function unwrapFileKey(
  encryptedFileKeyHex: string,
  ephemeralPubkeyHex: string,
): Promise<string> {
  return platformUnwrapFileKey({
    wrappedKey: encryptedFileKeyHex,
    ephemeralPubkey: ephemeralPubkeyHex,
  })
}

export async function decryptFileMetadata(
  encryptedContentHex: string,
  ephemeralPubkeyHex: string,
): Promise<EncryptedFileMetadata | null> {
  const json = await platformDecryptMetadata(encryptedContentHex, ephemeralPubkeyHex)
  if (!json) return null
  return JSON.parse(json)
}

export async function decryptFile(
  encryptedContent: ArrayBuffer,
  envelope: RecipientEnvelope,
): Promise<{ blob: Blob; checksum: string }> {
  // Unwrap file key via Rust (ECIES with nsec)
  const fileKeyHex = await unwrapFileKey(envelope.encryptedFileKey, envelope.ephemeralPubkey)
  const fileKey = hexToBytes(fileKeyHex)

  // Symmetric decryption stays in JS (random key, not nsec)
  const data = new Uint8Array(encryptedContent)
  const nonce = data.slice(0, 24)
  const ciphertext = data.slice(24)
  const cipher = xchacha20poly1305(fileKey, nonce)
  const plaintext = cipher.decrypt(ciphertext)

  const hashBuffer = await crypto.subtle.digest('SHA-256', plaintext.buffer as ArrayBuffer)
  const checksum = bytesToHex(new Uint8Array(hashBuffer))
  return { blob: new Blob([plaintext.buffer as ArrayBuffer]), checksum }
}

export async function rewrapFileKey(
  encryptedFileKeyHex: string,
  ephemeralPubkeyHex: string,
  newRecipientPubkeyHex: string,
): Promise<RecipientEnvelope> {
  return platformRewrapFileKey(encryptedFileKeyHex, ephemeralPubkeyHex, newRecipientPubkeyHex)
}

// encryptFile stays mostly the same — it uses eciesWrapKey (public key only, no nsec)
// and @noble/ciphers for content encryption (random key)
export async function encryptFile(
  file: File,
  recipientPubkeys: string[],
): Promise<EncryptedFileUpload> {
  // ... same as before, but eciesWrapKey from platform.ts is already async
  // encryptMetadataForPubkey needs to be rewritten to use platform ECIES
  // Actually, metadata encryption uses an ephemeral keypair + ECDH — this
  // doesn't use the nsec. It can stay in JS with @noble/curves.
  // ... keep existing implementation
}
```

**Decision on `encryptMetadataForPubkey`**: This function generates an ephemeral keypair and does ECDH with the recipient's public key. It does NOT use the user's nsec. It stays in JS with `@noble/curves` because moving it to Rust would be over-engineering — the security property we care about (nsec never in webview) is preserved.

**Decision on `encryptFile`**: Same — the random file key and symmetric encryption don't involve the nsec. The ECIES wrapping of the file key only uses the recipient's public key. Keep in JS.

### Remove from file-crypto.ts

- `import { secp256k1 } from '@noble/curves/secp256k1.js'` — only used in `decryptFileMetadata`, which now goes through Rust
- `import { eciesUnwrapKey } from './crypto'`
- All `secretKey: Uint8Array` parameters

### Keep in file-crypto.ts

- `import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'` — for symmetric file content
- `import { secp256k1 } from '@noble/curves/secp256k1.js'` — still needed for `encryptMetadataForPubkey` (ephemeral ECDH)
- `import { eciesWrapKey } from './platform'` — public-key-only ECIES wrapping

## Phase 7: hub-key-manager.ts Migration

### Current State

```typescript
import { eciesWrapKey, eciesUnwrapKey, type KeyEnvelope, type RecipientKeyEnvelope } from './crypto'
```

`unwrapHubKey` takes `secretKey: Uint8Array`:
```typescript
export function unwrapHubKey(envelope: KeyEnvelope, secretKey: Uint8Array): Uint8Array {
  return eciesUnwrapKey(envelope, secretKey, LABEL_HUB_KEY_WRAP)
}
```

### Migration

```typescript
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import {
  eciesWrapKey,
  unwrapHubKey as platformUnwrapHubKey,
  type KeyEnvelope,
  type RecipientKeyEnvelope,
} from './platform'
import { LABEL_HUB_KEY_WRAP } from '@shared/crypto-labels'

// wrapHubKeyForMember — uses eciesWrapKey (public key only). Now async.
export async function wrapHubKeyForMember(
  hubKey: Uint8Array,
  memberPubkeyHex: string,
): Promise<RecipientKeyEnvelope> {
  const envelope = await eciesWrapKey(bytesToHex(hubKey), memberPubkeyHex, LABEL_HUB_KEY_WRAP)
  return { pubkey: memberPubkeyHex, ...envelope }
}

// unwrapHubKey — now goes through Rust CryptoState
export async function unwrapHubKey(envelope: KeyEnvelope): Promise<Uint8Array> {
  const keyHex = await platformUnwrapHubKey(envelope)
  return hexToBytes(keyHex)
}

// encryptForHub, decryptFromHub — stay in JS (hub key is not nsec)
// ... unchanged

// wrapHubKeyForMembers — now async
export async function wrapHubKeyForMembers(
  hubKey: Uint8Array,
  memberPubkeys: string[],
): Promise<RecipientKeyEnvelope[]> {
  return Promise.all(memberPubkeys.map(pk => wrapHubKeyForMember(hubKey, pk)))
}

// rotateHubKey — now async
export async function rotateHubKey(
  memberPubkeys: string[],
): Promise<{ hubKey: Uint8Array; envelopes: RecipientKeyEnvelope[] }> {
  const hubKey = generateHubKey()
  const envelopes = await wrapHubKeyForMembers(hubKey, memberPubkeys)
  return { hubKey, envelopes }
}
```

## Phase 8: Nostr Relay Migration

### 8.1 relay.ts — Remove getSecretKey callback

```typescript
// BEFORE:
export interface RelayManagerOptions {
  relayUrl: string
  serverPubkey: string
  getSecretKey: () => Uint8Array | null  // <-- remove
  getHubKey: () => Uint8Array | null
  onStateChange?: (state: RelayState) => void
}

// AFTER:
export interface RelayManagerOptions {
  relayUrl: string
  serverPubkey: string
  getHubKey: () => Uint8Array | null
  onStateChange?: (state: RelayState) => void
}
```

### 8.2 handleAuth becomes async

```typescript
// BEFORE (relay.ts line 240-264):
private handleAuth(challenge: string): void {
  this.setState('authenticating')
  const sk = this.getSecretKey()
  if (!sk) { ... }
  const authEvent = finalizeEvent({ kind: 22242, ... }, sk)
  ...
}

// AFTER:
private async handleAuth(challenge: string): Promise<void> {
  this.setState('authenticating')

  try {
    const { signNostrEvent } = await import('../platform')
    const authEvent = await signNostrEvent(
      22242,
      Math.floor(Date.now() / 1000),
      [
        ['relay', this.relayUrl],
        ['challenge', challenge],
      ],
      '',
    )

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(['AUTH', authEvent]))
      this.authenticated = true
      this.setState('connected')
      this.flushPendingSubscriptions()
    }
  } catch (err) {
    console.error('[nostr] Auth failed:', err)
  }
}
```

### 8.3 events.ts — createHubEvent migration

```typescript
// BEFORE:
import { finalizeEvent, verifyEvent } from 'nostr-tools/pure'
export function createHubEvent(
  hubId: string, kind: number, encryptedContent: string, secretKey: Uint8Array,
): VerifiedEvent {
  const template = { kind, created_at: ..., tags: [...], content: encryptedContent }
  return finalizeEvent(template, secretKey)
}

// AFTER:
import { verifyEvent } from 'nostr-tools/pure'
import { signNostrEvent, type SignedNostrEvent } from '../platform'

export async function createHubEvent(
  hubId: string, kind: number, encryptedContent: string,
): Promise<SignedNostrEvent> {
  return signNostrEvent(
    kind,
    Math.floor(Date.now() / 1000),
    [['d', hubId], ['t', 'llamenos:event']],
    encryptedContent,
  )
}
```

Remove `finalizeEvent` import from events.ts. Keep `verifyEvent` for event validation.

### 8.4 context.tsx — Remove getSecretKey prop

```typescript
// BEFORE:
interface NostrProviderProps {
  ...
  getSecretKey: () => Uint8Array | null
  getHubKey: () => Uint8Array | null
}

// AFTER:
interface NostrProviderProps {
  ...
  getHubKey: () => Uint8Array | null
  // getSecretKey removed — relay uses platform.signNostrEvent() directly
}
```

### 8.5 __root.tsx — Remove getSecretKey callback

```typescript
// BEFORE (lines 152-174):
const getSecretKey = useCallback((): Uint8Array | null => {
  try {
    return keyManager.isUnlocked() ? keyManager.getSecretKey() : null
  } catch { return null }
}, [])

<NostrProvider getSecretKey={getSecretKey} getHubKey={getHubKey} ...>

// AFTER:
// Remove getSecretKey callback entirely
<NostrProvider getHubKey={getHubKey} ...>
```

## Summary of All Files Changed

| File | Changes |
|------|---------|
| `src/client/lib/platform.ts` | Full rewrite: remove all `isBrowser()` branches, drop `secretKeyHex` params, add new IPC functions |
| `src/client/lib/key-manager.ts` | Remove `secretKey` closure, `getSecretKey()`, `getNsec()`, `createAuthToken()`. Keep cached `publicKey` + `unlocked` bool |
| `src/client/lib/auth.tsx` | Import from platform.ts, use `keyPairFromNsec()` + `createAuthTokenStateless()` for sign-in |
| `src/client/lib/api.ts` | `getAuthHeaders()` becomes async, uses `platform.createAuthToken()` |
| `src/client/lib/file-crypto.ts` | ECIES ops → platform.ts, keep symmetric content crypto in JS |
| `src/client/lib/hub-key-manager.ts` | `unwrapHubKey` → platform.ts, `wrapHubKeyForMember` → async via platform.ts |
| `src/client/lib/nostr/relay.ts` | Remove `getSecretKey` callback, `handleAuth` → async via `platform.signNostrEvent()` |
| `src/client/lib/nostr/events.ts` | `createHubEvent` → async, uses `platform.signNostrEvent()` |
| `src/client/lib/nostr/context.tsx` | Remove `getSecretKey` prop from `NostrProviderProps` |
| `src/client/routes/__root.tsx` | Remove `getSecretKey` callback, drop from `<NostrProvider>` |
| `src/client/routes/notes.tsx` | Remove `bytesToHex(keyManager.getSecretKey())`, drop `skHex` args |
| `src/client/routes/calls.tsx` | Same — remove `skHex` pattern |
| `src/client/routes/reports.tsx` | Same — remove `skHex` pattern |
| `src/client/routes/settings.tsx` | Use `getNsecFromState()`, device provisioning flow update |
| `src/client/routes/login.tsx` | `isValidNsec` becomes async — add `await` |
| `src/client/routes/onboarding.tsx` | `isValidNsec` becomes async — add `await` |
| `src/client/lib/use-draft.ts` | Remove `bytesToHex(keyManager.getSecretKey())`, drop `skHex` args |
| `src/client/components/ConversationThread.tsx` | Remove `resolveSecretKey()`, drop `skHex` args |
| `src/client/components/FilePreview.tsx` | Remove `resolveSecretKey()`, use platform.ts for ECIES |
| `src/client/components/setup/AdminBootstrap.tsx` | `isValidNsec` becomes async |
| `src/client/lib/panic-wipe.ts` | Minor: `keyManager.wipeKey()` still works (now calls platform.clearStoredKey) |

## Verification

After this epic:
1. `bun run typecheck` — no errors
2. `bun run build` — builds successfully
3. `grep -r "getSecretKey" src/client/` — returns zero results (except the now-empty declaration)
4. `grep -r "secretKey: Uint8Array" src/client/` — returns zero results
5. `grep -r "from './crypto'" src/client/lib/platform.ts` — only type re-exports
6. `bun run tauri:dev` — app launches, login works, notes decrypt, messages decrypt
7. All E2E tests pass

## Risk Mitigation

### Sync → async ripple
`isValidNsec` going async affects form validation. All current call sites are in async handlers, so this is low-risk. `getAuthHeaders` going async only affects `request()` which is already async.

### Nostr event compatibility
The highest risk is `signNostrEvent` producing events that fail `verifyEvent()`. Mitigated by test vectors in Epic 92 and manual testing in tauri:dev.

### Device provisioning
`getNsecFromState()` intentionally sends nsec back to webview. This is a conscious security decision documented in Epic 92 section 2.2. The nsec is needed for ECDH with the provisioning room's ephemeral key.
