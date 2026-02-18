# Epic 53: Deep Security Audit & Hardening

## Overview
Comprehensive security audit of the entire application, covering authentication, cryptography, API endpoints, telephony adapters, rate limiting, and frontend security. All findings fixed inline.

## Findings & Fixes

### CRITICAL (Fixed)

1. **Login endpoint did not verify Schnorr signature** (`worker/routes/auth.ts`)
   - Token was destructured but never verified; anyone knowing a pubkey could enumerate roles
   - Fix: Added `verifyAuthToken()` call before returning any user information; unified error messages to prevent user enumeration

2. **CAPTCHA expected digits stored in URL query params** (`worker/routes/telephony.ts`, all 4 adapters)
   - Attacker could see/modify expected digits in callback URL; bypasses CAPTCHA entirely
   - Fix: Generate digits server-side with CSPRNG (`crypto.getRandomValues`), store in SettingsDO with `captcha:{callSid}` key, one-time-use verification with constant-time comparison

3. **`Math.random()` used for CAPTCHA generation** (all 4 telephony adapters)
   - Not a CSPRNG; predictable in V8/Workers runtime
   - Fix: Moved generation to route handler using `crypto.getRandomValues()` with proper modular arithmetic

### HIGH (Fixed)

4. **Invite redemption accepted arbitrary pubkey** (`worker/routes/invites.ts`)
   - No proof of private key ownership; attacker with valid invite code could register any pubkey
   - Fix: Require Schnorr signature on redemption; added rate limiting on endpoint

5. **Upload chunk/status endpoints had no ownership check** (`worker/routes/uploads.ts`)
   - Any authenticated user could upload chunks to or poll status of any upload ID
   - Fix: Added `uploadedBy === pubkey` ownership verification on chunk upload and status check

6. **Sessions not revoked on volunteer deactivation/deletion** (`worker/routes/volunteers.ts`)
   - Deactivated/deleted volunteers retained full session access for up to 8 hours
   - Fix: Call `revokeAllSessions(targetPubkey)` on deactivation (active=false, role change) and deletion

7. **Plaintext nsec in onboarding backup** (`client/routes/onboarding.tsx`)
   - downloadBackup() stored raw nsec in plaintext JSON file
   - Fix: Now uses `createBackup()` from backup.ts which encrypts with PBKDF2 + XChaCha20-Poly1305

8. **HKDF called without salt for note encryption** (`client/lib/crypto.ts`)
   - Missing salt reduces HKDF security margin per RFC 5869
   - Fix: Added fixed application salt `llamenos:hkdf-salt:v1`

9. **Static PBKDF2 salt for recovery key derivation** (`client/lib/backup.ts`)
   - Recovery key PBKDF2 used hardcoded `'llamenos:recovery'` instead of per-backup random salt
   - Fix: Generate random salt per backup, store in backup file; legacy fallback preserved

10. **TwiML XML injection via HOTLINE_NAME** (`worker/telephony/twilio.ts`)
    - User-controlled content interpolated into XML without escaping
    - Fix: Added `escapeXml()` function; all `<Say>` and `<Play>` content now escaped

### MEDIUM (Fixed)

11. **No rate limiting on WebAuthn login flow** (`worker/routes/webauthn.ts`)
    - Challenge flooding and brute-force possible
    - Fix: Added IP-based rate limiting (10/min) on both `/login/options` and `/login/verify`

12. **CORS missing `Vary: Origin` header** (`worker/middleware/cors.ts`)
    - Could cause cache poisoning with dynamic origin reflection
    - Fix: Added `Vary: Origin` to both preflight and regular responses

13. **Reporter role could create/edit call notes** (`worker/routes/notes.ts`)
    - Notes endpoints had no role guard beyond authentication
    - Fix: Added `volunteerOrAdminGuard` middleware

14. **WebAuthn userVerification set to "preferred"** (`worker/lib/webauthn.ts`)
    - Stolen device with passkey could authenticate without biometric/PIN
    - Fix: Changed to `userVerification: 'required'` for both registration and authentication

15. **IP hash truncated to 64 bits** (`worker/lib/crypto.ts`)
    - Birthday collision at 2^32; rate limit bypass possible
    - Fix: Increased to 96 bits (24 hex chars)

16. **Asterisk webhook validation used `===` (non-constant-time)** (`worker/telephony/asterisk.ts`)
    - Timing oracle attack on HMAC comparison
    - Fix: Replaced with byte-by-byte XOR comparison matching other adapters

17. **Asterisk webhook had no timestamp replay protection** (`worker/telephony/asterisk.ts`)
    - Captured signed webhooks replayable indefinitely
    - Fix: Added 5-minute timestamp window validation

18. **Asterisk bridge bound to 0.0.0.0** (`asterisk-bridge/src/index.ts`)
    - Bridge commands internet-accessible without firewall
    - Fix: Added `hostname: '127.0.0.1'` to `Bun.serve()`

## Architecture Notes (Documented, Not Fixed)

These are known limitations documented for operational awareness:

- **Schnorr token 5-min replay window**: Mitigated by HTTPS; full nonce system deferred to post-launch
- **nsec in sessionStorage**: Accessible via XSS; mitigated by strong CSP (`script-src 'self'`); WebAuthn passkeys recommended as primary auth
- **Ban list bypassable via caller-ID spoofing**: Fundamental PSTN limitation; documented in operational procedures
- **Phone number hashing uses SHA-256 not PBKDF2**: Low-entropy input enumerable; acceptable for rate-limiting context
- **WebSocket rate limit resets on DO hibernation**: Acceptable for current usage patterns; persistent storage deferred

## Files Changed

- `src/worker/routes/auth.ts` — Login signature verification
- `src/worker/routes/telephony.ts` — CAPTCHA server-side state
- `src/worker/routes/invites.ts` — Invite redemption signature proof + rate limiting
- `src/worker/routes/uploads.ts` — Upload ownership checks
- `src/worker/routes/volunteers.ts` — Session revocation on deactivation
- `src/worker/routes/notes.ts` — Role guard
- `src/worker/routes/webauthn.ts` — Rate limiting
- `src/worker/lib/auth.ts` — (referenced, not changed)
- `src/worker/lib/crypto.ts` — IP hash length increase
- `src/worker/lib/webauthn.ts` — userVerification required
- `src/worker/middleware/cors.ts` — Vary: Origin
- `src/worker/durable-objects/settings-do.ts` — CAPTCHA storage endpoints
- `src/worker/durable-objects/identity-do.ts` — Path-based revoke-all route
- `src/worker/telephony/adapter.ts` — captchaDigits field
- `src/worker/telephony/twilio.ts` — XML escaping, CAPTCHA fix
- `src/worker/telephony/vonage.ts` — CAPTCHA fix
- `src/worker/telephony/plivo.ts` — CAPTCHA fix
- `src/worker/telephony/asterisk.ts` — Constant-time HMAC, timestamp validation, CAPTCHA fix
- `src/client/lib/crypto.ts` — HKDF salt
- `src/client/lib/backup.ts` — Per-backup PBKDF2 salt
- `src/client/lib/api.ts` — Invite redemption with signature
- `src/client/routes/onboarding.tsx` — Encrypted backup, signed invite redemption
- `asterisk-bridge/src/index.ts` — Localhost binding
