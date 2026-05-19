# Certificate Pins

## Production SPKI Hashes

Extract with:
```bash
openssl s_client -connect app.llamenos.org:443 </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | base64
```

For intermediate CA (pin this as backup, rotate leaf pin independently):
```bash
openssl s_client -connect app.llamenos.org:443 -showcerts </dev/null 2>/dev/null \
  | awk '/BEGIN CERT/{c++} c==2{print}' \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | base64
```

## Current Pins

| Domain | Type | Hash (base64 SHA-256 SPKI) | Expires |
|--------|------|---------------------------|---------|
| *.llamenos.org | Leaf cert | **REPLACE_BEFORE_PRODUCTION** | — |
| *.llamenos.org | Cloudflare Intermediate CA | **REPLACE_BEFORE_PRODUCTION** | — |

## Pin Rotation Procedure

1. Extract new cert hashes (see above)
2. Update `apps/ios/Sources/Services/APIService.swift` `cloudflareHashes`
3. Update `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt` `certificatePinner`
4. Update `/api/config` endpoint `pinConfig` response (signed by server Ed25519 key)
5. Deploy backend first (with both old + new pins in `pinConfig`)
6. Ship mobile update with new `cloudflareHashes` (includes backup)
7. After old certs expire: remove old pins from backend `pinConfig`

## Hard-Fail Policy

Pin mismatch → connection refused, no fallback. No soft-fail period.
Pin failures are logged to admin dashboard as `cert_pin_mismatch` events.
