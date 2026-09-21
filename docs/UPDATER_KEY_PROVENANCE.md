# Updater signing key — provenance

The desktop auto-updater trusts exactly one public key, recorded as
`plugins.updater.pubkey` in `apps/desktop/tauri.conf.json`. Anything signed by
the matching private key will be accepted as a genuine update by every
installed client. Changing that value is therefore a security-critical act, and
a diff alone can never prove who holds the corresponding private key.

This file records that provenance so the change is auditable.

## Current key

| | |
|---|---|
| minisign key ID | `C8279C12F39DD35B` |
| generated | 2026-09-21, on the operator's workstation at the operator's instruction |
| generated with | `bunx tauri signer generate -w ~/.tauri/updater.key -p <password> -f` |
| private half | held in the repository secret `TAURI_SIGNING_PRIVATE_KEY`, loaded directly from the generated file |
| password | stored at `~/.tauri/updater.password` (mode 0600) and in the repository secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |

The public half committed to `tauri.conf.json` was verified to decode to that
key ID before the change was made:

```
$ grep -o '"pubkey": "[^"]*"' apps/desktop/tauri.conf.json | sed 's/.*: "//; s/"//' | base64 -d
untrusted comment: minisign public key: C8279C12F39DD35B
```

## Why the previous key was replaced

The previously committed key was `1BE968B909D35220`, which superseded `E1F35E58BD83142F`. Its private half exists on
the operator's workstation but **its password is not known**, so it cannot sign
anything. Three keypairs with overlapping names had accumulated there and the
stored password unlocked none of them, which is what prompted a clean
regeneration rather than further reconciliation.

No compatibility is lost. No desktop artifact has ever shipped: releases
v0.19.13, v0.19.14 and v0.19.15 published integrity metadata only
(`CHECKSUMS.txt`, `provenance.json`, `sbom.cdx.json` and their signatures). The
desktop builds failed in turn on the macOS target triple (#893), the Tauri
crate/npm version mismatch (#895), the CLI positional path argument (#915), and
then on the absent signing key. So nothing signed by the old key needs to keep
verifying.

## Rotating this key in future

A rotation invalidates updates for every client still trusting the old key.
Once desktop artifacts are actually in testers' hands, a rotation needs a
migration path, not just a new commit here. Treat a change to
`plugins.updater.pubkey` as requiring explicit operator sign-off, and update
this file in the same commit — the review gate correctly refuses a bare pubkey
swap with no provenance, and that refusal is worth preserving.

Two operational traps encountered while generating this key, recorded so the
next person does not lose time to them:

- A key file with a **trailing newline** is rejected as
  `failed to decode base64 secret key: Invalid symbol 61`, which reads like a
  corrupt key but is only whitespace.
- `tauri signer generate` panics with `No such device or address` when no TTY
  is attached; pass `-p` explicitly in that case.
