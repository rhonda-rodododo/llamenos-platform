#!/bin/sh
# dropbear-setup.sh — configure dropbear-initramfs for remote LUKS unlock.
# Runs in the installer chroot. Called by late-command.sh when --unlock=dropbear.
#
# Args: $1=SSH_PUBKEY  $2=STATIC_IP_OR_DHCP  $3=GATEWAY
#
# Trixie path: /etc/dropbear/initramfs/ (NOT the bookworm /etc/dropbear-initramfs/)
# Note: DNS is intentionally not passed — resolved name lookups happen in the
# live system, not in initramfs.
set -eu

# Helper functions must be defined BEFORE first use (POSIX shell does not hoist).
cidr_to_netmask() {
  cidr="$1"
  mask=""
  full=$((cidr / 8))
  part=$((cidr % 8))
  i=1
  while [ "$i" -le 4 ]; do
    if [ "$i" -le "$full" ]; then
      mask="${mask}255"
    elif [ "$i" -eq $((full + 1)) ]; then
      case "$part" in
        0) mask="${mask}0" ;;
        1) mask="${mask}128" ;;
        2) mask="${mask}192" ;;
        3) mask="${mask}224" ;;
        4) mask="${mask}240" ;;
        5) mask="${mask}248" ;;
        6) mask="${mask}252" ;;
        7) mask="${mask}254" ;;
      esac
    else
      mask="${mask}0"
    fi
    if [ "$i" -lt 4 ]; then
      mask="${mask}."
    fi
    i=$((i + 1))
  done
  echo "$mask"
}

# TEST_MODE=1 allows sourcing this file to access cidr_to_netmask without
# running the installer body (which requires apt-get, system paths, etc.).
if [ "${TEST_MODE:-0}" != "1" ]; then

SSH_PUBKEY="$1"
STATIC_IP="$2"
GATEWAY="$3"

# Install dropbear-initramfs.
# DEBIAN_FRONTEND=noninteractive is REQUIRED here: the dropbear-initramfs
# postinst triggers debconf prompts that would otherwise block on a tty
# that doesn't exist inside the d-i chroot, hanging the installer
# indefinitely during the late_command phase. Discovered during T11
# headless qemu testing (2026-04-11).
export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold" \
  dropbear-initramfs

# Trixie path
mkdir -p /etc/dropbear/initramfs
echo "${SSH_PUBKEY}" > /etc/dropbear/initramfs/authorized_keys
chmod 600 /etc/dropbear/initramfs/authorized_keys

# Constrain dropbear:
#   -I 300 : idle timeout 5 min
#   -j -k  : disable local + remote port forwarding
#   -p 2222: port 2222 (avoid clashing with installed sshd on 22)
#   -s     : disable password auth
#   -c cryptroot-unlock : forced command — only thing this key can do
cat > /etc/dropbear/initramfs/dropbear.conf <<'EOF'
DROPBEAR_OPTIONS="-I 300 -j -k -p 2222 -s -c cryptroot-unlock"
EOF

# Network config for initramfs
if [ "${STATIC_IP}" = "dhcp" ]; then
  echo "IP=dhcp" >> /etc/initramfs-tools/initramfs.conf
else
  IP_ADDR="${STATIC_IP%/*}"
  CIDR="${STATIC_IP#*/}"
  NETMASK="$(cidr_to_netmask "${CIDR}")"
  # klibc 7-field syntax: ip=<client>::<gw>:<netmask>::<iface>:off
  IP_LINE="ip=${IP_ADDR}::${GATEWAY}:${NETMASK}::eth0:off"
  echo "IP=${IP_LINE}" >> /etc/initramfs-tools/initramfs.conf
fi

# Rebuild initramfs to include dropbear, keys, and network config
update-initramfs -u -k all

fi # end TEST_MODE guard
