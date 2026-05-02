#!/usr/bin/env bash
# screenshots.sh — Android Play Store screenshot capture
#
# USAGE
#   ./fastlane/screenshots.sh [DEVICE_SERIAL]
#
# PREREQUISITES
#   - Android emulator or device connected via adb
#   - App installed in debug build: ./gradlew installDebug
#   - adb in PATH
#
# OUTPUT
#   Screenshots land in fastlane/metadata/android/en-US/phoneScreenshots/
#   Tablet screenshots: fastlane/metadata/android/en-US/sevenInchScreenshots/
#
# REQUIRED RESOLUTIONS
#   Phone:        1080 × 2400 px  (20:9, FHD+)
#   7" tablet:    1200 × 2000 px  (5:3 portrait)
#   10" tablet:   1920 × 1200 px  (landscape) or 1200 × 1920 px (portrait)
#
# EMULATOR SETUP (phone)
#   AVD Manager → Pixel 6 → API 34 — display: 1080 × 2400, 420 dpi
#   avdmanager create avd -n llamenos-screenshots -k "system-images;android-34;google_apis;x86_64" -d pixel_6
#
# EMULATOR SETUP (7" tablet)
#   AVD Manager → 7" WSVGA Tablet → API 34 — display: 1024 × 600 (scale up via wm size)
#   After boot: adb shell wm size 1200x2000 && adb shell wm density 213
#
# SCREENS TO CAPTURE (in order)
#   1. dashboard        — on-shift status, upcoming shifts, incoming call state
#   2. incoming-call    — in-app call answer screen with volunteer info
#   3. note-editor      — call note editor with encryption badge visible
#   4. case-report      — template-driven report form with custom fields
#   5. shift-schedule   — shift management and calendar view
#   6. admin-volunteers — admin volunteer list with role badges
#   7. settings-security — security settings showing key info and encryption status

set -euo pipefail

DEVICE="${1:-}"
PACKAGE="org.llamenos.hotline"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHONE_DIR="$SCRIPT_DIR/metadata/android/en-US/phoneScreenshots"
TABLET_DIR="$SCRIPT_DIR/metadata/android/en-US/sevenInchScreenshots"

mkdir -p "$PHONE_DIR" "$TABLET_DIR"

ADB_ARGS=""
if [[ -n "$DEVICE" ]]; then
  ADB_ARGS="-s $DEVICE"
fi

# Wait for device to be ready
adb $ADB_ARGS wait-for-device

# Helper: capture a screenshot with a descriptive name
capture() {
  local name="$1"
  local dest="$2"
  echo "Capturing: $name → $dest"
  adb $ADB_ARGS shell screencap -p "/sdcard/llamenos_screenshot.png"
  adb $ADB_ARGS pull "/sdcard/llamenos_screenshot.png" "$dest"
  adb $ADB_ARGS shell rm "/sdcard/llamenos_screenshot.png"
}

# Helper: launch an activity or deep link and wait for it to render
launch_and_wait() {
  local intent="$1"
  local delay="${2:-2}"
  adb $ADB_ARGS shell am start -n "$PACKAGE/$intent"
  sleep "$delay"
}

# ── PHONE SCREENSHOTS ────────────────────────────────────────────────────────
echo ""
echo "=== Phone screenshots ==="
echo "Ensure the phone emulator is running (1080x2400, 420dpi)"
echo "Press Enter when the emulator is booted and app is installed..."
read -r

# 1. Dashboard / home screen
launch_and_wait ".ui.MainActivity" 3
capture "01-dashboard" "$PHONE_DIR/01-dashboard.png"

# 2. Incoming call screen
echo "Trigger an incoming call from your test hub, then press Enter..."
read -r
capture "02-incoming-call" "$PHONE_DIR/02-incoming-call.png"

# 3. Note editor (open a call note)
echo "Navigate to a call note editor, then press Enter..."
read -r
capture "03-note-editor" "$PHONE_DIR/03-note-editor.png"

# 4. Case report form
echo "Navigate to a case report form, then press Enter..."
read -r
capture "04-case-report" "$PHONE_DIR/04-case-report.png"

# 5. Shift schedule
echo "Navigate to the shift schedule view, then press Enter..."
read -r
capture "05-shift-schedule" "$PHONE_DIR/05-shift-schedule.png"

# 6. Admin volunteer list (requires admin account)
echo "Navigate to the admin volunteer list, then press Enter..."
read -r
capture "06-admin-volunteers" "$PHONE_DIR/06-admin-volunteers.png"

# 7. Security settings
echo "Navigate to Settings → Security, then press Enter..."
read -r
capture "07-settings-security" "$PHONE_DIR/07-settings-security.png"

echo ""
echo "Phone screenshots saved to: $PHONE_DIR"
ls -la "$PHONE_DIR"

# ── TABLET SCREENSHOTS ───────────────────────────────────────────────────────
echo ""
echo "=== 7-inch tablet screenshots ==="
echo "Switch to tablet emulator (1200x2000, 213dpi), then press Enter..."
read -r

for i in 01-dashboard 02-incoming-call 03-note-editor 04-case-report 05-shift-schedule 06-admin-volunteers 07-settings-security; do
  phone_file="$PHONE_DIR/${i}.png"
  tablet_file="$TABLET_DIR/${i}.png"
  if [[ -f "$phone_file" ]]; then
    echo "Re-capture $i for tablet (1200x2000)..."
    echo "Navigate to the same screen on tablet, then press Enter..."
    read -r
    capture "$i" "$tablet_file"
  fi
done

echo ""
echo "Tablet screenshots saved to: $TABLET_DIR"
echo ""
echo "Done. Review screenshots before uploading:"
echo "  Phone:  $PHONE_DIR"
echo "  Tablet: $TABLET_DIR"
echo ""
echo "Upload to Play Store with:"
echo "  cd apps/android && bundle exec fastlane metadata"
