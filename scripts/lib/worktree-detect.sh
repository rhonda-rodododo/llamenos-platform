#!/usr/bin/env bash
set -euo pipefail

worktree_name() {
  local git_dir
  git_dir="$(git rev-parse --git-dir 2>/dev/null || true)"
  if [[ "$git_dir" == *".git/worktrees/"* ]]; then
    basename "$(dirname "$git_dir")"
  else
    echo "main"
  fi
}

worktree_port_offset() {
  local name
  name="$(worktree_name)"
  if [[ "$name" == "main" ]]; then
    echo 0
  else
    echo "$name" | cksum | cut -d' ' -f1 | awk '{print $1 % 1000}'
  fi
}

worktree_db_suffix() {
  local name
  name="$(worktree_name)"
  if [[ "$name" == "main" ]]; then
    echo ""
  else
    echo "_w${name}"
  fi
}

worktree_log_prefix() {
  local name
  name="$(worktree_name)"
  if [[ "$name" == "main" ]]; then
    echo "llamenos"
  else
    echo "llamenos-${name}"
  fi
}

worktree_port() {
  local base_port="${1:-3001}"
  local offset
  offset="$(worktree_port_offset)"
  echo "$((base_port + offset))"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Worktree: $(worktree_name)"
  echo "Port offset: $(worktree_port_offset)"
  echo "DB suffix: $(worktree_db_suffix)"
  echo "Log prefix: $(worktree_log_prefix)"
  echo "Port for base 3001: $(worktree_port 3001)"
fi
