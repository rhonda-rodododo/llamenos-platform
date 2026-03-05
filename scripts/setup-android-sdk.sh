#!/usr/bin/env bash
#
# One-time Android SDK setup for emulator-based parallel E2E testing.
#
# Installs:
#   - Android command-line tools (if missing)
#   - Emulator
#   - System images (android-34 default x86_64)
#   - Creates 4 headless AVDs: test-emu-0 through test-emu-3
#   - Ensures KVM is available
#
# Usage:
#   bash scripts/setup-android-sdk.sh          # Full setup
#   bash scripts/setup-android-sdk.sh --avds   # Only create/recreate AVDs
#
# After running: source ~/.zshrc && emulator -version
#
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
CMDLINE_TOOLS_VERSION="13.0"
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
API_LEVEL="34"
SYSTEM_IMAGE="system-images;android-${API_LEVEL};default;x86_64"
NUM_AVDS="${NUM_AVDS:-4}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── KVM Check ────────────────────────────────────────────────
setup_kvm() {
    if [ -c /dev/kvm ]; then
        info "KVM is available at /dev/kvm"
        return 0
    fi

    warn "KVM device node /dev/kvm not found"

    # Check if CPU supports virtualization
    if ! grep -qE 'vmx|svm' /proc/cpuinfo; then
        error "CPU does not support hardware virtualization. Emulators will be very slow."
        return 1
    fi

    # Check dmesg/journal for KVM errors that indicate BIOS-level disablement
    local kvm_errors=""
    kvm_errors=$(dmesg 2>/dev/null | grep -i 'kvm.*not supported\|svm.*not supported\|vmx.*not supported\|kvm.*disabled' | tail -3) || \
    kvm_errors=$(journalctl -k 2>/dev/null | grep -i 'kvm.*not supported\|svm.*not supported\|vmx.*not supported\|kvm.*disabled' | tail -3) || true

    if [ -n "$kvm_errors" ]; then
        error "KVM is disabled at the hardware/BIOS level:"
        echo "$kvm_errors"
        echo ""
        if grep -q 'vendor_id.*AuthenticAMD' /proc/cpuinfo; then
            error "AMD CPU detected. Enable SVM (AMD-V) in BIOS:"
            error "  BIOS → Advanced → CPU Configuration → SVM Mode → Enabled"
            error "  (The exact path varies by motherboard manufacturer)"
        else
            error "Intel CPU detected. Enable VT-x in BIOS:"
            error "  BIOS → Advanced → CPU Configuration → Intel Virtualization Technology → Enabled"
        fi
        error "After enabling in BIOS, reboot and re-run this script."
        error "Emulators will fall back to software emulation (very slow)."
        return 1
    fi

    # Determine correct KVM module
    local kvm_module="kvm"
    if grep -q 'vendor_id.*GenuineIntel' /proc/cpuinfo; then
        kvm_module="kvm_intel"
    elif grep -q 'vendor_id.*AuthenticAMD' /proc/cpuinfo; then
        kvm_module="kvm_amd"
    fi

    info "Loading KVM module: ${kvm_module}"
    if ! sudo modprobe "$kvm_module" 2>/dev/null; then
        warn "Failed to load ${kvm_module}. Trying generic kvm..."
        sudo modprobe kvm 2>/dev/null || true
    fi

    # Create device node if module loaded but node missing
    if [ ! -c /dev/kvm ] && lsmod | grep -q "kvm_"; then
        info "Creating /dev/kvm device node"
        sudo mknod /dev/kvm c 10 232 2>/dev/null || true
        sudo chmod 666 /dev/kvm 2>/dev/null || true
    fi

    if [ -c /dev/kvm ]; then
        info "KVM is now available"
        # Ensure current user can access it
        sudo chmod 666 /dev/kvm 2>/dev/null || true
        return 0
    else
        error "Could not set up KVM. Check BIOS settings and kernel modules."
        error "Emulators will fall back to software emulation (very slow)."
        return 1
    fi
}

# ── SDK Installation ─────────────────────────────────────────
install_sdk() {
    mkdir -p "$ANDROID_HOME"

    # Install command-line tools if missing
    if [ ! -d "$ANDROID_HOME/cmdline-tools/latest" ]; then
        info "Installing Android command-line tools..."
        local tmp_zip="/tmp/cmdline-tools.zip"
        curl -fsSL "$CMDLINE_TOOLS_URL" -o "$tmp_zip"
        unzip -qo "$tmp_zip" -d "/tmp/cmdline-tools-extract"
        rm "$tmp_zip"
        mkdir -p "$ANDROID_HOME/cmdline-tools"
        mv "/tmp/cmdline-tools-extract/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
        rm -rf "/tmp/cmdline-tools-extract"
        info "Command-line tools installed"
    else
        info "Command-line tools already installed"
    fi

    local sdkmanager="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"

    # Accept all licenses
    yes | "$sdkmanager" --licenses > /dev/null 2>&1 || true

    # Install emulator + system image
    local packages_needed=()

    if [ ! -d "$ANDROID_HOME/emulator" ] || [ ! -f "$ANDROID_HOME/emulator/emulator" ]; then
        packages_needed+=("emulator")
    fi

    if [ ! -d "$ANDROID_HOME/platform-tools" ]; then
        packages_needed+=("platform-tools")
    fi

    if [ ! -d "$ANDROID_HOME/platforms/android-${API_LEVEL}" ]; then
        packages_needed+=("platforms;android-${API_LEVEL}")
    fi

    # Check for system image
    local sys_img_dir="$ANDROID_HOME/system-images/android-${API_LEVEL}/default/x86_64"
    if [ ! -d "$sys_img_dir" ]; then
        packages_needed+=("$SYSTEM_IMAGE")
    fi

    if [ ${#packages_needed[@]} -gt 0 ]; then
        info "Installing: ${packages_needed[*]}"
        "$sdkmanager" "${packages_needed[@]}"
    else
        info "All required SDK components already installed"
    fi
}

# ── PATH Setup ───────────────────────────────────────────────
setup_path() {
    local shell_rc=""
    if [ -f "$HOME/.zshrc" ]; then
        shell_rc="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        shell_rc="$HOME/.bashrc"
    fi

    if [ -z "$shell_rc" ]; then
        warn "No .zshrc or .bashrc found. Add these to your shell profile manually:"
        echo "  export ANDROID_HOME=$ANDROID_HOME"
        echo '  export PATH=$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH'
        return
    fi

    # Check if already configured
    if grep -q "ANDROID_HOME.*Android/Sdk" "$shell_rc" && grep -q 'emulator' "$shell_rc"; then
        info "PATH already configured in $shell_rc"
        return
    fi

    info "Adding Android SDK to PATH in $shell_rc"
    cat >> "$shell_rc" << 'PROFILE'

# Android SDK (added by scripts/setup-android-sdk.sh)
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
PROFILE

    info "Run 'source $shell_rc' to update current session"
}

# ── AVD Creation ─────────────────────────────────────────────
create_avds() {
    local avdmanager="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"
    export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

    info "Creating ${NUM_AVDS} headless AVDs..."

    for i in $(seq 0 $((NUM_AVDS - 1))); do
        local avd_name="test-emu-${i}"

        # Delete existing AVD if present
        "$avdmanager" delete avd -n "$avd_name" 2>/dev/null || true

        info "Creating AVD: ${avd_name}"
        echo "no" | "$avdmanager" create avd \
            -n "$avd_name" \
            -k "$SYSTEM_IMAGE" \
            -d "pixel_6a" \
            --force

        # Configure for headless CI use
        local avd_config="$HOME/.android/avd/${avd_name}.avd/config.ini"
        if [ -f "$avd_config" ]; then
            # Disable GPU, audio, boot animation for headless operation
            cat >> "$avd_config" << CONFIG
hw.gpu.enabled=yes
hw.gpu.mode=swiftshader_indirect
hw.audioInput=no
hw.audioOutput=no
hw.camera.back=none
hw.camera.front=none
hw.keyboard=yes
hw.ramSize=2048
hw.lcd.density=420
vm.heapSize=256
disk.dataPartition.size=2G
CONFIG
            info "Configured ${avd_name} for headless operation"
        fi
    done

    info "Created ${NUM_AVDS} AVDs. Verify with: avdmanager list avd"
}

# ── Main ─────────────────────────────────────────────────────
main() {
    info "Android SDK setup for parallel E2E testing"
    info "ANDROID_HOME: ${ANDROID_HOME}"

    if [ "${1:-}" = "--avds" ]; then
        create_avds
        return 0
    fi

    # Step 1: KVM
    setup_kvm || warn "Continuing without KVM acceleration"

    # Step 2: SDK components
    install_sdk

    # Step 3: PATH
    setup_path

    # Step 4: AVDs
    create_avds

    # Step 5: Verify
    export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
    info ""
    info "=== Verification ==="
    "$ANDROID_HOME/emulator/emulator" -version 2>/dev/null && info "Emulator: OK" || error "Emulator: FAILED"
    "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" list avd 2>/dev/null | grep "test-emu" && info "AVDs: OK" || error "AVDs: FAILED"
    [ -c /dev/kvm ] && info "KVM: OK" || warn "KVM: Not available (emulators will be slow)"

    info ""
    info "Setup complete! Run 'source ~/.zshrc' then test with:"
    info "  emulator -version"
    info "  avdmanager list avd"
    info "  scripts/android-parallel-e2e.sh 2   # Run with 2 shards"
}

main "$@"
