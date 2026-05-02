# Certificate Pins

**Status: Scaffolding only — pins are placeholder values (`REPLACE_AFTER_DEPLOYMENT`)**

Certificate pinning infrastructure exists on both iOS and Android but is not yet active. Pins will be populated after first production deployment to `app.llamenos.org`.

## Implementation Status

| Platform | File | Class | Status |
|----------|------|-------|--------|
| **iOS** | `apps/ios/Sources/Services/APIService.swift` | `CertificatePinningDelegate` (URLSessionDelegate) | Scaffolding exists; no hashes configured — falls back to standard TLS validation |
| **Android** | `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt` | `CertificatePinner` (OkHttp) | Scaffolding exists; placeholder `sha256/REPLACE_AFTER_DEPLOYMENT` values |
| **Desktop (Tauri)** | N/A | N/A | Not applicable — Tauri uses system TLS; cert pinning impractical for desktop web apps |

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

- `*.llamenos.org` (API, relay, app)

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
