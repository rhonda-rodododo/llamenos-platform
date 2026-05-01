#!/usr/bin/env bash
# fetch-staging.sh — Download staging artifacts from RustFS for offline signing.
#
# Usage: ./scripts/release/fetch-staging.sh <version>
# Example: ./scripts/release/fetch-staging.sh 0.19.0
#
# Environment (or ~/.llamenos-release.env):
#   RUSTFS_ENDPOINT    S3-compatible endpoint URL (e.g., https://rustfs.llamenos.org)
#   RUSTFS_ACCESS_KEY  Access key for RustFS
#   RUSTFS_SECRET_KEY  Secret key for RustFS
#   RUSTFS_BUCKET      Bucket name (default: llamenos-releases)

set -euo pipefail

VERSION="${1:?Usage: fetch-staging.sh <version> (e.g., 0.19.0)}"

# Source credentials
if [ -f ~/.llamenos-release.env ]; then
  # shellcheck source=/dev/null
  source ~/.llamenos-release.env
fi

: "${RUSTFS_ENDPOINT:?Set RUSTFS_ENDPOINT (e.g., https://rustfs.llamenos.org)}"
: "${RUSTFS_ACCESS_KEY:?Set RUSTFS_ACCESS_KEY}"
: "${RUSTFS_SECRET_KEY:?Set RUSTFS_SECRET_KEY}"
RUSTFS_BUCKET="${RUSTFS_BUCKET:-llamenos-releases}"

export AWS_ACCESS_KEY_ID="${RUSTFS_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${RUSTFS_SECRET_KEY}"
export AWS_DEFAULT_REGION="us-east-1"

RELEASE_WORK="${TMPDIR:-/tmp}/llamenos-release-v${VERSION}"
mkdir -p "${RELEASE_WORK}"

echo "=== Fetching staging artifacts for v${VERSION} ==="
echo "  Endpoint: ${RUSTFS_ENDPOINT}"
echo "  Bucket:   ${RUSTFS_BUCKET}"
echo "  Path:     staging/v${VERSION}/"
echo "  Local:    ${RELEASE_WORK}/"
echo ""

# List first to confirm artifacts exist
LISTING=$(aws s3 ls "s3://${RUSTFS_BUCKET}/staging/v${VERSION}/" \
  --endpoint-url "${RUSTFS_ENDPOINT}" 2>&1) || {
  echo "FATAL: No staging artifacts found at s3://${RUSTFS_BUCKET}/staging/v${VERSION}/"
  echo "  Has the CI build completed? Check the Desktop Release workflow."
  exit 1
}

echo "Staging artifacts:"
echo "${LISTING}"
echo ""

ARTIFACT_COUNT=$(echo "${LISTING}" | wc -l)
if [ "${ARTIFACT_COUNT}" -lt 6 ]; then
  echo "WARNING: Only ${ARTIFACT_COUNT} artifacts found. Expected at least 6."
  echo "  Missing platform builds may indicate CI failure."
fi

# Download all artifacts
aws s3 cp "s3://${RUSTFS_BUCKET}/staging/v${VERSION}/" "${RELEASE_WORK}/" \
  --endpoint-url "${RUSTFS_ENDPOINT}" \
  --recursive

echo ""
echo "Downloaded ${ARTIFACT_COUNT} artifacts to ${RELEASE_WORK}/"
ls -lh "${RELEASE_WORK}/"
echo ""
echo "RELEASE_WORK=${RELEASE_WORK}"
