#!/usr/bin/env bash
set -euo pipefail

# deploy-official.sh — Deploy Llamenos with official profile (full stack)
# Usage: ./deploy-official.sh [--check] [ansible-playbook extra args...]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANSIBLE_DIR="$(cd "$SCRIPT_DIR/../ansible" && pwd)"

check_dependencies() {
  for cmd in ansible-playbook ansible-vault ssh; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "Error: $cmd is required but not installed." >&2
      exit 1
    fi
  done
}

validate_vault() {
  local vault_file="$ANSIBLE_DIR/vars-production.yml"
  if [[ ! -f "$vault_file" ]]; then
    echo "Error: $vault_file not found." >&2
    echo "Create it with: ansible-vault create $vault_file" >&2
    exit 1
  fi

  if ! head -1 "$vault_file" | grep -q '^\$ANSIBLE_VAULT'; then
    echo "Error: $vault_file is not vault-encrypted." >&2
    echo "Encrypt it with: ansible-vault encrypt $vault_file" >&2
    exit 1
  fi
}

main() {
  check_dependencies
  validate_vault

  echo "Deploying Llamenos (official profile)..."
  echo "This includes: app, update server, monitoring, signal notifier, DNS validation"
  echo ""

  cd "$ANSIBLE_DIR"
  ansible-playbook setup.yml \
    -i inventory-production.yml \
    -e "@vars-production.yml" \
    -e "deployment_profile=official" \
    --ask-vault-pass \
    "$@"
}

main "$@"
