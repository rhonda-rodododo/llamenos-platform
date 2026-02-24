#!/usr/bin/env bash
#
# dev-tunnel.sh — Expose the local Vite dev server via a Cloudflare Tunnel.
# Usage: bun run dev:tunnel
#
# Requires `cloudflared` to be installed.
# Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

set -euo pipefail

PORT="${DEV_PORT:-5173}"

if ! command -v cloudflared &>/dev/null; then
  echo "Error: cloudflared is not installed."
  echo ""
  echo "Install it for your platform:"
  echo "  macOS:  brew install cloudflared"
  echo "  Linux:  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  echo "  Arch:   pacman -S cloudflared"
  echo "  Debian: curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null"
  echo "          echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list"
  echo "          sudo apt update && sudo apt install cloudflared"
  exit 1
fi

echo "Starting Cloudflare Tunnel -> http://localhost:${PORT}"
echo "Press Ctrl+C to stop."
echo ""

exec cloudflared tunnel --url "http://localhost:${PORT}"
