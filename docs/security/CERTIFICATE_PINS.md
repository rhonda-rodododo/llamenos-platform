# Certificate Pins

**Status: Scaffolding only — pins are placeholder values (`REPLACE_AFTER_DEPLOYMENT`)**

Certificate pinning infrastructure exists on both iOS and Android but is not yet active. Pins will be populated after first production deployment to `app.llamenos.org`.

## Implementation Status

| Platform | File | Class | Status |
|----------|------|-------|--------|
| **iOS** | `apps/ios/Sources/Services/APIService.swift` | `CertificatePinningDelegate` (URLSessionDelegate) | Scaffolding exists; no hashes configured — falls back to standard TLS validation |
| **Android** | `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt` | `CertificatePinner` (OkHttp) | Scaffolding exists; placeholder `sha256/REPLACE_AFTER_DEPLOYMENT` values |
| **Desktop (Tauri)** | N/A | N/A | Not applicable — Tauri uses system TLS; cert pinning impractical for desktop web apps |

## Known TODOs

### Android Placeholder Pins

**Location:** `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt:66`

**TODO:** "Replace placeholder pins after first production deployment to app.llamenos.org"

**Impact:** Android app uses standard TLS validation without certificate pinning. A rogue CA or national-level MITM could intercept HTTPS traffic.

**Action Required:** After first production deployment, extract actual certificate pins and replace placeholders.

### iOS Certificate Pinning Delegate

**Location:** `apps/ios/Sources/Services/APIService.swift`

**Status:** `CertificatePinningDelegate` class exists but no hashes are configured. Falls back to standard `URLSession` TLS validation.

**Action Required:** Configure `sha256/...` pins in the pinning delegate after production deployment.

## Extracting Pins

After first production deployment, extract pins from the live domain:

```bash
# Primary pin — intermediate CA
openssl s_client -connect app.llamenos.org:443 -servername app.llamenos.org < /dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | base64

# Backup pin — root CA
openssl s_client -connect app.llamenos.org:443 -servername app.llamenos.org -showcerts < /dev/null 2>/dev/null \
  | awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/{print}' \
  | tail -n +$(awk '/BEGIN CERTIFICATE/{n++}n==2{print NR;exit}' <(openssl s_client -connect app.llamenos.org:443 -servername app.llamenos.org -showcerts < /dev/null 2>/dev/null)) \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform DER \
  | openssl dgst -sha256 -binary \
  | base64
```

## Current Pins

| Purpose | SHA-256 Base64 |
|---------|---------------|
| Primary (intermediate CA) | `REPLACE_AFTER_DEPLOYMENT` |
| Backup (root CA) | `REPLACE_AFTER_DEPLOYMENT` |

## Domains

- `*.llamenos.org` (API, app)

## Rotation Procedure

1. Extract new pins using the commands above
2. Update this file with new pin values
3. Update iOS: `apps/ios/Sources/Services/APIService.swift` (`CertificatePinningDelegate`)
4. Update Android: `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt` (`CertificatePinner`)
5. Deploy mobile updates before certificate rotation takes effect
6. Keep the old pin as backup for at least one release cycle

## Security Note

Certificate pinning is a defense-in-depth measure against TLS interception (rogue CAs, national-level MITM). It does NOT protect against:
- Server compromise (attacker controls the server, not the network)
- Client compromise (attacker has device access)
- Supply chain attacks (compromised app update)

For the desktop (Tauri) client, HSTS preload + SRI hashing provide the equivalent protection layer. Certificate pinning is impractical for webview-based apps.

## WebSocket Relay Certificate Considerations

The API server's built-in WebSocket endpoint (`/ws`) uses the same TLS certificate as the API. Certificate pinning on mobile clients covers WebSocket connections automatically since they share the `*.llamenos.org` domain.

Clients authenticate to the WebSocket using the same session token or signed auth token used for REST API requests. The server handles all event publishing — clients receive only. Even if a MITM attacker intercepts the WebSocket connection, they cannot inject fake events (server-only publishing) and cannot read event content (encrypted with epoch-rotating per-hub keys).

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-11 | 1.1 | Added known TODOs section with Android placeholder and iOS delegate status; added action required notes |
| 2026-05-02 | 1.0 | Initial document |
