#!/bin/sh
# late-command.sh — runs in the installer chroot before reboot.
# Args: $1=USERNAME  $2=UNLOCK_MODE  $3=SSH_PUBKEY_B64  $4=STATIC_IP  $5=GATEWAY  $6=DNS
#
# This script:
#   1. Stages the operator's SSH key for the deploy user
#   2. Drops a hardened sshd_config baseline (full hardening happens in Ansible)
#   3. Runs dropbear-setup.sh if --unlock=dropbear was selected
#   4. Writes a /etc/motd with next-step instructions
set -eu

USERNAME="$1"
UNLOCK_MODE="$2"
SSH_PUBKEY="$(echo "$3" | base64 -d)"
STATIC_IP="$4"
GATEWAY="$5"
# DNS is accepted for future use but not currently applied in the chroot.
# shellcheck disable=SC2034
DNS="$6"

# 1. Stage operator's SSH key for the deploy user
USER_HOME="/home/${USERNAME}"
mkdir -p "${USER_HOME}/.ssh"
echo "${SSH_PUBKEY}" > "${USER_HOME}/.ssh/authorized_keys"
chmod 700 "${USER_HOME}/.ssh"
chmod 600 "${USER_HOME}/.ssh/authorized_keys"
chown -R "${USERNAME}:${USERNAME}" "${USER_HOME}/.ssh"

# 2. Hardened sshd baseline (full hardening happens in Ansible)
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/00-llamenos-baseline.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
UsePAM yes
PermitEmptyPasswords no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF

# Helper: write failure sentinel and motd warning, then exit 1.
# Called explicitly on critical failures (POSIX sh has no ERR trap).
fail_sentinel() {
  reason="${1:-unknown}"
  printf 'late-command: FAILED: %s\n' "$reason" > /var/lib/llamenos-iso-build-failed
  chmod 644 /var/lib/llamenos-iso-build-failed
  cat > /etc/motd <<'FAILMOTD'

  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  WARNING: Llamenos ISO late-command FAILED during install!
  Remote LUKS unlock (dropbear) may NOT work correctly.
  Check /var/lib/llamenos-iso-build-failed for details.
  Re-image the system before putting it into service.
  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

FAILMOTD
  exit 1
}

# 3. Set up dropbear-initramfs if requested
if [ "${UNLOCK_MODE}" = "dropbear" ]; then
  /tmp/dropbear-setup.sh "${SSH_PUBKEY}" "${STATIC_IP}" "${GATEWAY}" || \
    fail_sentinel "dropbear-setup.sh failed"
fi

# 4. Ensure NTP is on (chrony will replace this in Ansible)
systemctl enable systemd-timesyncd 2>&1 || echo "WARNING: systemd-timesyncd enable failed (non-fatal)" >&2

# 5. Write success sentinel
touch /var/lib/llamenos-iso-build-ok
chmod 644 /var/lib/llamenos-iso-build-ok

# 6. First-boot welcome banner with next steps
cat > /etc/motd <<EOF

  Llamenos — fresh install (Debian 13)
  ──────────────────────────────────────────────
  Disk encryption:  LUKS2 + LVM (active)
  Unlock mode:      ${UNLOCK_MODE}
  SSH user:         ${USERNAME} (sudo, key-only)
  Install status:   OK (see /var/lib/llamenos-iso-build-ok)

  NEXT STEP — from your workstation:

    cd <llamenos-checkout>/deploy/ansible
    just bootstrap   # if not already done
    ansible-playbook setup.yml -i 'this-host,'

EOF

exit 0
