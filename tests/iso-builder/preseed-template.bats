#!/usr/bin/env bats
# tests/iso-builder/preseed-template.bats
#
# Tests for preseed.cfg.template variable substitution.
# Verifies that envsubst correctly renders all required placeholders.

setup() {
  TEMPLATE="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/scripts/iso-builder/preseed.cfg.template"
}

# ── Rendering ────────────────────────────────────────────────────────

@test "all required variables are substituted" {
  result="$(
    HOSTNAME=test-host \
    USERNAME=deploy \
    LOCALE=en_US.UTF-8 \
    TIMEZONE=UTC \
    DISK=/dev/sda \
    UNLOCK_MODE=dropbear \
    SSH_PUBKEY_B64=dGVzdA== \
    STATIC_IP=dhcp \
    GATEWAY= \
    DNS=9.9.9.9 \
    envsubst '${HOSTNAME} ${USERNAME} ${LOCALE} ${TIMEZONE} ${DISK} ${UNLOCK_MODE} ${SSH_PUBKEY_B64} ${STATIC_IP} ${GATEWAY} ${DNS}' \
      < "$TEMPLATE"
  )"
  # No unreplaced placeholders should remain
  run bash -c "echo \"\$result\" | grep -oP '\\$\\{[A-Z_]+\\}' | head -1"
  [ -z "$output" ]
}

@test "HOSTNAME placeholder is replaced" {
  result="$(
    HOSTNAME=myserver \
    USERNAME=deploy LOCALE=en_US.UTF-8 TIMEZONE=UTC DISK=/dev/sda \
    UNLOCK_MODE=dropbear SSH_PUBKEY_B64=dGVzdA== STATIC_IP=dhcp GATEWAY= DNS=9.9.9.9 \
    envsubst '${HOSTNAME} ${USERNAME} ${LOCALE} ${TIMEZONE} ${DISK} ${UNLOCK_MODE} ${SSH_PUBKEY_B64} ${STATIC_IP} ${GATEWAY} ${DNS}' \
      < "$TEMPLATE"
  )"
  [[ "$result" =~ "myserver" ]]
}

@test "USERNAME placeholder is replaced" {
  result="$(
    USERNAME=customuser \
    HOSTNAME=host LOCALE=en_US.UTF-8 TIMEZONE=UTC DISK=/dev/sda \
    UNLOCK_MODE=dropbear SSH_PUBKEY_B64=dGVzdA== STATIC_IP=dhcp GATEWAY= DNS=9.9.9.9 \
    envsubst '${HOSTNAME} ${USERNAME} ${LOCALE} ${TIMEZONE} ${DISK} ${UNLOCK_MODE} ${SSH_PUBKEY_B64} ${STATIC_IP} ${GATEWAY} ${DNS}' \
      < "$TEMPLATE"
  )"
  [[ "$result" =~ "customuser" ]]
}

@test "LOCALE placeholder is replaced" {
  result="$(
    LOCALE=fr_FR.UTF-8 \
    HOSTNAME=host USERNAME=deploy TIMEZONE=UTC DISK=/dev/sda \
    UNLOCK_MODE=dropbear SSH_PUBKEY_B64=dGVzdA== STATIC_IP=dhcp GATEWAY= DNS=9.9.9.9 \
    envsubst '${HOSTNAME} ${USERNAME} ${LOCALE} ${TIMEZONE} ${DISK} ${UNLOCK_MODE} ${SSH_PUBKEY_B64} ${STATIC_IP} ${GATEWAY} ${DNS}' \
      < "$TEMPLATE"
  )"
  [[ "$result" =~ "fr_FR.UTF-8" ]]
}

@test "template file exists and is non-empty" {
  [ -f "$TEMPLATE" ]
  [ -s "$TEMPLATE" ]
}

@test "template contains expected preseed directives" {
  [[ "$(cat "$TEMPLATE")" =~ "d-i debian-installer/locale" ]]
  [[ "$(cat "$TEMPLATE")" =~ "d-i netcfg/get_hostname" ]]
  [[ "$(cat "$TEMPLATE")" =~ "d-i passwd/username" ]]
}
