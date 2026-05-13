#!/usr/bin/env bash
# Extract SHA-256 SPKI certificate pins from a live HTTPS domain.
# Usage: ./scripts/extract-cert-pins.sh <domain> [port]
#
# Outputs two lines (base64-encoded SHA-256 hashes):
#   LEAF=<hash>
#   INTERMEDIATE=<hash>
#
# These are suitable for OkHttp CertificatePinner (Android) and
# URLSession certificate pinning (iOS). See docs/security/CERTIFICATE_PINS.md.

set -euo pipefail

DOMAIN="${1:-}"
PORT="${2:-443}"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 <domain> [port]" >&2
  echo "Example: $0 app.llamenos.org" >&2
  exit 1
fi

# Verify openssl is available
if ! command -v openssl &>/dev/null; then
  echo "Error: openssl is required but not found in PATH" >&2
  exit 1
fi

# Extract the full certificate chain (PEM blocks)
CHAIN=$(openssl s_client -connect "${DOMAIN}:${PORT}" -servername "$DOMAIN" -showcerts </dev/null 2>/dev/null)

if [[ -z "$CHAIN" ]]; then
  echo "Error: could not connect to ${DOMAIN}:${PORT}" >&2
  exit 1
fi

# Split the chain into individual PEM certificates
# cert_n starts at 1 (leaf), 2 (intermediate), etc.
extract_pin() {
  local cert_index="$1"
  local pem
  pem=$(echo "$CHAIN" | awk -v n="$cert_index" '
    /BEGIN CERTIFICATE/ { count++ }
    count == n { print }
    /END CERTIFICATE/ && count == n { exit }
  ')

  if [[ -z "$pem" ]]; then
    return 1
  fi

  local pin
  pin=$(echo "$pem" \
    | openssl x509 -pubkey -noout 2>/dev/null \
    | openssl pkey -pubin -outform DER 2>/dev/null \
    | openssl dgst -sha256 -binary \
    | base64)

  if [[ -z "$pin" ]]; then
    return 1
  fi

  echo "$pin"
}

# Extract leaf certificate pin (cert 1)
LEAF_PIN=$(extract_pin 1) || {
  echo "Error: failed to extract leaf certificate pin from ${DOMAIN}:${PORT}" >&2
  exit 1
}

# Extract intermediate certificate pin (cert 2)
INTERMEDIATE_PIN=$(extract_pin 2) || {
  echo "Warning: no intermediate certificate found; using leaf pin as backup" >&2
  INTERMEDIATE_PIN="$LEAF_PIN"
}

# Validate pins look like valid base64-encoded SHA-256 hashes (44 chars)
validate_pin() {
  local pin="$1"
  local label="$2"
  if [[ ${#pin} -ne 44 ]] || ! echo "$pin" | grep -qE '^[A-Za-z0-9+/]{43}=$'; then
    echo "Error: ${label} pin does not look like a valid base64 SHA-256 hash: ${pin}" >&2
    exit 1
  fi
}

validate_pin "$LEAF_PIN" "Leaf"
validate_pin "$INTERMEDIATE_PIN" "Intermediate"

echo "LEAF=${LEAF_PIN}"
echo "INTERMEDIATE=${INTERMEDIATE_PIN}"
