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
  echo "Usage: $0 [name...] [--kill [name...]] [--help]"
  echo ""
  echo "Launch domain supervisor Claude Code sessions in gnome-terminal tabs."
  echo ""
  echo "Options:"
  echo "  (no args)         Launch ALL 6 supervisors in tabs"
  echo "  <name> [name...]  Launch only the named supervisor(s)"
  echo "  --kill            Kill all running supervisor processes"
  echo "  --kill <name...>  Kill only the named supervisor(s)"
  echo "  --help            Show this help"
  echo ""
  echo "Names: ios, android, desktop, backend, shared, infra"
  echo ""
  echo "Examples:"
  echo "  $0                    # All 6 supervisors"
  echo "  $0 shared             # Just shared-supervisor"
  echo "  $0 ios desktop        # iOS + Desktop supervisors"
  echo "  $0 --kill shared      # Kill just the shared supervisor"
  echo ""
  echo "Navigate tabs: Ctrl+PageUp/PageDown or Alt+1-6"
  exit 0
}

# Resolve a short name (e.g. "shared") to the SUPERVISORS entry
resolve_entry() {
  local target="$1"
  for entry in "${SUPERVISORS[@]}"; do
    IFS=: read -r name agent <<< "$entry"
    if [[ "$name" == "$target" ]]; then
      echo "$entry"
      return 0
    fi
  done
  echo "ERROR: Unknown supervisor '$target'. Valid: ios, android, desktop, backend, shared, infra" >&2
  return 1
}

kill_supervisors() {
  shift  # remove --kill
  local targets=("$@")
  local entries=()

  if [[ ${#targets[@]} -eq 0 ]]; then
    entries=("${SUPERVISORS[@]}")
  else
    for t in "${targets[@]}"; do
      local entry
      entry=$(resolve_entry "$t") || exit 1
      entries+=("$entry")
    done
  fi

  echo "Looking for supervisor claude processes..."
  local found=0
  for entry in "${entries[@]}"; do
    IFS=: read -r name agent <<< "$entry"
    local pids=$(pgrep -f "claude --agent $agent" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      echo "  Killing $name supervisor (PIDs: $pids)"
      echo "$pids" | xargs kill 2>/dev/null || true
      found=1
    fi
  done
  if [[ $found -eq 0 ]]; then
    echo "  No matching supervisor processes found."
  fi
  exit 0
}

# Parse args
case "${1:-}" in
  --kill) kill_supervisors "$@" ;;
  --help|-h) show_help ;;
esac

# Collect which supervisors to launch
launch_entries=()
if [[ $# -eq 0 ]]; then
  launch_entries=("${SUPERVISORS[@]}")
else
  for arg in "$@"; do
    entry=$(resolve_entry "$arg") || exit 1
    launch_entries+=("$entry")
  done
fi

# Build gnome-terminal command
CMD=(gnome-terminal)

for entry in "${launch_entries[@]}"; do
  IFS=: read -r name agent <<< "$entry"
  CMD+=(--tab --title="$name" --working-directory="$PROJECT_DIR" -e "bash -c 'claude --dangerously-skip-permissions --rc --remote-control-session-name-prefix $agent --agent $agent --name $name; exec zsh'")
done

names=()
for entry in "${launch_entries[@]}"; do
  IFS=: read -r name _ <<< "$entry"
  names+=("$name")
done
echo "Launching ${#launch_entries[@]} supervisor(s): ${names[*]}"
echo ""

"${CMD[@]}"
