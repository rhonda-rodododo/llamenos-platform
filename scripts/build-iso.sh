#!/usr/bin/env bash
# scripts/build-iso.sh — host entrypoint for building a Llamenos FDE ISO.
# Validates flags and invokes the pinned Docker builder.
# See docs/deployment/iso-install.md for the operator guide.

set -euo pipefail

# Defaults
TARGET_HOSTNAME=""
SSH_KEY=""
UNLOCK="dropbear"
STATIC_IP="dhcp"
GATEWAY=""
DNS="9.9.9.9,149.112.112.112"
LOCALE="en_US.UTF-8"
TIMEZONE="UTC"
DEPLOY_USER="deploy"
DISK="/dev/sda"
DEBIAN_VERSION="13.4.0"
OUT_DIR="./dist/iso"
NO_CACHE=0
OFFLINE=0

usage() {
  cat <<'EOF'
Usage: scripts/build-iso.sh [OPTIONS]

Build a Llamenos FDE ISO based on Debian 13 netinst.

Required:
  --hostname HOSTNAME           Initial hostname for the installed system
  --ssh-key PATH                Path to SSH public key (ed25519 recommended)
                                  Used for both initramfs dropbear unlock AND
                                  the post-install deploy user's authorized_keys

Optional:
  --unlock {dropbear|console}   Unlock mechanism (default: dropbear)
  --static-ip CIDR              Static IP for initramfs network (default: dhcp)
  --gateway IP                  Gateway IP (required if --static-ip is set)
  --dns IP[,IP]                 DNS servers (default: 9.9.9.9,149.112.112.112)
  --locale LOCALE               Locale (default: en_US.UTF-8)
  --timezone TZ                 Timezone (default: UTC)
  --user USERNAME               Initial sudo user (default: deploy)
  --disk DEVICE                 Target disk device (default: /dev/sda)
                                  Use /dev/vda for paravirt VPS providers
  --debian-version VERSION      Debian point release (default: 13.4.0)
  --out PATH                    Output directory (default: ./dist/iso/)
  --no-cache                    Re-download upstream ISO even if cached
  --offline                     Refuse to fetch anything; require local cache
  -h, --help                    Show this help

See docs/deployment/iso-install.md for the operator guide.
EOF
}

err() {
  echo "build-iso: $*" >&2
  exit 2
}

# --- Input validators ---

validate_ip() {
  local ip="$1"
  # Must match dotted-quad pattern
  if ! printf '%s' "$ip" | grep -qE '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
    return 1
  fi
  # Each octet must be 0-255
  local IFS='.'
  # shellcheck disable=SC2086
  set -- $ip
  for octet in "$@"; do
    if [ "$octet" -gt 255 ] 2>/dev/null; then
      return 1
    fi
  done
  return 0
}

validate_cidr() {
  local cidr="$1"
  local ip="${cidr%/*}"
  local prefix="${cidr#*/}"
  if ! validate_ip "$ip"; then
    return 1
  fi
  # prefix must be numeric 0-32
  if ! printf '%s' "$prefix" | grep -qE '^[0-9]+$'; then
    return 1
  fi
  if [ "$prefix" -gt 32 ] 2>/dev/null; then
    return 1
  fi
  return 0
}

validate_dns_list() {
  local dns="$1"
  # Must be non-empty
  [ -n "$dns" ] || return 1
  # Split on commas and validate each entry
  local IFS=','
  # shellcheck disable=SC2086
  set -- $dns
  [ $# -ge 1 ] || return 1
  for entry in "$@"; do
    if ! validate_ip "$entry"; then
      return 1
    fi
  done
  return 0
}

validate_user() {
  local user="$1"
  if ! printf '%s' "$user" | grep -qE '^[a-z_][a-z0-9_-]{0,31}$'; then
    return 1
  fi
  return 0
}

validate_locale() {
  local locale="$1"
  if ! printf '%s' "$locale" | grep -qE '^[a-z]{2,3}(_[A-Z]{2})?(\.[A-Za-z0-9-]+)?$'; then
    return 1
  fi
  return 0
}

validate_timezone() {
  local tz="$1"
  if ! printf '%s' "$tz" | grep -qE '^[A-Za-z]+(/[A-Za-z_+-]+){0,2}$'; then
    return 1
  fi
  return 0
}

# Parse flags
while [ $# -gt 0 ]; do
  case "$1" in
    --hostname) TARGET_HOSTNAME="$2"; shift 2 ;;
    --ssh-key) SSH_KEY="$2"; shift 2 ;;
    --unlock) UNLOCK="$2"; shift 2 ;;
    --static-ip) STATIC_IP="$2"; shift 2 ;;
    --gateway) GATEWAY="$2"; shift 2 ;;
    --dns) DNS="$2"; shift 2 ;;
    --locale) LOCALE="$2"; shift 2 ;;
    --timezone) TIMEZONE="$2"; shift 2 ;;
    --user) DEPLOY_USER="$2"; shift 2 ;;
    --disk) DISK="$2"; shift 2 ;;
    --debian-version) DEBIAN_VERSION="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --no-cache) NO_CACHE=1; shift ;;
    --offline) OFFLINE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "unknown flag: $1" ;;
  esac
done

# Validate required
[ -n "$TARGET_HOSTNAME" ] || err "--hostname is required"
[ -n "$SSH_KEY" ] || err "--ssh-key is required"

# Validate hostname (RFC 1123 label)
if ! printf '%s' "$TARGET_HOSTNAME" | grep -qE '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'; then
  err "invalid hostname: $TARGET_HOSTNAME (must match ^[a-z0-9]([a-z0-9-]*[a-z0-9])?\$)"
fi

# Validate ssh key file exists and is readable
[ -r "$SSH_KEY" ] || err "ssh key not found or not readable: $SSH_KEY"

# Validate ssh key type — reject RSA.
# Use awk to scan all fields for one starting with ssh- or ecdsa- to handle
# authorized_keys option prefixes (e.g., "no-agent-forwarding ssh-ed25519 ...").
KEY_TYPE="$(awk '{for(i=1;i<=NF;i++)if($i~/^(ssh-|ecdsa-)/){print $i;exit}}' "$SSH_KEY" 2>/dev/null || echo unknown)"
case "$KEY_TYPE" in
  ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521) ;;
  ssh-rsa) err "unsupported ssh key type: ssh-rsa (use ed25519 — RSA is rejected for dropbear-initramfs in this builder)" ;;
  *) err "unsupported ssh key type: $KEY_TYPE (allowed: ssh-ed25519, ecdsa-sha2-*)" ;;
esac

# Validate unlock mode
case "$UNLOCK" in
  dropbear|console) ;;
  *) err "--unlock must be one of: dropbear, console (got: $UNLOCK)" ;;
esac

# Validate static-ip / gateway pairing
if [ "$STATIC_IP" != "dhcp" ]; then
  [ -n "$GATEWAY" ] || err "--gateway is required when --static-ip is set"
fi

# Validate disk path (must look like /dev/<word>)
if ! printf '%s' "$DISK" | grep -qE '^/dev/[a-z][a-z0-9]*$'; then
  err "invalid --disk: $DISK (must match /dev/[a-z][a-z0-9]*, e.g. /dev/sda or /dev/vda)"
fi

# Validate debian version (Debian 13 only in this builder)
if ! printf '%s' "$DEBIAN_VERSION" | grep -qE '^13\.[0-9]+\.[0-9]+$'; then
  err "--debian-version: only Debian 13 supported in this builder (got: $DEBIAN_VERSION)"
fi

# Validate network + identity inputs to prevent shell injection in late_command
if ! validate_dns_list "$DNS"; then
  err "invalid --dns: $DNS (must be comma-separated IPv4 addresses)"
fi
if [ "$STATIC_IP" != "dhcp" ]; then
  if ! validate_cidr "$STATIC_IP"; then
    err "invalid --static-ip: $STATIC_IP (must be CIDR notation, e.g. 192.0.2.10/24)"
  fi
fi
if [ -n "$GATEWAY" ]; then
  if ! validate_ip "$GATEWAY"; then
    err "invalid --gateway: $GATEWAY (must be a valid IPv4 address)"
  fi
fi
if ! validate_user "$DEPLOY_USER"; then
  err "invalid --user: $DEPLOY_USER (must match POSIX username: ^[a-z_][a-z0-9_-]{0,31}\$)"
fi
if ! validate_locale "$LOCALE"; then
  err "invalid --locale: $LOCALE (must match e.g. en_US.UTF-8)"
fi
if ! validate_timezone "$TIMEZONE"; then
  err "invalid --timezone: $TIMEZONE (must be IANA TZ name, e.g. UTC or America/New_York)"
fi

# Validate out dir is writable (or creatable)
mkdir -p "$OUT_DIR"
[ -w "$OUT_DIR" ] || err "output directory not writable: $OUT_DIR"

# Resolve absolute paths
SSH_KEY_ABS="$(readlink -f "$SSH_KEY")"
OUT_DIR_ABS="$(readlink -f "$OUT_DIR")"

if [ "${BUILD_ISO_DRY_RUN:-0}" = "1" ]; then
  echo "DRY RUN — resolved arguments:"
  echo "  hostname=$TARGET_HOSTNAME"
  echo "  ssh_key=$SSH_KEY_ABS"
  echo "  unlock=$UNLOCK"
  echo "  static_ip=$STATIC_IP"
  echo "  gateway=$GATEWAY"
  echo "  dns=$DNS"
  echo "  locale=$LOCALE"
  echo "  timezone=$TIMEZONE"
  echo "  username=$DEPLOY_USER"
  echo "  disk=$DISK"
  echo "  debian_version=$DEBIAN_VERSION"
  echo "  out_dir=$OUT_DIR_ABS"
  echo "  no_cache=$NO_CACHE"
  echo "  offline=$OFFLINE"
  exit 0
fi

# Real run path: build the image (cached) and run the container.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILDER_DIR="${SCRIPT_DIR}/iso-builder"

echo "==> Building builder image (uses cache when possible)"
docker build -t llamenos-iso-builder:latest "$BUILDER_DIR" >/dev/null

CACHE_DIR="${HOME}/.cache/llamenos-iso"
mkdir -p "$CACHE_DIR"

# Read the SSH key contents into a variable to pass via env
SSH_PUBKEY_CONTENTS="$(cat "$SSH_KEY_ABS")"

# Network flags: pass --network=none if --offline; otherwise default network
NET_FLAGS=()
if [ "$OFFLINE" = "1" ]; then
  NET_FLAGS+=(--network=none)
fi

echo "==> Running builder container"
docker run --rm \
  "${NET_FLAGS[@]}" \
  -v "${CACHE_DIR}:/cache" \
  -v "${OUT_DIR_ABS}:/out" \
  -e HOSTNAME="$TARGET_HOSTNAME" \
  -e USERNAME="$DEPLOY_USER" \
  -e LOCALE="$LOCALE" \
  -e TIMEZONE="$TIMEZONE" \
  -e DISK="$DISK" \
  -e UNLOCK_MODE="$UNLOCK" \
  -e STATIC_IP="$STATIC_IP" \
  -e GATEWAY="$GATEWAY" \
  -e DNS="$DNS" \
  -e SSH_PUBKEY="$SSH_PUBKEY_CONTENTS" \
  -e DEBIAN_VERSION="$DEBIAN_VERSION" \
  -e NO_CACHE="$NO_CACHE" \
  -e OFFLINE="$OFFLINE" \
  llamenos-iso-builder:latest

echo
echo "==> Done. Output:"
ls -lh "${OUT_DIR_ABS}/llamenos-fde-debian13-${UNLOCK}.iso"{,.sha256}
