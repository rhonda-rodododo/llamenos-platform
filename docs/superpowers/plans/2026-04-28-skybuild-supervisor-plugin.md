# Skybuild Supervisor Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the supervising-dispatched-sessions skill as a standalone Claude Code + opencode plugin with hook-based role enforcement, auto-init, and progress-file communication — distributed from the skybuild repo.

**Architecture:** A plugin at `plugins/supervisor/` in the skybuild repo. Ships a skill (SKILL.md), hooks (hooks.json), shell scripts (dispatch, status, bootstrap, init), and prompt templates. Runtime state lives at `~/.skybuild-supervisor/`. Hooks enforce dispatcher discipline via a lock file. Workers communicate progress via filesystem.

**Tech Stack:** Bash (scripts), YAML (config), Markdown (skill/templates), JSON (plugin manifests)

**Working directory:** `/media/rikki/recover2/projects/skybuild`

---

### Task 1: Scaffold Plugin Directory Structure

**Files:**
- Create: `plugins/supervisor/.claude-plugin/plugin.json`
- Create: `plugins/supervisor/.opencode/INSTALL.md`
- Create: `plugins/supervisor/README.md`

- [ ] **Step 1: Create the plugin directory tree**

```bash
cd /media/rikki/recover2/projects/skybuild
mkdir -p plugins/supervisor/.claude-plugin
mkdir -p plugins/supervisor/.opencode
mkdir -p plugins/supervisor/skills/supervising-dispatched-sessions
mkdir -p plugins/supervisor/hooks
mkdir -p plugins/supervisor/scripts
mkdir -p plugins/supervisor/templates
```

- [ ] **Step 2: Write the Claude Code plugin manifest**

Create `plugins/supervisor/.claude-plugin/plugin.json`:

```json
{
  "name": "skybuild-supervisor",
  "description": "Dispatch and coordinate parallel AI worker sessions across models and harnesses (Claude, opencode/Kimi, etc.)",
  "version": "0.1.0",
  "author": {
    "name": "SkyBuild",
    "url": "https://github.com/skybuild-io/skybuild"
  },
  "repository": "https://github.com/skybuild-io/skybuild",
  "license": "MIT",
  "keywords": ["supervisor", "dispatch", "parallel", "agents", "orchestration"]
}
```

- [ ] **Step 3: Write the opencode install guide**

Create `plugins/supervisor/.opencode/INSTALL.md`:

```markdown
# Installing skybuild-supervisor for opencode

1. Clone the plugin:
   ```bash
   git clone https://github.com/skybuild-io/skybuild.git /tmp/skybuild
   ```

2. Copy the skill to your skills directory:
   ```bash
   mkdir -p ~/.opencode/skills/supervising-dispatched-sessions
   cp /tmp/skybuild/plugins/supervisor/skills/supervising-dispatched-sessions/SKILL.md \
      ~/.opencode/skills/supervising-dispatched-sessions/
   ```

3. Copy scripts:
   ```bash
   cp /tmp/skybuild/plugins/supervisor/scripts/* ~/.skybuild-supervisor/scripts/
   chmod +x ~/.skybuild-supervisor/scripts/*.sh
   ```

4. Add `dstat` alias to your shell profile:
   ```bash
   echo 'alias dstat="bash ~/.skybuild-supervisor/scripts/status.sh"' >> ~/.zshrc
   ```

5. Run init in your project:
   ```bash
   bash ~/.skybuild-supervisor/scripts/init.sh
   ```

Note: opencode does not support hooks.json — role enforcement is instruction-only.
```

- [ ] **Step 4: Write the README**

Create `plugins/supervisor/README.md`:

```markdown
# skybuild-supervisor

Dispatch and coordinate parallel AI worker sessions across models and harnesses.

## What It Does

You act as a **coordinator, not a worker**. When you need multiple PR fixes, CI investigations, or batch work done in parallel, you dispatch isolated AI sessions (Claude, Kimi, DeepSeek, etc.) via tmux and monitor their progress through status files.

## Installation

### Claude Code
```bash
claude plugin add skybuild-supervisor
```

Or manually: clone this repo and symlink `plugins/supervisor/` into `~/.claude/plugins/`.

### opencode
See `.opencode/INSTALL.md`.

## First Run

The plugin auto-initializes on first use:
1. Detects installed harnesses (claude, opencode)
2. Writes `~/.skybuild-supervisor/supervisor.yml` with detected models
3. Offers to add dispatcher instructions to your project's CLAUDE.md / AGENTS.md
4. Creates `.supervisor-rules.md` in your project root (project-specific worker rules)

## Usage

Say "dispatch", "supervisor", "coordinate", or "queue up" to activate dispatcher mode.

### Key Commands
- `dstat` — worker status table (running + recent)
- `dstat --24h` — widen to 24h window
- `dstat --all` — all status files regardless of age
- `dispatch-one.sh <name> <prompt-file> [timeout] [model]` — dispatch a single worker

### Dispatcher Mode
When active, hooks block Edit/Write/test commands — you can only:
- Write prompt files (to `~/.skybuild-supervisor/prompts/`)
- Dispatch workers via scripts
- Monitor status via `dstat`
- Check PRs via `gh`

Say "stop dispatching" or "exit supervisor" to deactivate.

## Configuration

Edit `~/.skybuild-supervisor/supervisor.yml` to customize models, timeouts, and routing.

## Runtime State

```
~/.skybuild-supervisor/
├── supervisor.yml          # Config
├── active-session.lock     # Exists when in dispatcher mode
├── logs/                   # Worker stdout/stderr
├── status/                 # .status and .progress files
├── prompts/                # Generated prompt files
└── scripts/                # Installed scripts (if not using plugin path)
```
```

- [ ] **Step 5: Commit scaffold**

```bash
cd /media/rikki/recover2/projects/skybuild
git add plugins/supervisor/
git commit -m "feat(supervisor): scaffold plugin directory structure"
```

---

### Task 2: Write the Hooks

**Files:**
- Create: `plugins/supervisor/hooks/hooks.json`

- [ ] **Step 1: Write hooks.json**

Create `plugins/supervisor/hooks/hooks.json`:

```json
{
  "hooks": [
    {
      "matcher": {
        "tool_name": ["Edit", "Write", "NotebookEdit"]
      },
      "hook": {
        "type": "command",
        "command": "test -f ~/.skybuild-supervisor/active-session.lock && echo 'BLOCKED: You are in dispatcher mode. Write a prompt file and dispatch a worker instead of editing code directly. Say \"stop dispatching\" to exit dispatcher mode.' && exit 1 || exit 0"
      }
    },
    {
      "matcher": {
        "tool_name": "Bash",
        "input_contains": ["cargo test", "cargo clippy", "bun run test", "bun run typecheck", "bunx playwright", "playwright test", "xcodebuild", "gradlew", "pytest", "npm test", "yarn test", "pnpm test", "go test", "make test"]
      },
      "hook": {
        "type": "command",
        "command": "test -f ~/.skybuild-supervisor/active-session.lock && echo 'BLOCKED: You are in dispatcher mode. Dispatch a worker to run tests/builds, do not run them yourself. Say \"stop dispatching\" to exit dispatcher mode.' && exit 1 || exit 0"
      }
    }
  ]
}
```

- [ ] **Step 2: Verify hook syntax is valid JSON**

```bash
cd /media/rikki/recover2/projects/skybuild
python3 -c "import json; json.load(open('plugins/supervisor/hooks/hooks.json')); print('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit hooks**

```bash
git add plugins/supervisor/hooks/
git commit -m "feat(supervisor): add hook-based role enforcement for dispatcher mode"
```

---

### Task 3: Write the Init Script

**Files:**
- Create: `plugins/supervisor/scripts/init.sh`

- [ ] **Step 1: Write init.sh**

Create `plugins/supervisor/scripts/init.sh`:

```bash
#!/usr/bin/env bash
# First-run setup for skybuild-supervisor.
# Detects installed harnesses, writes supervisor.yml, creates directory structure.
#
# Usage:
#   bash plugins/supervisor/scripts/init.sh
#   # or after install:
#   bash ~/.skybuild-supervisor/scripts/init.sh

set -uo pipefail

SUPERVISOR_DIR="$HOME/.skybuild-supervisor"
CONFIG_FILE="$SUPERVISOR_DIR/supervisor.yml"

echo "=== skybuild-supervisor init ==="
echo

# ─── Create directory structure ───────────────────────────────────────
mkdir -p "$SUPERVISOR_DIR"/{logs,status,prompts,scripts}
echo "✓ created $SUPERVISOR_DIR/{logs,status,prompts,scripts}"

# ─── Detect harnesses ────────────────────────────────────────────────
claude_installed=false
claude_models="[opus, sonnet, haiku]"
if command -v claude &>/dev/null; then
  claude_installed=true
  echo "✓ claude detected: $(which claude)"
else
  echo "⚠ claude not found"
fi

opencode_installed=false
opencode_models="[]"
if command -v opencode &>/dev/null; then
  opencode_installed=true
  echo "✓ opencode detected: $(which opencode)"
  # Try to discover available models
  oc_models=$(opencode models 2>/dev/null | grep -oE '[a-z0-9_-]+/[a-zA-Z0-9._-]+' | head -10)
  if [[ -n "$oc_models" ]]; then
    # Format as YAML list
    opencode_models="[$(echo "$oc_models" | paste -sd, | sed 's/,/, /g')]"
    echo "  models: $opencode_models"
  else
    opencode_models="[kimi-for-coding/k2p5]"
    echo "  models: (defaulting to kimi-for-coding/k2p5)"
  fi
else
  echo "⚠ opencode not found"
fi

if [[ "$claude_installed" == "false" && "$opencode_installed" == "false" ]]; then
  echo "❌ no harnesses found — install claude or opencode first"
  exit 1
fi

# ─── Write supervisor.yml ─────────────────────────────────────────────
if [[ -f "$CONFIG_FILE" ]]; then
  echo
  echo "⚠ $CONFIG_FILE already exists — skipping (edit manually to reconfigure)"
else
  cat > "$CONFIG_FILE" <<YAML
# skybuild-supervisor configuration
# Written by init on $(date -I). User-editable.

harnesses:
  claude:
    installed: ${claude_installed}
    models: ${claude_models}
    default_model: sonnet
    flags: "--print --dangerously-skip-permissions --output-format=stream-json --verbose"
  opencode:
    installed: ${opencode_installed}
    models: ${opencode_models}
    default_model: kimi-for-coding/k2p5
    flags: "--dangerously-skip-permissions --format json"

defaults:
  timeout_sec: 5400
  max_concurrent: 2
  worktree_base: ~/projects

routing:
  # Model selection heuristic overrides (task category → model)
  security_fix: opus
  bulk_rename: kimi-for-coding/k2p5
  comment_triage: haiku
  routine_refactor: sonnet

projects: {}
  # Add per-project config like:
  # /path/to/project:
  #   rules_file: .supervisor-rules.md
YAML
  echo "✓ wrote $CONFIG_FILE"
fi

# ─── Set up dstat alias ──────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATUS_SCRIPT="$SCRIPT_DIR/status.sh"

# Check if alias already exists
if ! grep -q 'alias dstat=' "$HOME/.zshrc" 2>/dev/null && \
   ! grep -q 'alias dstat=' "$HOME/.bashrc" 2>/dev/null; then
  shell_rc="$HOME/.zshrc"
  [[ ! -f "$shell_rc" ]] && shell_rc="$HOME/.bashrc"
  if [[ -f "$shell_rc" ]]; then
    echo "" >> "$shell_rc"
    echo "# skybuild-supervisor status alias" >> "$shell_rc"
    echo "alias dstat='bash ${STATUS_SCRIPT}'" >> "$shell_rc"
    echo "✓ added dstat alias to $shell_rc (restart shell or: source $shell_rc)"
  fi
else
  echo "✓ dstat alias already configured"
fi

# ─── Migrate from legacy paths ───────────────────────────────────────
legacy_status="$HOME/tier-overnight-status"
legacy_prompts="$HOME/tier-prompts"
migrated=false

if [[ -d "$legacy_status" && "$(ls -A "$legacy_status" 2>/dev/null)" ]]; then
  echo
  echo "Found legacy status files at $legacy_status"
  echo "  → migrating to $SUPERVISOR_DIR/status/"
  cp -n "$legacy_status"/* "$SUPERVISOR_DIR/status/" 2>/dev/null
  migrated=true
fi

if [[ -d "$legacy_prompts" && "$(ls -A "$legacy_prompts" 2>/dev/null)" ]]; then
  echo "Found legacy prompts at $legacy_prompts"
  echo "  → migrating to $SUPERVISOR_DIR/prompts/"
  cp -n "$legacy_prompts"/* "$SUPERVISOR_DIR/prompts/" 2>/dev/null
  migrated=true
fi

if [[ "$migrated" == "true" ]]; then
  echo "  (legacy dirs preserved — remove manually when satisfied)"
fi

echo
echo "=== init complete ==="
echo
echo "Next steps:"
echo "  1. Edit $CONFIG_FILE to customize models and defaults"
echo "  2. In your project, create .supervisor-rules.md with project-specific worker rules"
echo "  3. Add the dispatcher block to your project's CLAUDE.md or AGENTS.md"
echo "     (the skill will offer to do this on first use in a project)"
```

- [ ] **Step 2: Make executable and commit**

```bash
chmod +x plugins/supervisor/scripts/init.sh
git add plugins/supervisor/scripts/init.sh
git commit -m "feat(supervisor): add auto-init script with harness detection and legacy migration"
```

---

### Task 4: Port and Update Shell Scripts

**Files:**
- Create: `plugins/supervisor/scripts/status.sh` (port from `~/.claude/skills/supervising-dispatched-sessions/status.sh`)
- Create: `plugins/supervisor/scripts/bootstrap.sh` (port from existing)
- Create: `plugins/supervisor/scripts/dispatch-one.sh` (port from existing)
- Create: `plugins/supervisor/scripts/supervisor-template.sh` (port from existing)

All scripts need the same set of changes:
- `~/tier-overnight-status/` → `~/.skybuild-supervisor/status/`
- `~/tier-prompts/` → `~/.skybuild-supervisor/prompts/`
- `~/${name}.log` → `~/.skybuild-supervisor/logs/${name}.log`
- Hardcoded repo paths → discovered from `$DISPATCH_REPO` or `$(git rev-parse --show-toplevel)`
- Add `.progress` file reading to `status.sh`

- [ ] **Step 1: Port status.sh with progress file support**

Copy `~/.claude/skills/supervising-dispatched-sessions/status.sh` to `plugins/supervisor/scripts/status.sh`, then apply these changes:

1. Change `STATUS_DIR="$HOME/tier-overnight-status"` to `STATUS_DIR="$HOME/.skybuild-supervisor/status"`
2. Change all `$HOME/${name}.log` references to `$HOME/.skybuild-supervisor/logs/${name}.log`
3. Change all `$HOME/${name}-worker.log` references to `$HOME/.skybuild-supervisor/logs/${name}-worker.log`
4. Add a `resolve_phase()` function that reads `.progress` files:

```bash
resolve_phase() {
  local name="$1"
  local progress_file="$STATUS_DIR/${name}.progress"
  if [[ -f "$progress_file" ]]; then
    grep -E '^phase:' "$progress_file" 2>/dev/null | sed 's/^phase: *//'
  else
    echo "—"
  fi
}

resolve_progress_note() {
  local name="$1"
  local progress_file="$STATUS_DIR/${name}.progress"
  if [[ -f "$progress_file" ]]; then
    grep -E '^current:' "$progress_file" 2>/dev/null | sed 's/^current: *//' | sed 's/^"//; s/"$//'
  fi
}
```

5. Add `phase` column to the output table header and each row
6. When status is RUNNING, prefer `resolve_progress_note` over log tail for the note column

The full updated `status.sh` should produce output like:

```
| worker | status | phase | pid | pr | elapsed | started | note |
```

- [ ] **Step 2: Port bootstrap.sh**

Copy `~/.claude/skills/supervising-dispatched-sessions/bootstrap.sh` to `plugins/supervisor/scripts/bootstrap.sh`. Changes:

1. `STATUS_DIR="$HOME/tier-overnight-status"` → `STATUS_DIR="$HOME/.skybuild-supervisor/status"`
2. `PROMPT_DIR="$HOME/tier-prompts"` → `PROMPT_DIR="$HOME/.skybuild-supervisor/prompts"`
3. Replace hardcoded `cd /media/rikki/recover2/projects/llamenos-hotline` with:
   ```bash
   MAIN_REPO="${DISPATCH_REPO:-$(git rev-parse --show-toplevel 2>/dev/null)}"
   cd "$MAIN_REPO" 2>/dev/null && {
   ```
4. Update log discovery glob to look in `~/.skybuild-supervisor/logs/` as well as `~/`
5. Update `SCRIPT_DIR` to reference `status.sh` relative to itself

- [ ] **Step 3: Port dispatch-one.sh**

Copy `~/.claude/skills/supervising-dispatched-sessions/dispatch-one.sh` to `plugins/supervisor/scripts/dispatch-one.sh`. Changes:

1. `PROMPT_DIR="$HOME/tier-prompts"` → `PROMPT_DIR="$HOME/.skybuild-supervisor/prompts"`
2. `WORKER_LOG="$HOME/${name}.log"` → `WORKER_LOG="$HOME/.skybuild-supervisor/logs/${name}.log"`
3. `MAIN_REPO` default: remove hardcoded path, keep `$(git rev-parse --show-toplevel)` fallback
4. `WORKTREE_BASE` default: read from `supervisor.yml` if possible, fall back to `~/projects`:
   ```bash
   WORKTREE_BASE="${WORKTREE_BASE:-$(grep 'worktree_base:' "$HOME/.skybuild-supervisor/supervisor.yml" 2>/dev/null | awk '{print $2}' | sed "s|~|$HOME|")}"
   WORKTREE_BASE="${WORKTREE_BASE:-$HOME/projects}"
   ```

- [ ] **Step 4: Port supervisor-template.sh**

Copy `~/.claude/skills/supervising-dispatched-sessions/supervisor-template.sh` to `plugins/supervisor/scripts/supervisor-template.sh`. Changes:

1. `PROMPT_DIR="$HOME/tier-prompts"` → `PROMPT_DIR="$HOME/.skybuild-supervisor/prompts"`
2. `STATUS_DIR="$HOME/tier-overnight-status"` → `STATUS_DIR="$HOME/.skybuild-supervisor/status"`
3. `LOG_FILE="$HOME/${ROUND_NAME}.log"` → `LOG_FILE="$HOME/.skybuild-supervisor/logs/${ROUND_NAME}.log"`
4. Remove hardcoded `MAIN_REPO="/media/rikki/recover2/projects/llamenos-hotline"`, replace with:
   ```bash
   MAIN_REPO="${DISPATCH_REPO:-$(git rev-parse --show-toplevel 2>/dev/null)}"
   ```
5. Worker log paths: `$HOME/${ROUND_NAME}-${name}.log` → `$HOME/.skybuild-supervisor/logs/${ROUND_NAME}-${name}.log`

- [ ] **Step 5: Make all scripts executable and commit**

```bash
chmod +x plugins/supervisor/scripts/*.sh
git add plugins/supervisor/scripts/
git commit -m "feat(supervisor): port shell scripts with configurable paths and progress file support"
```

---

### Task 5: Write the SKILL.md

**Files:**
- Create: `plugins/supervisor/skills/supervising-dispatched-sessions/SKILL.md`

This is the main skill file — the dispatcher role definition. It's based on the existing SKILL.md but with all hardcoded paths/rules removed and replaced with config-driven references.

- [ ] **Step 1: Write SKILL.md**

Create `plugins/supervisor/skills/supervising-dispatched-sessions/SKILL.md`:

```markdown
---
name: supervising-dispatched-sessions
description: Use when the user puts you in a supervisor role coordinating multiple long-running PR fixes, merge trains, CI monitoring, or batch overnight work — you dispatch isolated AI sessions via tmux+launcher scripts instead of doing the work yourself, and resume by reading status files in a fresh session
---

# Supervising Dispatched Sessions

## Overview

**You are a coordinator, not a worker.** When the user needs multiple PR fixes, CI investigations, or merge-train work in parallel, you dispatch fresh AI sessions to do the work and watch their status files. You do NOT touch code, run merges, or debug directly.

**Why:** (1) each worker gets an isolated context window, so your supervisor context stays small; (2) a fresh session can resume by reading status files without replaying the transcript; (3) the user's budget is conserved because each worker handles its own push/test/merge end-to-end.

**On activation:** Create the dispatcher mode lock file:
```bash
mkdir -p ~/.skybuild-supervisor && touch ~/.skybuild-supervisor/active-session.lock
```

**On deactivation** (user says "stop dispatching" / "exit supervisor"):
```bash
rm -f ~/.skybuild-supervisor/active-session.lock
```

## Auto-Init

If `~/.skybuild-supervisor/supervisor.yml` does not exist, run the init script first:
```bash
bash <plugin-dir>/scripts/init.sh
```

If the current project does not have a `.supervisor-rules.md`, offer to create one from the project's CLAUDE.md or AGENTS.md. If neither exists, use the example template at `<plugin-dir>/templates/supervisor-rules-example.md`.

If the current project's CLAUDE.md / AGENTS.md does not mention "supervising-dispatched-sessions", offer to append the dispatcher activation block from `<plugin-dir>/AGENTS.md`.

## When to Use

- User says "supervisor", "coordinate", "dispatch", "queue up", "merge train", "dispatch sessions"
- Multiple PRs need independent fixes + CI validation + merge
- Overnight / unattended batch of fix tasks
- Fresh session started after compaction and user says "continue" / "resume" / "check status"
- **PR review comment triage** — user asks "answer the comments on PR #N" or "address the review feedback"

**Don't use when:**
- User asks you to directly edit/fix one thing — just do it
- Single-PR surgical fix that takes < 5 minutes
- Investigation questions ("why did X fail?") — answer directly

## Proactive PR Comment Sweep

Every time the queue is idle (no running workers, nothing pending), run a quick sweep for unanswered review comments on open PRs the user owns:

```bash
OWNER=$(gh api user -q .login 2>/dev/null)
REPO=$(gh repo view --json name -q .name 2>/dev/null)
gh api "repos/$OWNER/$REPO/pulls?state=open" --jq '.[] | .number' 2>/dev/null | \
  xargs -I{} sh -c 'gh api "repos/'"$OWNER"'/'"$REPO"'/pulls/{}/comments" --jq ".[] | select(.in_reply_to_id == null) | \"#{} \" + (.path // \"(top)\") + \":\" + (.line|tostring)"' 2>/dev/null | head -20
```

Surface unanswered comments in your next status report. **Ask before dispatching** — the user may have left questions intentionally open.

## Status Check

**Primary status tool:** `dstat` (alias for `<plugin-dir>/scripts/status.sh`)

```bash
dstat           # running + status files from last 4h
dstat --24h     # widen window to 24h
dstat --hours=8 # custom window
dstat --all     # every status file regardless of age
dstat --history # only completed, hide running
```

**Columns:** `worker | status | phase | pid | pr | elapsed | started | note`

**Status values:**
- `RUNNING` — worker process currently live
- `EXITING` — tmux session around but worker process gone
- `SUCCESS` / `BLOCKED` / `FAILED` / `PARTIAL` / `NEEDS_CONTEXT` — from status file
- `UNKNOWN` — no signals recovered

**Workflow:**
1. Run `dstat` first on any check-in
2. Only read a specific status/log file if a row looks anomalous
3. Match anomalies to action: stale tmux → kill; dead process + no status → investigate; SUCCESS + PR MERGED → archive

## Deep-dive Bootstrap (fresh session)

For a fresh session after compaction:

```bash
bash <plugin-dir>/scripts/bootstrap.sh
```

Report what you see in ≤5 lines, then ask what to dispatch next.

## Dispatch Workflow

```
1. Read supervisor.yml     → know available models and project rules
2. Write prompt file       → ~/.skybuild-supervisor/prompts/NN-<task-name>.md
3. Launch worker           → dispatch-one.sh <name> <prompt-file> [timeout] [model]
4. Monitor                 → dstat, read progress/status files
5. Report to user          → high-level status only, ≤5 lines
```

**Never** run workers in the foreground — always tmux-detached via `dispatch-one.sh` or the supervisor template.

## Canonical Artifacts

- **Worker prompt template:** `<plugin-dir>/templates/prompt-template.md`
- **PR comment triage template:** `<plugin-dir>/templates/prompt-template-pr-comments.md`
- **Supervisor launcher template:** `<plugin-dir>/scripts/supervisor-template.sh`
- **One-off dispatch helper:** `<plugin-dir>/scripts/dispatch-one.sh`

## Model Routing

Read `~/.skybuild-supervisor/supervisor.yml` for available models and routing heuristics.

General guidance:
- **opus** — hard fixes, unknown bugs, security, release-adjacent work
- **sonnet** — mid-tier fixes, routine refactors, clear-spec features
- **haiku** — PR comment triage, status sweeps, quick classification
- **kimi / opencode models** — long-context exploration, bulk migrations, scaffolding

When unsure, pick one tier up. A worker that wastes its budget is a BLOCKED worker.

Claude and opencode quotas are independent — two parallel queues (one per harness) can run concurrently.

## Worker Communication Protocol

Workers communicate via files. One-directional: workers write, supervisor reads.

**Progress file** (worker updates at each major phase):
```
~/.skybuild-supervisor/status/<session-name>.progress
```
```yaml
session: <name>
phase: N/M
current: "one-line description of current activity"
elapsed_sec: <int>
commits: <int>
pushed: true|false
pr: <number or none>
```

**Final status file** (worker writes before exit):
```
~/.skybuild-supervisor/status/<session-name>.status
```
```yaml
session: <name>
status: SUCCESS | BLOCKED | FAILED | NEEDS_CONTEXT
pr: <number or none>
merged_sha: <sha or none>
duration_sec: <int>
notes: <one-line summary>
```

## Project Rules

Each project provides its own rules in `.supervisor-rules.md` at the project root. The skill injects this file's content into the "Rules" block of every worker prompt.

If no `.supervisor-rules.md` exists, offer to create one (use `<plugin-dir>/templates/supervisor-rules-example.md` as a starting point).

## Red Flags — you're overstepping if...

- You open an editor on a worktree file
- You run `git merge`, `git push`, or `gh pr merge` directly
- You start resolving merge conflicts yourself
- You run test/build commands to debug a failure
- You read stack traces to diagnose a worker's bug

**All of these mean:** stop, write a prompt file, dispatch a worker. The ONLY commands you run directly are: `dstat`, `dispatch-one.sh`, `gh pr view`, `gh pr checks`, `tmux`, `pgrep`, `cat` (for status files), and `git fetch`/`git status`.

## Reporting

Keep reports ≤5 lines. Columns: PR# | status | blocker-if-any | next-action.

Do NOT paste full logs or tracebacks — the user will ask if they want detail.
```

- [ ] **Step 2: Commit SKILL.md**

```bash
git add plugins/supervisor/skills/
git commit -m "feat(supervisor): write SKILL.md — dispatcher role definition with auto-init and progress protocol"
```

---

### Task 6: Write Prompt Templates

**Files:**
- Create: `plugins/supervisor/templates/prompt-template.md`
- Create: `plugins/supervisor/templates/prompt-template-pr-comments.md`
- Create: `plugins/supervisor/templates/supervisor-rules-example.md`
- Create: `plugins/supervisor/AGENTS.md`

- [ ] **Step 1: Write the generic worker prompt template**

Create `plugins/supervisor/templates/prompt-template.md`. Port from `~/.claude/skills/supervising-dispatched-sessions/prompt-template.md` with these changes:

1. Remove all hardcoded paths — use `~/.skybuild-supervisor/` everywhere
2. Replace the "Rules" section placeholder with: "Paste the contents of your project's `.supervisor-rules.md` here."
3. Add the "Communication Protocol" section for progress files:

```markdown
## Communication Protocol

You are a dispatched worker. Your supervisor monitors your progress via files.

### Progress updates
After completing each major step (e.g., after investigation, after implementing fix, after running tests, after pushing), update your progress file:

```bash
START_TS="${START_TS:-$(date +%s)}"
cat > ~/.skybuild-supervisor/status/${SESSION_NAME}.progress <<PROGRESS
session: ${SESSION_NAME}
phase: N/M
current: "one-line description of what you just completed or are doing now"
elapsed_sec: $(( $(date +%s) - START_TS ))
commits: $(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
pushed: $(git log --oneline @{upstream}..HEAD 2>/dev/null | wc -l | xargs test 0 -eq && echo true || echo false)
pr: $(gh pr view --json number -q .number 2>/dev/null || echo none)
PROGRESS
```

### Final status
Before exiting, write your status file:
```bash
cat > ~/.skybuild-supervisor/status/${SESSION_NAME}.status <<STATUS
session: ${SESSION_NAME}
status: SUCCESS | BLOCKED | FAILED | NEEDS_CONTEXT
pr: <number or none>
merged_sha: <sha or none>
duration_sec: $(( $(date +%s) - START_TS ))
notes: <one-line summary>
STATUS
```

### If blocked
Write `status: BLOCKED` with a clear description and exit immediately.
Do NOT attempt workarounds or spend more than 30 minutes stuck.
```

4. Update the status file path from `~/tier-overnight-status/` to `~/.skybuild-supervisor/status/`

- [ ] **Step 2: Write the PR comment triage template**

Copy `~/.claude/skills/supervising-dispatched-sessions/prompt-template-pr-comments.md` to `plugins/supervisor/templates/prompt-template-pr-comments.md`. Changes:

1. Status file path: `~/tier-overnight-status/` → `~/.skybuild-supervisor/status/`
2. Remove hardcoded `llamenos-hotline` references — use `<OWNER>/<REPO>` placeholders
3. Worktree path: `llamenos-hotline-pr<N>-followup` → `<repo>-pr<N>-followup`
4. Add the Communication Protocol section (same as generic template)
5. Build/test commands: replace hardcoded `bun run typecheck && bun run lint && bun run build` with placeholder: `<project build+test commands from .supervisor-rules.md>`

- [ ] **Step 3: Write the example supervisor rules**

Create `plugins/supervisor/templates/supervisor-rules-example.md`:

```markdown
# Supervisor Rules for <Project Name>

These rules are injected into every dispatched worker prompt. Keep them concise and actionable.

## Git & Worktrees
- Always work in your worktree — never modify the main repo checkout.
- Worktrees live at `<worktree-base>/<repo>-<name>`.

## Build & Test Verification (MANDATORY before pushing)
- Run ALL relevant test tiers locally, not just typecheck/lint.
- Target specs that touch your changes — don't run the full suite unless you changed shared code.

```bash
# Example — customize for your project:
# bun run typecheck && bun run lint && bun run build
# bun run test:unit
# bunx playwright test <targeted-specs> --workers=1
```

## Push & PR Creation
```bash
git push -u origin HEAD
gh pr create --title "<type>(<scope>): <description>" --body "## Summary\n<bullets>"
```

## Merging
- Only merge when `mergeStateStatus=CLEAN` AND all required checks green.
- No flake excuses. No "almost green".

## Code Standards
- Root-cause only — no `--no-verify`, no workarounds.
- When changing types/schemas: grep ALL test files for stubs that construct the old shape. Update them in the same PR.
- If blocked >30 min, write `status: BLOCKED` and exit. Never push broken code.
```

- [ ] **Step 4: Write the AGENTS.md injection snippet**

Create `plugins/supervisor/AGENTS.md`:

```markdown
## Supervisor Dispatch (skybuild-supervisor plugin)

When the user says "dispatch", "supervisor", "coordinate", "queue up", or "merge train",
invoke the supervising-dispatched-sessions skill. In dispatcher mode:
- NEVER edit code, run tests, or debug directly
- ONLY write prompt files, dispatch workers, and monitor status
- Use `dstat` to check worker status
- Use `dispatch-one.sh` for ad-hoc single workers
- Project rules are in `.supervisor-rules.md`
- Say "stop dispatching" or "exit supervisor" to leave dispatcher mode
```

- [ ] **Step 5: Commit templates**

```bash
git add plugins/supervisor/templates/ plugins/supervisor/AGENTS.md
git commit -m "feat(supervisor): add prompt templates, example rules, and AGENTS.md injection snippet"
```

---

### Task 7: Manual Smoke Test

No automated tests for this plugin — it orchestrates external processes. Instead, verify the pieces work:

- [ ] **Step 1: Run init in a clean state**

```bash
# Temporarily move existing config aside
mv ~/.skybuild-supervisor ~/.skybuild-supervisor.bak 2>/dev/null

# Run init
bash /media/rikki/recover2/projects/skybuild/plugins/supervisor/scripts/init.sh
```

Expected:
- Creates `~/.skybuild-supervisor/` with `logs/`, `status/`, `prompts/`, `scripts/` subdirs
- Writes `supervisor.yml` with detected harnesses
- Detects `claude` as installed
- Detects `opencode` if installed
- Reports dstat alias status

- [ ] **Step 2: Verify supervisor.yml is valid YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('$HOME/.skybuild-supervisor/supervisor.yml')); print('valid')"
```

Expected: `valid`

- [ ] **Step 3: Verify hooks work (lock file present)**

```bash
touch ~/.skybuild-supervisor/active-session.lock
# The hook command should output BLOCKED and exit 1
bash -c "test -f ~/.skybuild-supervisor/active-session.lock && echo 'BLOCKED: You are in dispatcher mode.' && exit 1 || exit 0"
echo "exit code: $?"
```

Expected: `BLOCKED: You are in dispatcher mode.` and `exit code: 1`

- [ ] **Step 4: Verify hooks work (lock file absent)**

```bash
rm -f ~/.skybuild-supervisor/active-session.lock
bash -c "test -f ~/.skybuild-supervisor/active-session.lock && echo 'BLOCKED' && exit 1 || exit 0"
echo "exit code: $?"
```

Expected: no output and `exit code: 0`

- [ ] **Step 5: Verify dstat runs without errors**

```bash
bash /media/rikki/recover2/projects/skybuild/plugins/supervisor/scripts/status.sh --all
```

Expected: either "No workers found" or a markdown table (if legacy status files were migrated)

- [ ] **Step 6: Restore original config**

```bash
rm -rf ~/.skybuild-supervisor
mv ~/.skybuild-supervisor.bak ~/.skybuild-supervisor 2>/dev/null
```

- [ ] **Step 7: Commit any fixes from smoke test**

```bash
git add -A plugins/supervisor/
git commit -m "fix(supervisor): adjustments from smoke test"
```

(Only if changes were needed. Skip if everything passed.)

---

### Task 8: Final Review and Push

- [ ] **Step 1: Verify complete file inventory**

```bash
cd /media/rikki/recover2/projects/skybuild
find plugins/supervisor/ -type f | sort
```

Expected output should match:
```
plugins/supervisor/.claude-plugin/plugin.json
plugins/supervisor/.opencode/INSTALL.md
plugins/supervisor/AGENTS.md
plugins/supervisor/README.md
plugins/supervisor/hooks/hooks.json
plugins/supervisor/scripts/bootstrap.sh
plugins/supervisor/scripts/dispatch-one.sh
plugins/supervisor/scripts/init.sh
plugins/supervisor/scripts/status.sh
plugins/supervisor/scripts/supervisor-template.sh
plugins/supervisor/skills/supervising-dispatched-sessions/SKILL.md
plugins/supervisor/templates/prompt-template-pr-comments.md
plugins/supervisor/templates/prompt-template.md
plugins/supervisor/templates/supervisor-rules-example.md
```

- [ ] **Step 2: Review diff**

```bash
git diff --stat HEAD~$(git rev-list --count HEAD ^main) 2>/dev/null || git diff --stat
```

Verify only `plugins/supervisor/` files are changed.

- [ ] **Step 3: Push and create PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: add skybuild-supervisor plugin" --body "## Summary
- Packages the supervising-dispatched-sessions skill as a standalone Claude Code + opencode plugin
- Hook-based role enforcement (lock file + hooks.json blocks Edit/Write/test in dispatcher mode)
- Auto-init flow detects harnesses, writes supervisor.yml, offers CLAUDE.md additions
- Progress file protocol for live worker status updates
- Decoupled project rules via .supervisor-rules.md
- All paths configurable (no hardcoded project knowledge)
- Legacy migration from ~/tier-overnight-status/ and ~/tier-prompts/

## Test plan
- [ ] Run init.sh in clean environment — verify supervisor.yml, directory structure
- [ ] Verify hooks block Edit/Write when lock file present, allow when absent
- [ ] Verify dstat reads progress files and shows phase column
- [ ] Dispatch a test worker with dispatch-one.sh — verify worktree, tmux, log
- [ ] Test with both claude and opencode harnesses"
```
