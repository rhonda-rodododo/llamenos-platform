# Next Backlog

Single source of truth for pending work. Updated 2026-04-27.

## Completed This Session (2026-04-27)

### Features (all merged to main or PRs open)
- [x] Crypto Protocol Alignment (HPKE, MLS, device keys, PUK, sigchain, CLKR, SFrame)
- [x] Signal Messaging Channel (receipts, reactions, typing, registration, retry, identity, failover)
- [x] Blast/Broadcast Service (PostgreSQL delivery queue, rate limiting, scheduled sends)
- [x] Firehose Inference Agent (LLM extraction, buffer encryption, circuit breaker)
- [x] Signal Notification Service (zero-knowledge sidecar, HMAC contacts, security alerts)
- [x] SIP Bridge Rewrite (ARI + ESL + Kamailio, replaces asterisk-bridge/)
- [x] Telegram Messaging Adapter
- [x] RCS (Google RBM) Messaging Adapter
- [x] Telephony Adapters (Telnyx, Bandwidth, FreeSwitch — 8 providers total)
- [x] Analytics/Metrics Admin Routes
- [x] Asterisk Bridge Hardening (6 memory leak fixes)

### Crypto & Mobile
- [x] Desktop Tauri IPC Rewrite (Ed25519/X25519/HPKE)
- [x] Backend Device/Sigchain/PUK/MLS API Endpoints
- [x] Crypto Security Review Fixes (labels, zeroization, MLS context)
- [x] Crypto LOW Findings (test labels, SFrame zeroize, Nostr constant)
- [x] UniFFI Upgrade (0.28 → 0.31)
- [x] Mobile Crypto Sync (iOS + Android — device keys + HPKE)

### Infrastructure
- [x] Dependency Updates (TS 6.0, Vite 8, Twilio 6, Rust semver)
- [x] knope Release PR Flow + SLSA/SBOM/cosign
- [x] K8s Health Probes + Prometheus Observability
- [x] Production Deployment Hardening (Caddyfile, compose overlay, auto-deploy)
- [x] Full Integration Compose (Kamailio, CoTURN, CI overlay, Ollama)
- [x] CI Sidecar Profiles + Integration BDD Scenarios
- [x] Ansible Guardrails (preflight, smoke-check, Kamailio role)
- [x] Docker Compose Services (signal-notifier, Ollama, vLLM)
- [x] Structured Logging (namespaces, auto-redaction, correlation IDs)
- [x] CLAUDE.md Refresh

## Merging (PRs #13-18 in merge train)

- [ ] #13 — RCS adapter
- [ ] #14 — CLAUDE.md refresh
- [ ] #15 — Crypto LOW findings
- [ ] #16 — UniFFI upgrade
- [ ] #17 — Mobile crypto sync
- [ ] #18 — Structured logging

## Pending (Future Sessions)

- [ ] RustCrypto major upgrade (k256 0.14, sha2 0.11) — blocked on k256 stable release
- [ ] WebRTC gateway mode for SIP bridge (browser-to-SIP)
- [ ] Post-quantum hybrid KEM (ML-KEM-1024 + X25519) — waiting for ML-KEM finalization
- [ ] MLS epoch-keyed SFrame for voice E2EE (Phase 3 of crypto spec)
- [ ] Public security whitepaper + commissioned audit
- [ ] Legacy secp256k1 code removal (Phase 6 cleanup after mobile verified)
- [ ] Load testing with full sidecar stack
