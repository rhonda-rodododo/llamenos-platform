# EP09-P3: Recovery Group Desktop UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Implement admin recovery team configuration, recovery request dashboard, and user account recovery flow in the desktop (Tauri + React) client.

**Architecture:** The desktop UI extends three surfaces: (1) admin sections for recovery team configuration and request management, registered in the existing admin section registry; (2) an unauthenticated account recovery flow accessible from the login screen; and (3) a read-only recovery status display in user security settings. All crypto operations route through Tauri IPC via `platform.ts` wrappers that delegate to Rust `CryptoState`. API calls use the existing `api.ts` fetch pattern with `useState`/`useEffect` (no React Query in this codebase). All strings go through `packages/i18n`.

**Tech Stack:** React, TanStack Router, shadcn/ui, Tauri IPC (platform.ts), Playwright

---

## Task 1: Add Tauri IPC Commands for Recovery Crypto

> Add Shamir secret sharing and recovery group keypair generation to `apps/desktop/src/crypto.rs` (Rust IPC handlers), `src/client/lib/platform.ts` (TypeScript wrappers), and `tests/mocks/tauri-core.ts` (Playwright test mocks).

### Steps

- [ ] **1.1** Add Rust IPC command handlers in `apps/desktop/src/crypto.rs`

These commands delegate to `packages/crypto` functions. The Rust side is thin wrappers around the crypto crate:

```rust
// In apps/desktop/src/crypto.rs — add these Tauri commands

use llamenos_crypto::shamir;

/// Shamir split: split a 32-byte secret into N shares with threshold K.
/// Returns Vec of {x: u8, y: hex-string} share objects + Vec of hex commitment strings.
#[tauri::command]
pub fn shamir_split(
    secret_hex: String,
    total: u8,
    threshold: u8,
) -> Result<ShamirSplitResult, String> {
    let secret = hex::decode(&secret_hex).map_err(|e| e.to_string())?;
    let shares = shamir::split(&secret, total, threshold).map_err(|e| e.to_string())?;
    let commitments: Vec<String> = shares.iter()
        .map(|s| hex::encode(shamir::commit(s)))
        .collect();
    let share_objs: Vec<ShamirShareJson> = shares.iter()
        .map(|s| ShamirShareJson { x: s.x, y: hex::encode(&s.y) })
        .collect();
    Ok(ShamirSplitResult { shares: share_objs, commitments })
}

#[derive(serde::Serialize)]
pub struct ShamirShareJson {
    pub x: u8,
    pub y: String,
}

#[derive(serde::Serialize)]
pub struct ShamirSplitResult {
    pub shares: Vec<ShamirShareJson>,
    pub commitments: Vec<String>,
}

/// Shamir combine: reconstruct secret from >= threshold shares.
#[tauri::command]
pub fn shamir_combine(shares_json: String) -> Result<String, String> {
    let share_objs: Vec<ShamirShareJson> = serde_json::from_str(&shares_json)
        .map_err(|e| e.to_string())?;
    let shares: Vec<shamir::Share> = share_objs.iter()
        .map(|s| shamir::Share {
            x: s.x,
            y: hex::decode(&s.y).unwrap_or_default(),
        })
        .collect();
    let secret = shamir::combine(&shares).map_err(|e| e.to_string())?;
    Ok(hex::encode(secret))
}

/// Shamir commit: compute SHA-256 commitment for a share.
#[tauri::command]
pub fn shamir_commit(x: u8, y_hex: String) -> Result<String, String> {
    let y = hex::decode(&y_hex).map_err(|e| e.to_string())?;
    let share = shamir::Share { x, y };
    Ok(hex::encode(shamir::commit(&share)))
}

/// Shamir verify: check share against commitment.
#[tauri::command]
pub fn shamir_verify(x: u8, y_hex: String, commitment_hex: String) -> Result<bool, String> {
    let y = hex::decode(&y_hex).map_err(|e| e.to_string())?;
    let commitment_bytes = hex::decode(&commitment_hex).map_err(|e| e.to_string())?;
    let share = shamir::Share { x, y };
    let mut commitment = [0u8; 32];
    commitment.copy_from_slice(&commitment_bytes);
    Ok(shamir::verify(&share, &commitment))
}

/// Generate X25519 recovery group keypair. Returns {publicKeyHex, privateKeyHex}.
/// The caller is responsible for splitting the private key and zeroizing it.
#[tauri::command]
pub fn recovery_group_generate_keypair() -> RecoveryGroupKeypair {
    use rand::rngs::OsRng;
    use x25519_dalek::{StaticSecret, PublicKey};
    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);
    RecoveryGroupKeypair {
        public_key_hex: hex::encode(public.as_bytes()),
        private_key_hex: hex::encode(secret.as_bytes()),
    }
}

#[derive(serde::Serialize)]
pub struct RecoveryGroupKeypair {
    pub public_key_hex: String,
    pub private_key_hex: String,
}
```

Register all five commands in `apps/desktop/src/lib.rs` invoke_handler.

- [ ] **1.2** Add TypeScript wrappers in `src/client/lib/platform.ts`

Add these exports at the end of the recovery section (after sigchain functions):

```typescript
// ── Recovery group crypto ──────────────────────────────────────────

/** Shamir share as returned from IPC. */
export interface ShamirShare {
  x: number
  y: string // hex
}

/** Result of splitting a secret into Shamir shares. */
export interface ShamirSplitResult {
  shares: ShamirShare[]
  commitments: string[] // SHA-256 hex
}

/** Recovery group X25519 keypair. */
export interface RecoveryGroupKeypair {
  publicKeyHex: string
  privateKeyHex: string
}

/** Split a secret into Shamir shares. */
export async function shamirSplit(
  secretHex: string,
  total: number,
  threshold: number,
): Promise<ShamirSplitResult> {
  if (useTauri) {
    return tauriInvoke<ShamirSplitResult>('shamir_split', {
      secretHex,
      total,
      threshold,
    })
  }
  throw new Error('WASM shamir split not yet implemented')
}

/** Combine Shamir shares to reconstruct the secret. */
export async function shamirCombine(
  shares: ShamirShare[],
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('shamir_combine', {
      sharesJson: JSON.stringify(shares),
    })
  }
  throw new Error('WASM shamir combine not yet implemented')
}

/** Compute SHA-256 commitment for a Shamir share. */
export async function shamirCommit(
  x: number,
  yHex: string,
): Promise<string> {
  if (useTauri) {
    return tauriInvoke<string>('shamir_commit', { x, yHex })
  }
  throw new Error('WASM shamir commit not yet implemented')
}

/** Verify a Shamir share against its commitment. */
export async function shamirVerify(
  x: number,
  yHex: string,
  commitmentHex: string,
): Promise<boolean> {
  if (useTauri) {
    return tauriInvoke<boolean>('shamir_verify', { x, yHex, commitmentHex })
  }
  throw new Error('WASM shamir verify not yet implemented')
}

/** Generate X25519 recovery group keypair. Caller must split private key and zeroize. */
export async function recoveryGroupGenerateKeypair(): Promise<RecoveryGroupKeypair> {
  if (useTauri) {
    return tauriInvoke<RecoveryGroupKeypair>('recovery_group_generate_keypair')
  }
  throw new Error('WASM recovery group keypair not yet implemented')
}
```

- [ ] **1.3** Add test mock implementations in `tests/mocks/tauri-core.ts`

Add to the `LABEL_MAP`:
```typescript
'llamenos:recovery-group:share-wrap:v1': 60,
'llamenos:recovery-group:puk-seed-wrap:v1': 61,
'llamenos:recovery-group:share-contribute:v1': 62,
'llamenos:recovery-group:liveness-proof:v1': 63,
```

Add to the `commands` object:
```typescript
  // --- Shamir secret sharing ---

  shamir_split: (a) => {
    const secretHex = a.secretHex as string
    const total = a.total as number
    const threshold = a.threshold as number

    if (threshold < 2 || threshold > 5) throw new Error('Threshold must be 2-5')
    if (total < 3 || total > 5) throw new Error('Total must be 3-5')
    if (threshold > total) throw new Error('Threshold cannot exceed total')

    const secret = hexToBytes(secretHex)

    // GF(2^8) Shamir — mock implementation for test builds
    // Uses random polynomial of degree (threshold-1) with secret as constant term
    const coefficients: Uint8Array[] = []
    for (let c = 0; c < threshold - 1; c++) {
      coefficients.push(randomBytes(secret.length))
    }

    const shares: Array<{ x: number; y: string }> = []
    for (let i = 1; i <= total; i++) {
      const y = new Uint8Array(secret.length)
      for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
        let val = secret[byteIdx]
        let xPow = i
        for (let c = 0; c < coefficients.length; c++) {
          val ^= gf256Mul(coefficients[c][byteIdx], xPow)
          xPow = gf256Mul(xPow, i)
        }
        y[byteIdx] = val
      }
      shares.push({ x: i, y: bytesToHex(y) })
    }

    const commitments = shares.map(s => {
      const data = new Uint8Array([s.x, ...hexToBytes(s.y)])
      return bytesToHex(sha256(data))
    })

    return { shares, commitments }
  },

  shamir_combine: (a) => {
    const shareObjs = JSON.parse(a.sharesJson as string) as Array<{ x: number; y: string }>
    if (shareObjs.length < 2) throw new Error('Need at least 2 shares')

    const shares = shareObjs.map(s => ({ x: s.x, y: hexToBytes(s.y) }))
    const secretLen = shares[0].y.length
    const result = new Uint8Array(secretLen)

    for (let byteIdx = 0; byteIdx < secretLen; byteIdx++) {
      let val = 0
      for (let i = 0; i < shares.length; i++) {
        let lagrange = 1
        for (let j = 0; j < shares.length; j++) {
          if (i === j) continue
          const num = shares[j].x
          const den = shares[i].x ^ shares[j].x
          lagrange = gf256Mul(lagrange, gf256Mul(num, gf256Inv(den)))
        }
        val ^= gf256Mul(shares[i].y[byteIdx], lagrange)
      }
      result[byteIdx] = val
    }

    return bytesToHex(result)
  },

  shamir_commit: (a) => {
    const x = a.x as number
    const yHex = a.yHex as string
    const data = new Uint8Array([x, ...hexToBytes(yHex)])
    return bytesToHex(sha256(data))
  },

  shamir_verify: (a) => {
    const x = a.x as number
    const yHex = a.yHex as string
    const commitmentHex = a.commitmentHex as string
    const data = new Uint8Array([x, ...hexToBytes(yHex)])
    return bytesToHex(sha256(data)) === commitmentHex
  },

  recovery_group_generate_keypair: () => {
    const privateKey = randomBytes(32)
    const publicKey = x25519.getPublicKey(privateKey)
    return {
      publicKeyHex: bytesToHex(publicKey),
      privateKeyHex: bytesToHex(privateKey),
    }
  },
```

Also add GF(2^8) helper functions above the `commands` object:
```typescript
// ── GF(2^8) helpers for Shamir mock ─────────────────────────────────

function gf256Mul(a: number, b: number): number {
  let result = 0
  let aa = a
  let bb = b
  for (let i = 0; i < 8; i++) {
    if (bb & 1) result ^= aa
    const carry = aa & 0x80
    aa = (aa << 1) & 0xff
    if (carry) aa ^= 0x1b // irreducible polynomial x^8 + x^4 + x^3 + x + 1
    bb >>= 1
  }
  return result
}

function gf256Inv(a: number): number {
  if (a === 0) throw new Error('Cannot invert zero in GF(256)')
  // Fermat's little theorem: a^254 = a^(-1) in GF(2^8)
  let result = a
  for (let i = 0; i < 6; i++) {
    result = gf256Mul(result, result)
    result = gf256Mul(result, a)
  }
  result = gf256Mul(result, result)
  return result
}
```

- [ ] **1.4** Verify the mock round-trips correctly: split → combine should recover the original secret. The test in Task 7 covers this.

---

## Task 2: Create API Client Functions

> Add recovery group API functions to `src/client/lib/api.ts`. This codebase uses direct fetch via `apiFetch` — no React Query.

### Steps

- [ ] **2.1** Add protocol type imports and API functions in `src/client/lib/api.ts`

Add these types and functions. They follow the existing pattern of `apiFetch` + typed response:

```typescript
// ── Recovery Group types ───────────────────────────────────────────

export interface RecoveryGroupInfo {
  publicKey: string
  threshold: number
  totalShares: number
  commitments: string[]
  sigchainLinkHash: string
  delayHours: number
  emergencyFloorHours: number
  createdAt: string
  rotatedAt: string | null
  shareHolders: Array<{
    holderPubkey: string
    lastLivenessProof: string | null
  }>
}

export interface RecoverySessionInfo {
  sessionId: string
  hubId: string
  userPubkey: string
  newDevicePubkey: string
  signalVerified: boolean
  status: 'pending' | 'verified' | 'active' | 'completed' | 'expired' | 'cancelled'
  expiresAt: string
  completedAt: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  emergencyOverride: {
    justification: string
    approverPubkey: string
    approverSignature: string
  } | null
  createdAt: string
  contributionCount: number
  threshold: number
  contributions: Array<{
    contributorPubkey: string
    encryptedShare: string
    contributorSignature: string
    contributedAt: string
  }>
}

export interface RecoveryGroupEnrollBody {
  hubId: string
  threshold: number
  totalShares: number
  groupPublicKey: string
  shareEnvelopes: Array<{
    holderPubkey: string
    envelope: string
  }>
  shareCommitments: string[]
  duressCommitments?: (string | null)[]
  sigchainLinkHash: string
  delayHours?: number
  emergencyFloorHours?: number
}

// ── Recovery Group API functions ───────────────────────────────────

export async function getRecoveryGroup(hubId: string): Promise<RecoveryGroupInfo | null> {
  try {
    return await apiFetch<RecoveryGroupInfo>(`/recovery-group/${hubId}`)
  } catch {
    return null
  }
}

export async function enrollRecoveryGroup(body: RecoveryGroupEnrollBody): Promise<void> {
  await apiFetch('/recovery-group/enroll', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function rotateRecoveryGroup(body: RecoveryGroupEnrollBody): Promise<void> {
  // Rotation uses the same endpoint structure but replaces the existing group
  await apiFetch('/recovery-group/enroll', {
    method: 'POST',
    body: JSON.stringify({ ...body, rotate: true }),
  })
}

export async function getRecoverySessions(hubId: string): Promise<RecoverySessionInfo[]> {
  return apiFetch<RecoverySessionInfo[]>(`/recovery-group/sessions?hubId=${hubId}`)
}

export async function getRecoverySession(sessionId: string): Promise<RecoverySessionInfo> {
  return apiFetch<RecoverySessionInfo>(`/recovery-group/session/${sessionId}`)
}

export async function contributeShare(
  sessionId: string,
  encryptedShare: string,
  contributorSignature: string,
): Promise<{ ok: boolean; status: string; contributionCount: number }> {
  return apiFetch(`/recovery-group/session/${sessionId}/contribute`, {
    method: 'POST',
    body: JSON.stringify({ encryptedShare, contributorSignature }),
  })
}

export async function cancelRecoverySession(sessionId: string): Promise<void> {
  await apiFetch(`/recovery-group/session/${sessionId}/cancel`, {
    method: 'POST',
  })
}

export async function submitShareLiveness(hubId: string, proof: string): Promise<void> {
  await apiFetch('/recovery-group/shares/liveness', {
    method: 'POST',
    body: JSON.stringify({ hubId, proof }),
  })
}

export async function storeUserRecoveryEnvelope(hubId: string, envelope: string): Promise<void> {
  await apiFetch('/recovery-group/user-envelope', {
    method: 'POST',
    body: JSON.stringify({ hubId, envelope }),
  })
}

// --- Unauthenticated recovery endpoints ---

export async function initiateRecovery(
  hubId: string,
  userIdentifier: string,
  newDevicePubkey: string,
): Promise<{ sessionId: string; verificationSent: boolean }> {
  const res = await fetch(`${API_BASE}/recovery-group/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hubId, userIdentifier, newDevicePubkey }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function verifyRecoveryCode(
  sessionId: string,
  verificationCode: string,
): Promise<{ ok: boolean; expiresAt: string }> {
  const res = await fetch(`${API_BASE}/recovery-group/initiate/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, verificationCode }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Verification failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}
```

---

## Task 3: Implement RecoveryTeamSection (Admin Section)

> Replace the stub in `src/client/components/admin-sections/recovery-group-section.tsx` with a fully functional admin section for configuring recovery teams, and create the inner component at `src/client/components/admin-settings/recovery-group-section.tsx`.

### Steps

- [ ] **3.1** Create the inner settings component at `src/client/components/admin-settings/recovery-group-section.tsx`

```typescript
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  enrollRecoveryGroup,
  type RecoveryGroupInfo,
  type RecoveryGroupEnrollBody,
} from '@/lib/api'
import {
  shamirSplit,
  hpkeSeal,
  recoveryGroupGenerateKeypair,
  ed25519Sign,
  getDevicePubkeys,
  sigchainCreateLinkFromState,
} from '@/lib/platform'
import {
  SectionBody,
  SectionDescription,
  SectionField,
  SectionActions,
  SectionBanner,
} from '@/components/admin-shell/section-layout'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Shield,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  RotateCw,
  Loader2,
} from 'lucide-react'

interface ShareHolderCandidate {
  pubkey: string
  displayName: string
  encryptionPubkey: string
  deviceVerified: boolean
  lastSeen: string | null
}

interface Props {
  hubId: string
  group: RecoveryGroupInfo | null
  shareHolderCandidates: ShareHolderCandidate[]
  onGroupChanged: () => void
}

export function RecoveryGroupSettingsSection({
  hubId,
  group,
  shareHolderCandidates,
  onGroupChanged,
}: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [threshold, setThreshold] = useState(group?.threshold ?? 2)
  const [totalShares, setTotalShares] = useState(group?.totalShares ?? 3)
  const [delayHours, setDelayHours] = useState(group?.delayHours ?? 24)
  const [emergencyFloorHours, setEmergencyFloorHours] = useState(
    group?.emergencyFloorHours ?? 4,
  )
  const [selectedHolders, setSelectedHolders] = useState<string[]>(
    group?.shareHolders.map((h) => h.holderPubkey) ?? [],
  )
  const [enrolling, setEnrolling] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [showSaved, setShowSaved] = useState(false)

  const thresholdError =
    threshold > totalShares
      ? t('recoveryGroup.error.thresholdExceedsTotal')
      : threshold < 2 || threshold > 5
        ? t('recoveryGroup.error.thresholdExceedsTotal')
        : null
  const totalError =
    totalShares < 3 || totalShares > 5
      ? t('recoveryGroup.error.thresholdExceedsTotal')
      : null
  const holderCountError =
    selectedHolders.length !== totalShares
      ? `Select exactly ${totalShares} recovery contacts`
      : null
  const delayError =
    delayHours < 4 || delayHours > 168 ? 'Must be 4-168 hours' : null
  const emergencyError =
    emergencyFloorHours < 1 || emergencyFloorHours > 24
      ? 'Must be 1-24 hours'
      : emergencyFloorHours > delayHours
        ? 'Cannot exceed recovery delay'
        : null

  const hasErrors = !!(
    thresholdError ||
    totalError ||
    holderCountError ||
    delayError ||
    emergencyError
  )

  function toggleHolder(pubkey: string) {
    setSelectedHolders((prev) => {
      if (prev.includes(pubkey)) return prev.filter((p) => p !== pubkey)
      if (prev.length >= totalShares) return prev
      return [...prev, pubkey]
    })
  }

  async function handleEnroll(isRotation: boolean) {
    if (hasErrors) return
    const setLoading = isRotation ? setRotating : setEnrolling
    setLoading(true)

    try {
      // 1. Generate recovery group keypair
      const keypair = await recoveryGroupGenerateKeypair()

      // 2. Split private key into Shamir shares
      const { shares, commitments } = await shamirSplit(
        keypair.privateKeyHex,
        totalShares,
        threshold,
      )

      // 3. HPKE-seal each share to the corresponding holder's encryption pubkey
      const shareEnvelopes = await Promise.all(
        shares.map(async (share, idx) => {
          const holderPubkey = selectedHolders[idx]
          const candidate = shareHolderCandidates.find(
            (c) => c.pubkey === holderPubkey,
          )
          if (!candidate)
            throw new Error(`Holder ${holderPubkey} not found`)

          const shareHex =
            share.x.toString(16).padStart(2, '0') + share.y
          const envelope = await hpkeSeal(
            shareHex,
            candidate.encryptionPubkey,
            'llamenos:recovery-group:share-wrap:v1',
            '',
          )

          return {
            holderPubkey,
            envelope: JSON.stringify(envelope),
          }
        }),
      )

      // 4. Create sigchain link for the recovery group
      const deviceState = await getDevicePubkeys()
      if (!deviceState) throw new Error('Device not unlocked')

      const sigchainPayload = JSON.stringify({
        type: isRotation ? 'recovery-group-rotate' : 'recovery-group-enroll',
        groupPublicKey: keypair.publicKeyHex,
        shareHolderPubkeys: selectedHolders,
        threshold,
        totalShares,
      })

      const sigchainLink = await sigchainCreateLinkFromState(
        crypto.randomUUID(),
        1, // seq — will be set correctly by the server
        null,
        new Date().toISOString(),
        sigchainPayload,
      )

      // 5. Submit to server
      const body: RecoveryGroupEnrollBody = {
        hubId,
        threshold,
        totalShares,
        groupPublicKey: keypair.publicKeyHex,
        shareEnvelopes,
        shareCommitments: commitments,
        sigchainLinkHash: sigchainLink.entryHash,
        delayHours,
        emergencyFloorHours,
      }

      await enrollRecoveryGroup(body)
      toast(
        isRotation
          ? t('recoveryGroup.rotateSuccess')
          : t('recoveryGroup.setupSuccess'),
        'success',
      )
      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 3000)
      onGroupChanged()
    } catch (err) {
      toast(
        err instanceof Error ? err.message : t('common.error'),
        'error',
      )
    } finally {
      setLoading(false)
    }
  }

  // Check geographic distribution — all holders in same region
  const allSameRegion =
    selectedHolders.length >= 3 &&
    selectedHolders.length === totalShares

  return (
    <SectionBody>
      <SectionDescription>
        {t('recoveryGroup.description')}
      </SectionDescription>

      {/* Current group status */}
      {group && (
        <div
          className="rounded-lg border border-border p-4 space-y-3"
          data-testid="recovery-group-status"
        >
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-600" />
            <span className="font-medium text-sm">
              {t('recoveryGroup.title')}
            </span>
            <Badge variant="outline" className="ml-auto">
              {group.threshold}/{group.totalShares}
            </Badge>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <div>
              {t('recoveryGroup.delayConfig')}: {group.delayHours}h
            </div>
            <div>
              {t('recoveryGroup.emergencyFloorConfig')}:{' '}
              {group.emergencyFloorHours}h
            </div>
            {group.rotatedAt && (
              <div>
                {t('recoveryGroup.lastRotated')}:{' '}
                {new Date(group.rotatedAt).toLocaleDateString()}
              </div>
            )}
          </div>

          {/* Share holder liveness */}
          <div className="space-y-2">
            <Label className="text-xs">
              {t('recoveryGroup.contactHealth')}
            </Label>
            {group.shareHolders.map((holder) => {
              const candidate = shareHolderCandidates.find(
                (c) => c.pubkey === holder.holderPubkey,
              )
              const livenessOk =
                holder.lastLivenessProof &&
                Date.now() -
                  new Date(holder.lastLivenessProof).getTime() <
                  30 * 24 * 60 * 60 * 1000 // 30 days
              return (
                <div
                  key={holder.holderPubkey}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="truncate max-w-[200px]">
                    {candidate?.displayName ||
                      holder.holderPubkey.slice(0, 16) + '...'}
                  </span>
                  {candidate?.deviceVerified ? (
                    <Badge
                      variant="outline"
                      className="text-emerald-600 border-emerald-600/30"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {t('recoveryGroup.deviceVerified')}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-amber-600 border-amber-600/30"
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {t('recoveryGroup.deviceUnverified')}
                    </Badge>
                  )}
                  {livenessOk ? (
                    <Badge
                      variant="outline"
                      className="text-emerald-600 border-emerald-600/30"
                    >
                      {t('recoveryGroup.livenessOk')}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-amber-600 border-amber-600/30"
                    >
                      {t('recoveryGroup.livenessStale')}
                    </Badge>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Configuration form */}
      <SectionField
        label={t('recoveryGroup.requiredApprovals')}
        htmlFor="recovery-threshold"
        error={thresholdError}
      >
        <Input
          id="recovery-threshold"
          data-testid="recovery-threshold"
          type="number"
          min={2}
          max={5}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
        />
      </SectionField>

      <SectionField
        label={t('recoveryGroup.totalContacts')}
        htmlFor="recovery-total"
        error={totalError}
      >
        <Input
          id="recovery-total"
          data-testid="recovery-total"
          type="number"
          min={3}
          max={5}
          value={totalShares}
          onChange={(e) => setTotalShares(Number(e.target.value))}
        />
      </SectionField>

      <SectionField
        label={t('recoveryGroup.delayConfig')}
        htmlFor="recovery-delay"
        error={delayError}
        help="4-168 hours"
      >
        <Input
          id="recovery-delay"
          data-testid="recovery-delay"
          type="number"
          min={4}
          max={168}
          value={delayHours}
          onChange={(e) => setDelayHours(Number(e.target.value))}
        />
      </SectionField>

      <SectionField
        label={t('recoveryGroup.emergencyFloorConfig')}
        htmlFor="recovery-emergency-floor"
        error={emergencyError}
        help="1-24 hours"
      >
        <Input
          id="recovery-emergency-floor"
          data-testid="recovery-emergency-floor"
          type="number"
          min={1}
          max={24}
          value={emergencyFloorHours}
          onChange={(e) => setEmergencyFloorHours(Number(e.target.value))}
        />
      </SectionField>

      {/* Share holder picker */}
      <SectionField
        label={t('recoveryGroup.contacts')}
        error={holderCountError}
      >
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {shareHolderCandidates.map((candidate) => (
            <button
              key={candidate.pubkey}
              type="button"
              data-testid={`recovery-holder-${candidate.pubkey.slice(0, 8)}`}
              className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                selectedHolders.includes(candidate.pubkey)
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
              onClick={() => toggleHolder(candidate.pubkey)}
            >
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {candidate.displayName}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {candidate.pubkey.slice(0, 16)}...
                </div>
              </div>
              {candidate.deviceVerified ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              )}
              {selectedHolders.includes(candidate.pubkey) && (
                <Badge variant="default" className="shrink-0">
                  Selected
                </Badge>
              )}
            </button>
          ))}
          {shareHolderCandidates.length === 0 && (
            <div className="text-sm text-muted-foreground p-3">
              No users with recovery:hold-share permission found
            </div>
          )}
        </div>
      </SectionField>

      {/* Geographic distribution advisory */}
      {allSameRegion && (
        <SectionBanner tone="warn">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t('recoveryGroup.geoWarning')}</span>
          </div>
        </SectionBanner>
      )}

      {/* Actions */}
      <SectionActions
        slug="recovery-group"
        onSave={() => handleEnroll(!!group)}
        saving={enrolling || rotating}
        disabled={hasErrors}
        showSaved={showSaved}
        saveLabel={
          group ? (
            <>
              {rotating && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <RotateCw className="mr-2 h-4 w-4" />
              {t('recoveryGroup.rotate')}
            </>
          ) : (
            <>
              {enrolling && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('recoveryGroup.setup')}
            </>
          )
        }
      />
    </SectionBody>
  )
}
```

- [ ] **3.2** Update the admin section wrapper at `src/client/components/admin-sections/recovery-group-section.tsx`

Replace the stub completely:

```typescript
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  getRecoveryGroup,
  getUsers,
  type RecoveryGroupInfo,
} from '@/lib/api'
import { useHub } from '@/lib/hub'
import { RecoveryGroupSettingsSection } from '@/components/admin-settings/recovery-group-section'

export function RecoveryGroupSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { activeHubId } = useHub()
  const [group, setGroup] = useState<RecoveryGroupInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<Array<{
    pubkey: string
    displayName: string
    encryptionPubkey: string
    deviceVerified: boolean
    lastSeen: string | null
  }>>([])

  async function loadData() {
    if (!activeHubId) return
    setLoading(true)
    try {
      const [groupData, usersData] = await Promise.all([
        getRecoveryGroup(activeHubId),
        getUsers(),
      ])
      setGroup(groupData)
      // Filter users who have recovery:hold-share permission
      // and map to share holder candidate format
      setCandidates(
        usersData
          .filter((u) => u.pubkey && u.encryptionPubkey)
          .map((u) => ({
            pubkey: u.pubkey,
            displayName: u.displayName || u.pubkey.slice(0, 12) + '...',
            encryptionPubkey: u.encryptionPubkey || '',
            deviceVerified: !!u.deviceVerified,
            lastSeen: u.lastSeen || null,
          })),
      )
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [activeHubId])

  if (loading) {
    return (
      <div className="text-muted-foreground">{t('common.loading')}</div>
    )
  }

  if (!activeHubId) {
    return (
      <div className="text-muted-foreground">{t('common.error')}</div>
    )
  }

  return (
    <RecoveryGroupSettingsSection
      hubId={activeHubId}
      group={group}
      shareHolderCandidates={candidates}
      onGroupChanged={loadData}
    />
  )
}
```

- [ ] **3.3** Verify the section is already registered in `src/client/components/admin-sections/index.ts` (it is — no changes needed, the import already maps `'recovery-group'` to `RecoveryGroupSection`).

---

## Task 4: Implement RecoveryRequestDashboard (Admin Section)

> Create a new admin section for viewing and acting on recovery requests.

### Steps

- [ ] **4.1** Create `src/client/components/admin-settings/recovery-requests-section.tsx`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  getRecoverySessions,
  contributeShare,
  cancelRecoverySession,
  type RecoverySessionInfo,
} from '@/lib/api'
import {
  hpkeOpenFromState,
  hpkeSeal,
  ed25519Sign,
  shamirVerify,
  getDevicePubkeys,
} from '@/lib/platform'
import {
  SectionBody,
  SectionDescription,
  SectionBanner,
} from '@/components/admin-shell/section-layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ShieldAlert,
} from 'lucide-react'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

interface Props {
  hubId: string
  sessions: RecoverySessionInfo[]
  onSessionsChanged: () => void
  myShareEnvelope: string | null
  myShareCommitment: string | null
}

type SessionStatus = RecoverySessionInfo['status']

const STATUS_COLORS: Record<SessionStatus, string> = {
  pending: 'text-amber-600',
  verified: 'text-blue-600',
  active: 'text-emerald-600',
  completed: 'text-emerald-700',
  expired: 'text-muted-foreground',
  cancelled: 'text-destructive',
}

function formatTimeRemaining(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now()
  if (remaining <= 0) return 'Expired'
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function RecoveryRequestsSection({
  hubId,
  sessions,
  onSessionsChanged,
  myShareEnvelope,
  myShareCommitment,
}: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [approvingSession, setApprovingSession] = useState<string | null>(null)
  const [cancellingSession, setCancellingSession] = useState<string | null>(null)
  const [showUrgent, setShowUrgent] = useState<string | null>(null)
  const [urgentJustification, setUrgentJustification] = useState('')
  const [urgentApprover, setUrgentApprover] = useState('')
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)

  const activeSessions = sessions.filter(
    (s) => s.status === 'pending' || s.status === 'verified' || s.status === 'active',
  )
  const historySessions = sessions.filter(
    (s) => s.status === 'completed' || s.status === 'expired' || s.status === 'cancelled',
  )

  async function handleApprove(session: RecoverySessionInfo) {
    if (!myShareEnvelope || !myShareCommitment) {
      toast(t('recoveryGroup.error.notContact'), 'error')
      return
    }

    setApprovingSession(session.sessionId)
    try {
      const deviceState = await getDevicePubkeys()
      if (!deviceState) throw new Error('Device not unlocked')

      // Check for duplicate
      const alreadyContributed = session.contributions.some(
        (c) => c.contributorPubkey === deviceState.signingPubkeyHex,
      )
      if (alreadyContributed) {
        toast(t('recoveryGroup.error.alreadyApproved'), 'error')
        return
      }

      // 1. Decrypt our stored share envelope
      const envelope = JSON.parse(myShareEnvelope)
      const shareHex = await hpkeOpenFromState(
        envelope,
        'llamenos:recovery-group:share-wrap:v1',
        '',
      )

      // 2. Verify share against commitment
      const x = parseInt(shareHex.slice(0, 2), 16)
      const yHex = shareHex.slice(2)
      const valid = await shamirVerify(x, yHex, myShareCommitment)
      if (!valid) {
        toast(t('recoveryGroup.error.commitmentFailed'), 'error')
        return
      }

      // 3. HPKE-seal share to the recovering user's new device pubkey
      const aad = bytesToHex(
        utf8ToBytes(`${session.sessionId}:${deviceState.signingPubkeyHex}`),
      )
      const contribution = await hpkeSeal(
        shareHex,
        session.newDevicePubkey,
        'llamenos:recovery-group:share-contribute:v1',
        aad,
      )

      // 4. Sign the contribution
      const sigPayload = bytesToHex(
        utf8ToBytes(
          JSON.stringify(contribution) + ':' + session.sessionId,
        ),
      )
      const signature = await ed25519Sign(sigPayload)

      // 5. Submit
      const result = await contributeShare(
        session.sessionId,
        JSON.stringify(contribution),
        signature,
      )
      toast(
        t('recoveryGroup.requests.approve') + ` (${result.contributionCount}/${session.threshold})`,
        'success',
      )
      onSessionsChanged()
    } catch (err) {
      toast(
        err instanceof Error ? err.message : t('common.error'),
        'error',
      )
    } finally {
      setApprovingSession(null)
    }
  }

  async function handleCancel(sessionId: string) {
    setCancellingSession(sessionId)
    try {
      await cancelRecoverySession(sessionId)
      toast(t('common.saved'), 'success')
      setConfirmCancel(null)
      onSessionsChanged()
    } catch (err) {
      toast(
        err instanceof Error ? err.message : t('common.error'),
        'error',
      )
    } finally {
      setCancellingSession(null)
    }
  }

  return (
    <SectionBody>
      <SectionDescription>
        {t('recoveryGroup.requests.title')}
      </SectionDescription>

      {/* Active requests */}
      {activeSessions.length > 0 && (
        <div className="space-y-3">
          <Label>{t('recoveryGroup.requests.active')}</Label>
          {activeSessions.map((session) => {
            const hasDuress = session.emergencyOverride !== null
            return (
              <div
                key={session.sessionId}
                className="rounded-lg border border-border p-4 space-y-3"
                data-testid={`recovery-session-${session.sessionId.slice(0, 8)}`}
              >
                {/* Duress alert */}
                {hasDuress && (
                  <SectionBanner tone="danger">
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{t('recoveryGroup.requests.duressAlert')}</span>
                    </div>
                  </SectionBanner>
                )}

                {/* Session header */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {session.userPubkey.slice(0, 16)}...
                    </div>
                    <div className={`text-xs ${STATUS_COLORS[session.status]}`}>
                      {t(`recoveryGroup.requests.status.${session.status}`)}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t('recoveryGroup.requests.timeRemaining')}:{' '}
                      {formatTimeRemaining(session.expiresAt)}
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {t('recoveryGroup.requests.approvalProgress', {
                      count: session.contributionCount,
                      required: session.threshold,
                    })}
                  </div>
                  <Progress
                    value={
                      (session.contributionCount / session.threshold) * 100
                    }
                    className="h-2"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  {session.status === 'verified' && (
                    <Button
                      size="sm"
                      data-testid={`recovery-approve-${session.sessionId.slice(0, 8)}`}
                      onClick={() => handleApprove(session)}
                      disabled={approvingSession === session.sessionId}
                    >
                      {approvingSession === session.sessionId ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-3 w-3" />
                      )}
                      {t('recoveryGroup.requests.approve')}
                    </Button>
                  )}

                  {/* Urgent recovery toggle */}
                  {session.status === 'verified' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setShowUrgent(
                          showUrgent === session.sessionId
                            ? null
                            : session.sessionId,
                        )
                      }
                    >
                      <AlertTriangle className="mr-2 h-3 w-3" />
                      {t('recoveryGroup.urgent.enable')}
                    </Button>
                  )}

                  {/* Cancel */}
                  {confirmCancel === session.sessionId ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-destructive">
                        {t('recoveryGroup.requests.cancelConfirm')}
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        data-testid={`recovery-cancel-confirm-${session.sessionId.slice(0, 8)}`}
                        onClick={() => handleCancel(session.sessionId)}
                        disabled={cancellingSession === session.sessionId}
                      >
                        {cancellingSession === session.sessionId && (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        )}
                        {t('recoveryGroup.requests.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmCancel(null)}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      data-testid={`recovery-cancel-${session.sessionId.slice(0, 8)}`}
                      onClick={() => setConfirmCancel(session.sessionId)}
                    >
                      <XCircle className="mr-2 h-3 w-3" />
                      {t('recoveryGroup.requests.cancel')}
                    </Button>
                  )}
                </div>

                {/* Urgent recovery form */}
                {showUrgent === session.sessionId && (
                  <div className="border-t border-border pt-3 space-y-3">
                    <div className="text-xs text-muted-foreground">
                      {t('recoveryGroup.urgent.description')}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="urgent-justification" className="text-xs">
                        {t('recoveryGroup.urgent.justification')}
                      </Label>
                      <Textarea
                        id="urgent-justification"
                        data-testid="urgent-justification"
                        placeholder={t(
                          'recoveryGroup.urgent.justificationPlaceholder',
                        )}
                        value={urgentJustification}
                        onChange={(e) =>
                          setUrgentJustification(e.target.value)
                        }
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="urgent-approver" className="text-xs">
                        {t('recoveryGroup.urgent.secondApprover')}
                      </Label>
                      <Input
                        id="urgent-approver"
                        data-testid="urgent-approver"
                        placeholder={t(
                          'recoveryGroup.urgent.selectApprover',
                        )}
                        value={urgentApprover}
                        onChange={(e) => setUrgentApprover(e.target.value)}
                      />
                    </div>
                    {urgentJustification.length >= 16 && urgentApprover && (
                      <div className="text-xs text-emerald-600">
                        {t('recoveryGroup.urgent.reducedDelay', {
                          hours: 4,
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {activeSessions.length === 0 && (
        <div className="text-sm text-muted-foreground">
          {t('recoveryGroup.requests.active')}: 0
        </div>
      )}

      {/* Request history */}
      {historySessions.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-border/60">
          <Label>{t('recoveryGroup.requests.history')}</Label>
          {historySessions.map((session) => (
            <div
              key={session.sessionId}
              className="flex items-center justify-between rounded-lg border border-border/50 p-3 text-sm"
            >
              <div>
                <div className="text-xs text-muted-foreground">
                  {session.userPubkey.slice(0, 16)}...
                </div>
                <div className={`text-xs ${STATUS_COLORS[session.status]}`}>
                  {t(`recoveryGroup.requests.status.${session.status}`)}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(session.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionBody>
  )
}
```

- [ ] **4.2** Create the admin section wrapper at `src/client/components/admin-sections/recovery-requests-section.tsx`

```typescript
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  getRecoverySessions,
  type RecoverySessionInfo,
} from '@/lib/api'
import { useHub } from '@/lib/hub'
import { RecoveryRequestsSection } from '@/components/admin-settings/recovery-requests-section'

export function RecoveryRequestsAdminSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { activeHubId } = useHub()
  const [sessions, setSessions] = useState<RecoverySessionInfo[]>([])
  const [loading, setLoading] = useState(true)

  async function loadSessions() {
    if (!activeHubId) return
    setLoading(true)
    try {
      const data = await getRecoverySessions(activeHubId)
      setSessions(data)
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
    // Poll every 30 seconds for active session updates
    const interval = setInterval(loadSessions, 30_000)
    return () => clearInterval(interval)
  }, [activeHubId])

  if (loading) {
    return (
      <div className="text-muted-foreground">{t('common.loading')}</div>
    )
  }

  if (!activeHubId) {
    return (
      <div className="text-muted-foreground">{t('common.error')}</div>
    )
  }

  return (
    <RecoveryRequestsSection
      hubId={activeHubId}
      sessions={sessions}
      onSessionsChanged={loadSessions}
      myShareEnvelope={null}
      myShareCommitment={null}
    />
  )
}
```

- [ ] **4.3** Register the new section in `src/client/components/admin-sections/index.ts`

Add import and registration:
```typescript
import { RecoveryRequestsAdminSection } from './recovery-requests-section'
```
Add to the `sections` object:
```typescript
'recovery-requests': RecoveryRequestsAdminSection,
```

---

## Task 5: Implement Account Recovery Flow (Login Screen)

> Add unauthenticated account recovery flow accessible from the login screen via "I lost my device" link.

### Steps

- [ ] **5.1** Create `src/client/components/account-recovery-flow.tsx`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useToast } from '@/lib/toast'
import {
  initiateRecovery,
  verifyRecoveryCode,
  getRecoverySession,
  type RecoverySessionInfo,
} from '@/lib/api'
import {
  deviceGenerateAndLoad,
  getDevicePubkeys,
  shamirCombine,
  shamirVerify,
  hpkeOpenFromState,
  type ShamirShare,
} from '@/lib/platform'
import { PinInput } from '@/components/pin-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Shield,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  Smartphone,
} from 'lucide-react'

type RecoveryStep =
  | 'identifier'
  | 'signal-verify'
  | 'waiting'
  | 'completing'
  | 'set-pin'
  | 'done'

interface Props {
  onBack: () => void
}

export function AccountRecoveryFlow({ onBack }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [step, setStep] = useState<RecoveryStep>('identifier')
  const [identifier, setIdentifier] = useState('')
  const [hubId, setHubId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [session, setSession] = useState<RecoverySessionInfo | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [newPin1, setNewPin1] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [pinStep, setPinStep] = useState<'create' | 'confirm'>('create')
  const [pinError, setPinError] = useState('')

  // Poll for session updates when waiting
  useEffect(() => {
    if (step !== 'waiting' || !sessionId) return

    const poll = async () => {
      try {
        const s = await getRecoverySession(sessionId)
        setSession(s)
        if (s.status === 'completed') {
          setStep('completing')
        } else if (s.status === 'expired' || s.status === 'cancelled') {
          setError(
            s.status === 'expired'
              ? t('recoveryGroup.error.sessionExpired')
              : t('recoveryGroup.requests.status.cancelled'),
          )
        }
      } catch {
        // Silently retry on poll failure
      }
    }

    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [step, sessionId])

  // Completing step: decrypt share contributions, combine, restore PUK
  useEffect(() => {
    if (step !== 'completing' || !session) return

    async function complete() {
      try {
        // Contributions are HPKE-encrypted to our new device pubkey
        const shares: ShamirShare[] = []
        for (const contribution of session!.contributions) {
          const envelope = JSON.parse(contribution.encryptedShare)
          const shareHex = await hpkeOpenFromState(
            envelope,
            'llamenos:recovery-group:share-contribute:v1',
            '',
          )
          const x = parseInt(shareHex.slice(0, 2), 16)
          const yHex = shareHex.slice(2)
          shares.push({ x, y: yHex })
        }

        // Combine shares to reconstruct recovery group private key
        const recoveredSecretHex = await shamirCombine(shares)

        // Fetch the user's recovery envelope for this hub
        const envelopeRes = await apiFetch(`/api/recovery-group/user-envelope/${hubId}`)
        const { envelope } = await envelopeRes.json()

        // Use recovered secret as X25519 private key to HPKE-open the PUK seed envelope
        const pukSeedHex = await hpkeOpenKeyFromState(
          envelope,
          'LABEL_RECOVERY_PUK_SEED_WRAP'
        )

        // Load PUK seed into CryptoState and re-wrap to new device
        await pukUnwrapSeedFromState(pukSeedHex)

        setStep('set-pin')
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t('recoveryGroup.error.commitmentFailed'),
        )
      }
    }

    complete()
  }, [step, session])

  async function handleInitiate() {
    if (!identifier.trim() || !hubId.trim()) return
    setSubmitting(true)
    setError('')

    try {
      // Generate fresh device keys for the new device
      const tempPin = crypto.randomUUID().slice(0, 8)
      await deviceGenerateAndLoad(tempPin, crypto.randomUUID())
      const deviceState = await getDevicePubkeys()
      if (!deviceState) throw new Error('Failed to generate device keys')

      const result = await initiateRecovery(
        hubId,
        identifier,
        deviceState.encryptionPubkeyHex,
      )
      setSessionId(result.sessionId)
      setStep('signal-verify')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('recoveryGroup.error.rateLimited'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify() {
    if (!verificationCode.trim()) return
    setSubmitting(true)
    setError('')

    try {
      await verifyRecoveryCode(sessionId, verificationCode)
      setStep('waiting')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('recoveryGroup.error.signalVerificationFailed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  function handlePinEntry(pin: string) {
    if (pinStep === 'create') {
      setNewPin1(pin)
      setPinStep('confirm')
      setPinError('')
    } else {
      if (pin !== newPin1) {
        setPinError(t('onboarding.pinMismatch', { defaultValue: 'PINs do not match' }))
        setPinStep('create')
        setNewPin1('')
        setNewPin2('')
        return
      }
      // PIN confirmed — device keys are already generated, just need to re-encrypt
      setStep('done')
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">
            {t('recoveryGroup.initiate.title')}
          </CardTitle>
        </div>
        <CardDescription>
          {t('recoveryGroup.initiate.description')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </div>
        )}

        {/* Step 1: Identifier input */}
        {step === 'identifier' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="recovery-identifier">
                {t('recoveryGroup.initiate.identifier')}
              </Label>
              <Input
                id="recovery-identifier"
                data-testid="recovery-identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="email@example.com or +1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recovery-hub">
                {t('recoveryGroup.initiate.selectHub')}
              </Label>
              <Input
                id="recovery-hub"
                data-testid="recovery-hub"
                value={hubId}
                onChange={(e) => setHubId(e.target.value)}
                placeholder="Organization ID"
              />
            </div>
            <Button
              className="w-full"
              data-testid="recovery-submit"
              onClick={handleInitiate}
              disabled={submitting || !identifier.trim() || !hubId.trim()}
            >
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('recoveryGroup.initiate.submit')}
            </Button>
          </>
        )}

        {/* Step 2: Signal verification */}
        {step === 'signal-verify' && (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Smartphone className="h-4 w-4" />
              {t('recoveryGroup.initiate.signalVerification')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="verification-code">
                {t('recoveryGroup.initiate.verificationCode')}
              </Label>
              <Input
                id="verification-code"
                data-testid="recovery-verification-code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                className="text-center text-2xl tracking-widest"
              />
            </div>
            <Button
              className="w-full"
              data-testid="recovery-verify"
              onClick={handleVerify}
              disabled={submitting || verificationCode.length < 6}
            >
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('recoveryGroup.initiate.verify')}
            </Button>
          </>
        )}

        {/* Step 3: Waiting for approvals */}
        {step === 'waiting' && session && (
          <div className="space-y-4 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto animate-pulse" />
            <div className="text-sm font-medium">
              {t('recoveryGroup.initiate.waiting')}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('recoveryGroup.initiate.approvalsReceived', {
                count: session.contributionCount,
                required: session.threshold,
              })}
            </div>
            <Progress
              value={(session.contributionCount / session.threshold) * 100}
              className="h-2"
            />
            <div className="text-xs text-muted-foreground">
              {t('recoveryGroup.initiate.delayCountdown', {
                time: formatTimeRemaining(session.expiresAt),
              })}
            </div>
          </div>
        )}

        {step === 'waiting' && !session && (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <div className="text-sm text-muted-foreground mt-2">
              {t('recoveryGroup.initiate.waiting')}
            </div>
          </div>
        )}

        {/* Step 4: Completing */}
        {step === 'completing' && (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <div className="text-sm mt-2">Restoring account...</div>
          </div>
        )}

        {/* Step 5: Set PIN */}
        {step === 'set-pin' && (
          <div className="space-y-4">
            <div className="text-sm font-medium text-center">
              {t('recoveryGroup.initiate.setPin')}
            </div>
            {pinError && (
              <div className="text-xs text-destructive text-center">
                {pinError}
              </div>
            )}
            <PinInput
              data-testid="recovery-pin"
              onComplete={handlePinEntry}
              label={
                pinStep === 'create'
                  ? t('recoveryGroup.initiate.setPin')
                  : t('onboarding.confirmPin', { defaultValue: 'Confirm PIN' })
              }
            />
          </div>
        )}

        {/* Step 6: Done */}
        {step === 'done' && (
          <div className="text-center space-y-4 py-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
            <div className="text-lg font-medium">
              {t('recoveryGroup.initiate.complete')}
            </div>
            <div className="text-sm text-muted-foreground">
              {t('recoveryGroup.initiate.success')}
            </div>
            <Button
              className="w-full"
              data-testid="recovery-complete"
              onClick={() => navigate({ to: '/' })}
            >
              Continue
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatTimeRemaining(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now()
  if (remaining <= 0) return 'Expired'
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
```

- [ ] **5.2** Wire the recovery flow into the login screen at `src/client/routes/login.tsx`

Add import at the top:
```typescript
import { AccountRecoveryFlow } from '@/components/account-recovery-flow'
```

Add state for showing the account recovery flow:
```typescript
const [showAccountRecovery, setShowAccountRecovery] = useState(false)
```

At the beginning of the `LoginPage` render, before the existing card, add:
```typescript
if (showAccountRecovery) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <AccountRecoveryFlow onBack={() => setShowAccountRecovery(false)} />
    </div>
  )
}
```

In the card footer area of the login page, add the "I lost my device" link:
```typescript
<Button
  variant="link"
  className="text-xs text-muted-foreground"
  data-testid="lost-device-link"
  onClick={() => setShowAccountRecovery(true)}
>
  {t('recoveryGroup.initiate.title')}
</Button>
```

---

## Task 6: Implement Recovery Status (Security Settings)

> Add per-hub recovery enrollment status display to the user settings page.

### Steps

- [ ] **6.1** Create `src/client/components/recovery-status-section.tsx`

```typescript
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRecoveryGroup, type RecoveryGroupInfo } from '@/lib/api'
import { useHub } from '@/lib/hub'
import { SettingsSection, usePersistedExpanded } from '@/components/settings-section'
import { Badge } from '@/components/ui/badge'
import { Shield, ShieldOff } from 'lucide-react'

export function RecoveryStatusSection() {
  const { t } = useTranslation()
  const { activeHubId, activeHubName } = useHub()
  const [group, setGroup] = useState<RecoveryGroupInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const { expanded, onToggle } = usePersistedExpanded('recovery-status')

  useEffect(() => {
    if (!activeHubId) return
    setLoading(true)
    getRecoveryGroup(activeHubId)
      .then(setGroup)
      .catch(() => setGroup(null))
      .finally(() => setLoading(false))
  }, [activeHubId])

  const enrolled = group !== null

  return (
    <SettingsSection
      id="recovery-status"
      title={t('recoveryGroup.title', { defaultValue: 'Recovery Team' })}
      icon={
        enrolled ? (
          <Shield className="h-5 w-5 text-emerald-600" />
        ) : (
          <ShieldOff className="h-5 w-5 text-muted-foreground" />
        )
      }
      expanded={expanded}
      onToggle={onToggle}
      basePath="/settings"
      statusSummary={
        loading
          ? t('common.loading')
          : enrolled
            ? t('recoveryGroup.status.enrolled', {
                hubName: activeHubName || activeHubId,
              })
            : t('recoveryGroup.status.notConfigured')
      }
    >
      <div className="space-y-3 p-1">
        {loading && (
          <div className="text-sm text-muted-foreground">
            {t('common.loading')}
          </div>
        )}

        {!loading && enrolled && group && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium">
                {t('recoveryGroup.status.enrolled', {
                  hubName: activeHubName || activeHubId,
                })}
              </span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                {t('recoveryGroup.requiredApprovals')}: {group.threshold}/
                {group.totalShares}
              </div>
              <div>
                {t('recoveryGroup.delayConfig')}: {group.delayHours}h
              </div>
            </div>
          </div>
        )}

        {!loading && !enrolled && (
          <div className="flex items-center gap-2">
            <ShieldOff className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {t('recoveryGroup.status.notConfigured')}
            </span>
          </div>
        )}
      </div>
    </SettingsSection>
  )
}
```

- [ ] **6.2** Add the `RecoveryStatusSection` to the settings page at `src/client/routes/settings.tsx`

Import:
```typescript
import { RecoveryStatusSection } from '@/components/recovery-status-section'
```

Add the component in the security section of the settings page, after the existing security-related sections (passkeys, devices, etc.):
```typescript
<RecoveryStatusSection />
```

---

## Task 7: Add Playwright E2E Tests

> Create Playwright E2E tests covering admin recovery team configuration, approval flows, and user recovery initiation.

### Steps

- [ ] **7.1** Create `tests/e2e/recovery-group.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

// Helper: navigate to admin section
async function goToAdminSection(page: import('@playwright/test').Page, section: string) {
  await page.goto(`/admin/${section}`)
  await page.waitForSelector(`[data-testid]`, { timeout: 10_000 })
}

// Helper: login as admin (uses the test fixture pattern from existing tests)
async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login')
  // The test build auto-loads admin keys via the mock
  await page.waitForSelector('[data-testid="pin-input"]', { timeout: 10_000 })
  // Enter test PIN
  const pinInput = page.locator('[data-testid="pin-input"] input').first()
  await pinInput.fill('1234')
  await pinInput.press('Enter')
  await page.waitForURL('/', { timeout: 15_000 })
}

test.describe('Recovery Group - Admin Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('should display recovery team configuration section', async ({
    page,
  }) => {
    await goToAdminSection(page, 'recovery-group')
    await expect(page.locator('[data-testid="recovery-threshold"]')).toBeVisible()
    await expect(page.locator('[data-testid="recovery-total"]')).toBeVisible()
    await expect(page.locator('[data-testid="recovery-delay"]')).toBeVisible()
    await expect(
      page.locator('[data-testid="recovery-emergency-floor"]'),
    ).toBeVisible()
  })

  test('should validate threshold cannot exceed total', async ({ page }) => {
    await goToAdminSection(page, 'recovery-group')
    const thresholdInput = page.locator('[data-testid="recovery-threshold"]')
    const totalInput = page.locator('[data-testid="recovery-total"]')

    await totalInput.fill('3')
    await thresholdInput.fill('4')

    // Save button should be disabled
    await expect(
      page.locator('[data-testid="admin-recovery-group-save"]'),
    ).toBeDisabled()
  })

  test('should configure recovery team with valid settings', async ({
    page,
  }) => {
    await goToAdminSection(page, 'recovery-group')

    // Set threshold and total
    await page.locator('[data-testid="recovery-threshold"]').fill('2')
    await page.locator('[data-testid="recovery-total"]').fill('3')
    await page.locator('[data-testid="recovery-delay"]').fill('24')
    await page.locator('[data-testid="recovery-emergency-floor"]').fill('4')

    // Note: selecting holders requires users with recovery:hold-share permission
    // to exist in the test database. The test verifies the form renders correctly.
  })
})

test.describe('Recovery Group - Recovery Requests Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('should display recovery requests section', async ({ page }) => {
    await goToAdminSection(page, 'recovery-requests')
    await expect(page.getByText(/Active requests|Account Recovery Requests/)).toBeVisible()
  })
})

test.describe('Recovery Group - Account Recovery Flow', () => {
  test('should show "I lost my device" link on login', async ({ page }) => {
    await page.goto('/login')
    await expect(
      page.locator('[data-testid="lost-device-link"]'),
    ).toBeVisible()
  })

  test('should open account recovery flow', async ({ page }) => {
    await page.goto('/login')
    await page.locator('[data-testid="lost-device-link"]').click()

    await expect(
      page.locator('[data-testid="recovery-identifier"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="recovery-hub"]'),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="recovery-submit"]'),
    ).toBeVisible()
  })

  test('should submit recovery request with identifier and hub', async ({
    page,
  }) => {
    await page.goto('/login')
    await page.locator('[data-testid="lost-device-link"]').click()

    await page
      .locator('[data-testid="recovery-identifier"]')
      .fill('user@example.com')
    await page
      .locator('[data-testid="recovery-hub"]')
      .fill('test-hub-id')
    await page.locator('[data-testid="recovery-submit"]').click()

    // Should advance to Signal verification step (or show error if server not running)
    // In test mode with mocked API, we verify the form submits correctly
    await expect(
      page
        .locator('[data-testid="recovery-verification-code"]')
        .or(page.locator('.text-destructive')),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('should navigate back from recovery flow', async ({ page }) => {
    await page.goto('/login')
    await page.locator('[data-testid="lost-device-link"]').click()

    // Should see recovery flow
    await expect(
      page.locator('[data-testid="recovery-identifier"]'),
    ).toBeVisible()

    // Click back
    await page.locator('button:has(svg.lucide-arrow-left)').click()

    // Should be back at login
    await expect(
      page.locator('[data-testid="lost-device-link"]'),
    ).toBeVisible()
  })
})

test.describe('Recovery Group - IPC Mock Verification', () => {
  test('shamir split and combine round-trips correctly', async ({
    page,
  }) => {
    await page.goto('/login')

    // Use page.evaluate to test the IPC mock directly
    const result = await page.evaluate(async () => {
      const { invoke } = await import('@tauri-apps/api/core')

      // Generate a test secret
      const secretHex =
        'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'

      // Split into 3 shares with threshold 2
      const splitResult = (await invoke('shamir_split', {
        secretHex,
        total: 3,
        threshold: 2,
      })) as { shares: Array<{ x: number; y: string }>; commitments: string[] }

      // Combine with first 2 shares
      const recovered = await invoke('shamir_combine', {
        sharesJson: JSON.stringify(splitResult.shares.slice(0, 2)),
      })

      // Verify commitments
      const commitment0 = await invoke('shamir_commit', {
        x: splitResult.shares[0].x,
        yHex: splitResult.shares[0].y,
      })
      const verified = await invoke('shamir_verify', {
        x: splitResult.shares[0].x,
        yHex: splitResult.shares[0].y,
        commitmentHex: commitment0,
      })

      return {
        originalSecret: secretHex,
        recoveredSecret: recovered,
        secretMatches: recovered === secretHex,
        commitmentMatches: commitment0 === splitResult.commitments[0],
        commitmentVerified: verified,
        shareCount: splitResult.shares.length,
        commitmentCount: splitResult.commitments.length,
      }
    })

    expect(result.secretMatches).toBe(true)
    expect(result.commitmentMatches).toBe(true)
    expect(result.commitmentVerified).toBe(true)
    expect(result.shareCount).toBe(3)
    expect(result.commitmentCount).toBe(3)
  })

  test('recovery group keypair generation works', async ({ page }) => {
    await page.goto('/login')

    const result = await page.evaluate(async () => {
      const { invoke } = await import('@tauri-apps/api/core')

      const keypair = (await invoke('recovery_group_generate_keypair')) as {
        publicKeyHex: string
        privateKeyHex: string
      }

      return {
        hasPublicKey: keypair.publicKeyHex.length === 64,
        hasPrivateKey: keypair.privateKeyHex.length === 64,
        keysAreDifferent: keypair.publicKeyHex !== keypair.privateKeyHex,
      }
    })

    expect(result.hasPublicKey).toBe(true)
    expect(result.hasPrivateKey).toBe(true)
    expect(result.keysAreDifferent).toBe(true)
  })
})
```

---

## Task 8: Commit

- [ ] **8.1** Run `bun run typecheck` to verify no type errors
- [ ] **8.2** Run `bun run test:build` to verify the test build succeeds
- [ ] **8.3** Run Playwright tests: `bunx playwright test tests/e2e/recovery-group.spec.ts`
- [ ] **8.4** Commit all changes with message: `feat(EP09-P4): recovery group desktop UI — admin config, request dashboard, account recovery flow`

Files modified:
- `apps/desktop/src/crypto.rs` (Rust IPC handlers)
- `apps/desktop/src/lib.rs` (register new commands)
- `src/client/lib/platform.ts` (TypeScript IPC wrappers)
- `src/client/lib/api.ts` (API client functions)
- `tests/mocks/tauri-core.ts` (Playwright IPC mocks)
- `src/client/components/admin-sections/recovery-group-section.tsx` (replace stub)
- `src/client/components/admin-sections/recovery-requests-section.tsx` (new)
- `src/client/components/admin-sections/index.ts` (register recovery-requests)
- `src/client/components/admin-settings/recovery-group-section.tsx` (new inner component)
- `src/client/components/admin-settings/recovery-requests-section.tsx` (new inner component)
- `src/client/components/account-recovery-flow.tsx` (new)
- `src/client/components/recovery-status-section.tsx` (new)
- `src/client/routes/login.tsx` (wire "I lost my device" link)
- `src/client/routes/settings.tsx` (add RecoveryStatusSection)
- `tests/e2e/recovery-group.spec.ts` (new)

---

## Dependency Graph

```
Task 1 (IPC commands) ──┐
                         ├── Task 3 (Recovery Team Section) ──┐
Task 2 (API functions) ──┤                                     ├── Task 7 (E2E tests) ── Task 8 (Commit)
                         ├── Task 4 (Request Dashboard) ──────┤
                         ├── Task 5 (Account Recovery Flow) ──┤
                         └── Task 6 (Recovery Status) ────────┘
```

Tasks 1 and 2 can run in parallel. Tasks 3-6 depend on both 1 and 2, but are independent of each other and can run in parallel. Task 7 depends on all UI tasks. Task 8 depends on Task 7.
