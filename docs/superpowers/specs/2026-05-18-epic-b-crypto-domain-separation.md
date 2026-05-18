# Epic B: Crypto Domain Separation & Label Enforcement

## Status: Spec Complete

## Problem Statement

The crypto label registry (the source of truth for domain separation across all platforms) has drifted again — `packages/protocol/crypto-labels.json` contains 7 labels not present in the Rust crate's `labels.rs`. This is the 4th time drift has been found. Additionally, several crypto crate modules use raw string literals or weak domain separation where registered labels should be used, and mobile clients do not verify WebSocket event signatures.

## Findings

### C07: 7 Missing Rust Labels

`crypto-labels.json` contains these labels with no corresponding constant or registry entry in `labels.rs`:

| JSON Key | Value | Purpose |
|----------|-------|---------|
| `LABEL_AVAILABILITY_REASON` | `llamenos:availability-reason` | Availability status encryption |
| `LABEL_RING_GROUP_NAME` | `llamenos:ring-group-name` | Ring group name encryption |
| `LABEL_SHIFT_NAME` | `llamenos:shift-name` | Shift name encryption |
| `LABEL_SHIFT_OVERRIDE_NOTE` | `llamenos:shift-override-note` | Shift override note encryption |
| `LABEL_TEAM_ENCRYPT` | `llamenos:team-field:v1` | Team field encryption |
| `LABEL_TAG_ENCRYPT` | `llamenos:tag-field:v1` | Tag field encryption |
| `LABEL_ENTITY_TYPE_DEFINITION` | `llamenos:entity-type-def:v1` | Entity type definition encryption |

### C08: WS Signature Verification Missing on Mobile

- **Desktop**: `connection.ts:292-302` already verifies `sig` field via `ed25519Verify` before processing. Good.
- **iOS**: `WebSocketService.swift` parses `sig` field but never verifies it.
- **Android**: `WebSocketService.kt` parses `sig` field but never verifies it.
- **Critical**: `device:wipe` events are processed without signature verification on mobile.

### H10: SFrame Raw String Nonce Label

`sframe.rs:215` uses `b"sframe nonce"` as HKDF info — not a registered label. Should use a registered constant for domain separation consistency.

### H11: Shamir Commitment Lacks Domain Prefix

`shamir.rs:333-337` — `commit()` computes `SHA-256(x || y)`. No domain separation prefix, making commitments potentially confusable with other SHA-256 hashes in the system.

### H12: HPKE Envelope Error Oracle

`hpke_envelope.rs` returns distinguishable errors for different failure modes:
- `InvalidFormat("label mismatch...")` for label check failure
- `InvalidFormat("unknown labelId...")` for unknown label
- `DecryptionFailed` for AEAD failure

This difference could theoretically serve as an oracle. All decrypt failures should return the same error type after the version check.

### H13: `nsec` Parameter Name

`encryption.rs:428` — `encrypt_with_pin(nsec, pin, pubkey_hex)` — parameter named `nsec` is a legacy artifact. Should be `encrypted_device_key` or `key_material`.

### H14: Shamir `ShamirShare` Missing Zeroize

`shamir.rs:158-161` — `ShamirShare` (UniFFI export type) contains `y_hex: String` which is not zeroized on drop. The internal `Share` type properly zeroizes, but the FFI boundary type doesn't.

### H15: Truncated Fingerprint

`encryption.rs:451` — `&full[..8]` produces a 64-bit truncated SHA-256. Either document this as intentional (collision resistance is not needed since it's identification, not authentication) or extend to 128-bit.

### Desktop: `decrypt_server_event` Wrong Label

`crypto.rs:784` uses `LABEL_HUB_EVENT` for server event AAD instead of `LABEL_HUB_EVENT_EPOCH`. The server-side ws-manager signs with a format including epoch, but the AAD binding uses the wrong label constant.

### Desktop: `encrypt_hub_field`/`decrypt_hub_field` Accept Arbitrary Labels

`crypto.rs:531-584` — these commands accept any string as `label` without validating against the label registry. Callers could pass arbitrary strings, bypassing domain separation.

## Security Impact

- **C07**: Labels exist in JSON but not Rust — any code referencing these labels in Rust will fail at compile time, but the gap means codegen output includes labels the crypto crate doesn't recognize, which could cause `hpke_seal` to return "unknown label" errors.
- **C08**: Mobile clients process `device:wipe` without verifying the server's signature. A MITM could inject wipe commands.
- **H10-H15**: Individual low-to-medium severity, but collectively they represent gaps in the domain separation invariant.
- **Desktop wrong label**: `decrypt_server_event` will fail if the server ever switches to `LABEL_HUB_EVENT_EPOCH` for AAD binding, or silently succeed with the wrong domain binding.
