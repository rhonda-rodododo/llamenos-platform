#!/usr/bin/env zsh
set -euo pipefail

# Domain supervisor launcher — opens gnome-terminal with 6 named tabs,
# each running claude with the corresponding supervisor agent.

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Define supervisors: name, agent name
SUPERVISORS=(
  "ios:ios-supervisor"
  "android:android-supervisor"
  "desktop:desktop-supervisor"
  "backend:backend-supervisor"
  "shared:shared-supervisor"
  "infra:infra-supervisor"
)

show_help() {
  echo "Usage: $0 [--kill | --help]"
  echo ""
  echo "Launch 6 domain supervisor Claude Code sessions in gnome-terminal tabs."
  echo ""
  echo "Options:"
  echo "  --kill    Kill all running supervisor claude processes"
  echo "  --help    Show this help"
  echo ""
  echo "Tabs:"
  echo "  1: ios       — iOS supervisor"
  echo "  2: android   — Android supervisor"
  echo "  3: desktop   — Desktop supervisor"
  echo "  4: backend   — Backend supervisor"
  echo "  5: shared    — Shared platform supervisor"
  echo "  6: infra     — Infrastructure supervisor"
  echo ""
  echo "Navigate: Ctrl+PageUp/PageDown or Alt+1-6"
  exit 0
}

kill_supervisors() {
  echo "Looking for supervisor claude processes..."
  local found=0
  for entry in "${SUPERVISORS[@]}"; do
    IFS=: read -r name agent <<< "$entry"
    local pids=$(pgrep -f "claude --agent $agent" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      echo "  Killing $name supervisor (PIDs: $pids)"
      echo "$pids" | xargs kill 2>/dev/null || true
      found=1
    fi
  done
  if [[ $found -eq 0 ]]; then
    echo "  No supervisor processes found."
  fi
  exit 0
}

# Parse args
case "${1:-}" in
  --kill) kill_supervisors ;;
  --help|-h) show_help ;;
esac

# Build gnome-terminal command
# Each --tab gets its own -e and --title
CMD=(gnome-terminal)

for entry in "${SUPERVISORS[@]}"; do
  IFS=: read -r name agent <<< "$entry"
  CMD+=(--tab --title="$name" --working-directory="$PROJECT_DIR" -e "bash -c 'claude --dangerously-skip-permissions --rc --remote-control-session-name-prefix $agent --agent $agent --name $name; exec zsh'")
done

echo "Launching 6 supervisor tabs in gnome-terminal..."
echo "Navigate: Ctrl+PageUp/PageDown or Alt+1-6"
echo ""

"${CMD[@]}"
