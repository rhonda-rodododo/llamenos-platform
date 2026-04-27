# Next Backlog

Single source of truth for pending work. Checked at session kickoff. Updated on completion.

## In Progress (Specs)

- [x] Crypto Protocol Alignment (HPKE + MLS + per-device keys + sigchain + CLKR)
  - Spec: `docs/superpowers/specs/2026-04-27-crypto-protocol-alignment.md`
  - Plan: `docs/superpowers/plans/2026-04-27-crypto-protocol-alignment.md`
- [x] Signal Messaging Channel (complete existing adapter)
  - Spec: `docs/superpowers/specs/2026-04-27-signal-messaging-channel.md`
  - Plan: `docs/superpowers/plans/2026-04-27-signal-messaging-channel.md`
- [x] Blast/Broadcast Service (PostgreSQL job queue)
  - Spec: `docs/superpowers/specs/2026-04-27-blast-broadcast-service.md`
  - Plan: `docs/superpowers/plans/2026-04-27-blast-broadcast-service.md`
- [x] Firehose Inference Agent (tiered LLM extraction)
  - Spec: `docs/superpowers/specs/2026-04-27-firehose-inference-agent.md`
  - Plan: `docs/superpowers/plans/2026-04-27-firehose-inference-agent.md`

## Completed (This Session)

- [x] Dependency update — JS/TS (TS 6.0, Vite 8, Twilio 6, i18next 26, etc.)
- [x] Dependency update — Rust/Cargo (semver updates, clippy fixes)

## Pending (Not Yet Started)

- [ ] Additional telephony adapters (Telnyx, Bandwidth, FreeSwitch)
- [ ] RCS (Google RBM) messaging adapter
- [ ] Telegram messaging adapter
- [ ] Analytics/metrics admin routes
- [ ] UniFFI upgrade (0.28 → 0.31) — needs mobile binding regen + testing
- [ ] RustCrypto major upgrade (k256 0.14, sha2 0.11) — blocked on k256 stable release
