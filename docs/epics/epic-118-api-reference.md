# Epic 118: Docs Site — API Reference

**Status: PENDING**
**Repo**: llamenos (site/)
**Priority**: Medium — reference documentation for API consumers
**Depends on**: None (independent)

## Summary

Create a comprehensive API reference page on the documentation site covering all REST endpoints, organized by Durable Object. Source all content from `docs/protocol/PROTOCOL.md` Section 4.

## API Endpoint Inventory

Sourced from `PROTOCOL.md` Section 4 (~50+ endpoints across 12 categories):

### Public Endpoints (No Auth) — 5 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/config` | Public configuration (hotline name, channels, hubs, relay URL) |
| GET | `/api/config/verify` | Build verification (version, commit, checksums, SLSA provenance) |
| GET | `/api/ivr-audio/:promptType/:language` | IVR audio files (telephony fetches) |
| GET/PATCH | `/api/messaging/preferences?token=<hmac>` | Message preferences (token-validated) |

### Authentication — 6 endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Schnorr signature login |
| POST | `/api/auth/bootstrap` | First admin registration |
| GET | `/api/auth/me` | Current user info |
| POST | `/api/auth/me/logout` | Logout |
| PATCH | `/api/auth/me/profile` | Update profile |
| PATCH | `/api/auth/me/availability` | Update break status |

### WebAuthn — 6 endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webauthn/login/options` | Login challenge |
| POST | `/api/webauthn/login/verify` | Verify assertion |
| POST | `/api/webauthn/register/options` | Register credential |
| POST | `/api/webauthn/register/verify` | Verify attestation |
| GET | `/api/webauthn/credentials` | List credentials |
| DELETE | `/api/webauthn/credentials/:credId` | Delete credential |

### Invites — 5 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/invites/validate/:code` | Validate invite |
| POST | `/api/invites/redeem` | Redeem invite |
| GET | `/api/invites` | List invites |
| POST | `/api/invites` | Create invite |
| DELETE | `/api/invites/:code` | Revoke invite |

### Volunteers — 4 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/volunteers` | List volunteers |
| POST | `/api/volunteers` | Create volunteer |
| PATCH | `/api/volunteers/:targetPubkey` | Update volunteer |
| DELETE | `/api/volunteers/:targetPubkey` | Delete volunteer |

### Shifts — 7 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/shifts/my-status` | User's shift status |
| GET | `/api/shifts` | List shifts |
| POST | `/api/shifts` | Create shift |
| PATCH | `/api/shifts/:id` | Update shift |
| DELETE | `/api/shifts/:id` | Delete shift |
| GET | `/api/shifts/fallback` | Fallback group |
| PUT | `/api/shifts/fallback` | Update fallback |

### Notes — 3 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes?callId=&page=&limit=` | List notes (encrypted) |
| POST | `/api/notes` | Create note (encrypted) |
| PATCH | `/api/notes/:id` | Update note (encrypted) |

### Calls — 8 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/calls/active` | Active calls |
| GET | `/api/calls/today-count` | Today's count |
| GET | `/api/calls/presence` | Volunteer presence |
| GET | `/api/calls/history` | Call history (paginated) |
| POST | `/api/calls/:callId/answer` | Answer call |
| POST | `/api/calls/:callId/hangup` | Hang up |
| POST | `/api/calls/:callId/spam` | Report spam |
| GET | `/api/calls/:callId/recording` | Get recording |

### Conversations — 7 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/conversations` | List conversations |
| GET | `/api/conversations/stats` | Stats |
| GET | `/api/conversations/load` | Load per volunteer |
| GET | `/api/conversations/:id` | Get conversation |
| GET | `/api/conversations/:id/messages` | Message history |
| POST | `/api/conversations/:id/messages` | Send message |
| PATCH | `/api/conversations/:id` | Update status/assignment |

### Reports — 8 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reports` | List reports |
| POST | `/api/reports` | Create report |
| GET | `/api/reports/:id` | Get report |
| GET | `/api/reports/:id/messages` | Message history |
| POST | `/api/reports/:id/messages` | Send message |
| POST | `/api/reports/:id/assign` | Assign report |
| PATCH | `/api/reports/:id` | Update report |
| GET | `/api/reports/categories` | List categories |

### Bans — 4 endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/bans` | Create ban |
| GET | `/api/bans` | List bans |
| POST | `/api/bans/bulk` | Bulk add bans |
| DELETE | `/api/bans/:phone` | Remove ban |

### Settings — 5 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings/telephony-provider` | Get telephony config |
| PATCH | `/api/settings/telephony-provider` | Update telephony |
| POST | `/api/settings/telephony-provider/test` | Test credentials |
| GET | `/api/settings/messaging` | Get messaging config |
| PATCH | `/api/settings/messaging` | Update messaging |

## Page Structure

### File: `site/src/content/docs/en/api-reference.md`

Organized by category with these elements per endpoint:
- **Method + Path** (as heading)
- **Authentication**: Required role/permissions (or "Public")
- **Rate Limiting**: If applicable (e.g., login: 10/min/IP)
- **Request Body**: JSON schema with field descriptions
- **Response**: JSON schema with field descriptions
- **Example**: curl command
- **Notes**: Encryption details, E2EE implications

Example entry:
```markdown
### POST /api/auth/login

**Auth**: None (public)
**Rate Limit**: 10 requests/minute/IP

**Request Body**:
```json
{
  "pubkey": "hex(32 bytes) — x-only Schnorr public key",
  "timestamp": 1708900000000,
  "token": "hex(64 bytes) — BIP-340 Schnorr signature"
}
```

**Response** (200):
```json
{
  "ok": true,
  "role": "volunteer | admin",
  "sessionToken": "base64url(32 bytes)"
}
```

**Notes**: Token signs the message `llamenos:auth:{pubkey}:{timestamp}:{method}:{path}`. Timestamp must be within 5 minutes of server time.
```

### Hub-Scoped Endpoints

Many endpoints have hub-scoped variants (`/api/hubs/:hubId/...`). Document these as a pattern note at the top, not as separate entries:

> **Hub Scoping**: Most resource endpoints are also available under `/api/hubs/:hubId/...` for multi-hub deployments. The hub ID is a UUID. Hub-scoped endpoints require the caller to have the appropriate role within that hub.

## Sidebar Update

### File: `site/src/layouts/DocsLayout.astro`

Add a new "Reference" section to the sidebar:

```
Setup & Deployment
User Guides
Voice Providers
Messaging Channels
Architecture
Reference (new section)
  API Reference (new)
```

### File: `site/src/i18n/translations/common.ts`

Add translation keys:
```typescript
docs: {
  // ... existing ...
  reference: 'Reference',           // section heading
  apiReference: 'API Reference',    // page title
}
```

Translate for all 13 languages.

## CHANGELOG.md

Create `CHANGELOG.md` in the repo root with initial content based on recent versions:

```markdown
# Changelog

All notable changes to Llamenos will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.18.0] - 2026-02-27

### Added
- Desktop app (Tauri v2) with native Rust crypto
- Mobile app (React Native/Expo) with UniFFI bindings
- Cross-platform crypto test vectors
- Version sync tooling across all three repos

### Security
- Tauri isolation pattern, CSP hardening
- Jailbreak/root detection on mobile
- HTTPS enforcement on mobile

## [0.17.0] - 2026-02-23

### Added
- Reproducible builds with SLSA provenance
- Client-side transcription (WASM Whisper)
- E2EE messaging with per-message envelope encryption
- Hash-chained audit log

### Security
- All 25 crypto domain separation constants audited
- Server Nostr keypair derivation via HKDF
```

## Files to Create/Modify

### New Files
- `site/src/content/docs/en/api-reference.md` — comprehensive API endpoint reference
- `CHANGELOG.md` — repo root changelog

### Modified Files
- `site/src/layouts/DocsLayout.astro` — add Reference section to sidebar
- `site/src/i18n/translations/common.ts` — add `reference` and `apiReference` keys

## Verification

1. `cd site && bun run build` — site builds with new API reference page
2. API reference page renders with all 50+ endpoints organized by category
3. "Reference" section appears in sidebar below "Architecture"
4. Each endpoint has method, path, auth requirements, and request/response schemas
5. Hub-scoping pattern documented clearly at top of page
6. CHANGELOG.md exists in repo root and is well-formatted
