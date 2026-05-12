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

- `*.llamenos.org` (API, app)

## Automated Pipeline

Two scripts automate pin extraction and injection into mobile source files:

### Extract pins only

```bash
bun run cert-pins:extract app.llamenos.org
# Output:
#   LEAF=<base64 hash>
#   INTERMEDIATE=<base64 hash>
```

The extraction script (`scripts/extract-cert-pins.sh`) connects to the domain over TLS, extracts SHA-256 SPKI hashes from the leaf and intermediate certificates, validates the output format, and prints both pins.

### Extract and inject into mobile apps

```bash
bun run cert-pins:inject app.llamenos.org
```

The injection script (`scripts/inject-cert-pins.ts`) calls `extract-cert-pins.sh`, then updates both:

- **Android**: replaces `CertificatePinner.Builder()` entries in `apps/android/.../ApiService.kt`
- **iOS**: replaces `cloudflareHashes` array in `apps/ios/.../APIService.swift`

The script is idempotent -- re-running it replaces existing pins with fresh values from the live domain. Review the diff (`git diff apps/android apps/ios`) before committing.

### When to re-run

- After first production deployment (to populate placeholder pins)
- After TLS certificate rotation on the deployment domain
- When migrating to a new domain or CDN provider

## Rotation Procedure

1. Run `bun run cert-pins:inject <domain>` to extract and inject new pins
2. Update this file with new pin values
3. Review diffs: `git diff apps/android apps/ios`
4. Build and test both iOS and Android
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
