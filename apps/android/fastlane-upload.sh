#!/usr/bin/env bash
# Fastlane Play Store upload via Docker (no local Ruby required)
# Usage: ./fastlane-upload.sh [metadata|internal|all]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Validate service account key
KEY_FILE="${GOOGLE_PLAY_JSON_KEY:-google-play-key.json}"
if [ ! -f "$KEY_FILE" ]; then
  echo "ERROR: Service account key not found at: $KEY_FILE"
  echo "Create one at: Google Play Console → Setup → API access → Service accounts"
  echo "Grant 'Release manager' permissions, download JSON key, save as google-play-key.json"
  exit 1
fi

# Validate AAB for internal/all
AAB_PATH="app/build/outputs/bundle/release/app-release.aab"
ACTION="${1:-all}"

if [[ "$ACTION" == "internal" || "$ACTION" == "all" ]]; then
  if [ ! -f "$AAB_PATH" ] && [ ! -L "$AAB_PATH" ]; then
    echo "ERROR: AAB not found at $AAB_PATH"
    echo "Build with: ./gradlew bundleRelease"
    exit 1
  fi
fi

echo "==> Running Fastlane via Docker (ruby:3.3-slim)..."
echo "    Action: $ACTION"
echo "    Key: $KEY_FILE"

run_fastlane() {
  local lane="$1"
  docker run --rm \
    -v "$SCRIPT_DIR":/work \
    -v "$(realpath "$AAB_PATH" 2>/dev/null || echo /dev/null)":/work/app/build/outputs/bundle/release/app-release.aab:ro \
    -e GOOGLE_PLAY_JSON_KEY=/work/"$KEY_FILE" \
    -w /work \
    ruby:3.3-slim \
    bash -c "
      apt-get update -qq > /dev/null 2>&1
      apt-get install -y -qq build-essential > /dev/null 2>&1
      gem install fastlane -N --quiet 2>&1 | tail -1
      cd fastlane/..
      fastlane $lane
    "
}

case "$ACTION" in
  metadata)
    run_fastlane "metadata"
    ;;
  internal)
    run_fastlane "internal"
    ;;
  all)
    echo "==> Uploading metadata + screenshots..."
    run_fastlane "metadata"
    echo ""
    echo "==> Uploading AAB to internal track..."
    run_fastlane "internal"
    ;;
  *)
    echo "Usage: $0 [metadata|internal|all]"
    exit 1
    ;;
esac

echo ""
echo "✓ Done. Check Play Console:"
echo "  https://play.google.com/console/u/0/developers/5368829321457184694/app/4975762233921342016/tracks/internal-testing"
