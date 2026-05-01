#!/usr/bin/env bats
# tests/iso-builder/build-iso.bats
#
# Unit tests for scripts/build-iso.sh argument parsing and validation.
# Uses BUILD_ISO_DRY_RUN=1 to exercise validation without running Docker.

setup() {
  # Create a temporary directory for test fixtures
  TEST_TMPDIR="$(mktemp -d)"
  # Create a valid ed25519 test key
  ssh-keygen -t ed25519 -N '' -f "${TEST_TMPDIR}/test_ed25519" -C test >/dev/null 2>&1
  TEST_KEY="${TEST_TMPDIR}/test_ed25519.pub"
  # Path to the script under test
  SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/scripts/build-iso.sh"
  # Enable dry-run mode for all tests so Docker is never invoked
  export BUILD_ISO_DRY_RUN=1
}

teardown() {
  rm -rf "$TEST_TMPDIR"
}

# Helper: run with dry-run + required args + extra args
run_dry() {
  bash "$SCRIPT" \
    --hostname test-host \
    --ssh-key "$TEST_KEY" \
    "$@"
}

# ── Required arguments ───────────────────────────────────────────────

@test "missing --hostname exits with error" {
  run bash "$SCRIPT" --ssh-key "$TEST_KEY"
  [ "$status" -ne 0 ]
  [[ "$output" =~ "--hostname is required" ]]
}

@test "missing --ssh-key exits with error" {
  run bash "$SCRIPT" --hostname test-host
  [ "$status" -ne 0 ]
  [[ "$output" =~ "--ssh-key is required" ]]
}

@test "valid required args succeed in dry-run" {
  run run_dry
  [ "$status" -eq 0 ]
  [[ "$output" =~ "hostname=test-host" ]]
}

# ── Hostname validation ──────────────────────────────────────────────

@test "hostname with invalid chars is rejected" {
  run bash "$SCRIPT" --hostname "invalid_host!" --ssh-key "$TEST_KEY"
  [ "$status" -ne 0 ]
  [[ "$output" =~ "invalid hostname" ]]
}

@test "hostname starting with hyphen is rejected" {
  run bash "$SCRIPT" --hostname "-badhost" --ssh-key "$TEST_KEY"
  [ "$status" -ne 0 ]
  [[ "$output" =~ "invalid hostname" ]]
}

@test "uppercase hostname is rejected" {
  run bash "$SCRIPT" --hostname "MYHOST" --ssh-key "$TEST_KEY"
  [ "$status" -ne 0 ]
  [[ "$output" =~ "invalid hostname" ]]
}

@test "single-char lowercase hostname is accepted" {
  run run_dry --hostname a
  [ "$status" -eq 0 ]
}

# ── SSH key type validation ──────────────────────────────────────────

@test "missing ssh key file exits with error" {
  run bash "$SCRIPT" --hostname test-host --ssh-key /nonexistent/key.pub
  [ "$status" -ne 0 ]
  [[ "$output" =~ "ssh key not found" ]]
}

@test "rsa key is rejected" {
  # Create a fake RSA key file (just the type prefix is what matters)
  echo "ssh-rsa AAAA... user@host" > "${TEST_TMPDIR}/rsa.pub"
  run bash "$SCRIPT" --hostname test-host --ssh-key "${TEST_TMPDIR}/rsa.pub"
  [ "$status" -ne 0 ]
  [[ "$output" =~ "ssh-rsa" ]]
}

@test "ed25519 key is accepted" {
  run run_dry
  [ "$status" -eq 0 ]
}

# ── Unlock mode ──────────────────────────────────────────────────────

@test "unlock=dropbear is accepted" {
  run run_dry --unlock dropbear
  [ "$status" -eq 0 ]
  [[ "$output" =~ "unlock=dropbear" ]]
}

@test "unlock=console is accepted" {
  run run_dry --unlock console
  [ "$status" -eq 0 ]
  [[ "$output" =~ "unlock=console" ]]
}

@test "unknown unlock mode is rejected" {
  run run_dry --unlock tpm
  [ "$status" -ne 0 ]
  [[ "$output" =~ "--unlock must be one of" ]]
}

# ── Static IP + gateway pairing ──────────────────────────────────────

@test "static-ip without gateway is rejected" {
  run run_dry --static-ip 192.0.2.10/24
  [ "$status" -ne 0 ]
  [[ "$output" =~ "--gateway is required" ]]
}

@test "static-ip with gateway is accepted" {
  run run_dry --static-ip 192.0.2.10/24 --gateway 192.0.2.1
  [ "$status" -eq 0 ]
  [[ "$output" =~ "static_ip=192.0.2.10/24" ]]
}

@test "invalid CIDR is rejected" {
  run run_dry --static-ip 999.0.0.1/24 --gateway 192.0.2.1
  [ "$status" -ne 0 ]
  [[ "$output" =~ "invalid --static-ip" ]]
}

@test "invalid gateway IP is rejected" {
  run run_dry --static-ip 192.0.2.10/24 --gateway notanip
  [ "$status" -ne 0 ]
  [[ "$output" =~ "invalid --gateway" ]]
}

# ── DNS validation ───────────────────────────────────────────────────

@test "valid DNS list is accepted" {
  run run_dry --dns 1.1.1.1,8.8.8.8
  [ "$status" -eq 0 ]
  [[ "$output" =~ "dns=1.1.1.1,8.8.8.8" ]]
}

@test "invalid DNS entry is rejected" {
  run run_dry --dns 1.1.1.1,notanip
  [ "$status" -ne 0 ]
  [[ "$output" =~ "invalid --dns" ]]
}

# ── Disk validation ──────────────────────────────────────────────────

@test "valid disk /dev/sda is accepted" {
  run run_dry --disk /dev/sda
  [ "$status" -eq 0 ]
  [[ "$output" =~ "disk=/dev/sda" ]]
}

@test "invalid disk path is rejected" {
  run run_dry --disk sda
  [ "$status" -ne 0 ]
  [[ "$output" =~ "invalid --disk" ]]
}

# ── Username validation ──────────────────────────────────────────────

@test "valid username is accepted" {
  run run_dry --user llamenos-deploy
  [ "$status" -eq 0 ]
  [[ "$output" =~ "username=llamenos-deploy" ]]
}

@test "username with uppercase is rejected" {
  run run_dry --user Root
  [ "$status" -ne 0 ]
  [[ "$output" =~ "invalid --user" ]]
}

# ── Debian version ───────────────────────────────────────────────────

@test "debian 13.x.y is accepted" {
  run run_dry --debian-version 13.4.0
  [ "$status" -eq 0 ]
}

@test "debian 12.x.y is rejected (only 13 supported)" {
  run run_dry --debian-version 12.5.0
  [ "$status" -ne 0 ]
  [[ "$output" =~ "only Debian 13 supported" ]]
}

# ── Unknown flag ─────────────────────────────────────────────────────

@test "unknown flag exits with error" {
  run run_dry --not-a-real-flag
  [ "$status" -ne 0 ]
  [[ "$output" =~ "unknown flag" ]]
}

# ── Help ─────────────────────────────────────────────────────────────

@test "--help exits cleanly" {
  run bash "$SCRIPT" -h
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Usage:" ]]
}
