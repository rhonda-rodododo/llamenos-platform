# Skybuild Supervisor Plugin — Design Spec

**Date:** 2026-04-28
**Status:** Draft
**Plugin name:** `skybuild-supervisor`
**Skill name:** `supervising-dispatched-sessions`
**Location:** `plugins/supervisor/` in the skybuild repo

## Problem Statement

The supervising-dispatched-sessions skill works well for coordinating parallel AI worker sessions, but has three problems that prevent sharing it:

1. **Role drift:** The supervisor agent gradually starts doing worker work (editing code, running tests) instead of staying in dispatcher mode. The skill is text-only instructions — once the LLM drifts, nothing stops it.
2. **No mid-flight communication:** Workers write a status file at exit. There's no way to see progress while a worker is running.
3. **Hardcoded project knowledge:** Project-specific rules, paths, and model routing are baked into the skill files, making it unusable outside the author's projects.

## Solution

Package the skill as a standalone Claude Code plugin + opencode plugin with:
- **Hook-based role enforcement** that deterministically blocks worker-like tool calls during dispatch mode
- **Progress file protocol** for live worker status updates
- **Auto-init flow** that configures itself per-project without hardcoded knowledge
- **`supervisor.yml` config** for model/harness preferences

## Decisions to Review

| Decision | Chosen | Alternatives considered |
|----------|--------|------------------------|
| Distribution format | Claude Code plugin + opencode plugin (option C) | Pure skill (no guardrails), Skill + hookify (extra dependency), Skybuild feature plugin (too heavyweight) |
| Role enforcement | Lock file + hooks.json blocking Edit/Write/test commands | Instruction-only (unreliable), Custom subagent_type (not cross-harness) |
| Worker communication | One-directional via filesystem (progress + status files) | SendMessage back to parent (not supported cross-harness), WebSocket (overengineered) |
| Config format | YAML (`supervisor.yml`) | JSON (less readable), TOML (less common), Markdown (harder to parse) |
| Project rules | Per-project `.supervisor-rules.md` referenced from config | Hardcoded per-project files in plugin (not portable), Inline in supervisor.yml (too verbose) |
| State directory | `~/.skybuild-supervisor/` | `~/.config/skybuild-supervisor/` (XDG — more correct but longer), `~/tier-overnight-status/` (current — too specific) |

## Architecture

### Plugin Structure

```
plugins/supervisor/
├── .claude-plugin/
│   └── plugin.json                    # Plugin manifest
├── .opencode/
│   └── plugin.js                      # opencode plugin adapter
├── skills/
│   └── supervising-dispatched-sessions/
│       └── SKILL.md                   # Main skill (dispatcher role definition)
├── hooks/
│   └── hooks.json                     # Edit/Write/test blockers in dispatcher mode
├── scripts/
│   ├── dispatch-one.sh                # Dispatch a single worker
│   ├── supervisor-template.sh         # Queue-based serial launcher
│   ├── status.sh                      # dstat — status table
│   ├── bootstrap.sh                   # Fresh-session state enumeration
│   └── init.sh                        # First-run setup (detect harnesses, write supervisor.yml)
├── templates/
│   ├── prompt-template.md             # Worker prompt template (generic)
│   ├── prompt-template-pr-comments.md # PR comment triage template
│   └── supervisor-rules-example.md    # Example .supervisor-rules.md for projects
├── README.md                          # Usage docs
└── AGENTS.md                          # Snippet proposed to projects on init
```

### Runtime State

Created by the plugin at runtime, not shipped:

```
~/.skybuild-supervisor/
├── supervisor.yml          # Global config (models, harnesses, defaults)
├── active-session.lock     # Exists when in dispatcher mode
├── logs/                   # Worker stdout/stderr logs
├── status/                 # .status and .progress files
└── prompts/                # Generated prompt files for workers
```

## Component Design

### 1. Auto-Init Flow

On first invocation in any project, the skill:

1. Checks for `~/.skybuild-supervisor/supervisor.yml` — if missing, runs global init
2. Global init:
   - Detects installed harnesses (`which claude`, `which opencode`)
   - Queries available models (`opencode models` if installed)
   - Writes `supervisor.yml` with detected harnesses and sensible defaults
   - Creates directory structure (`logs/`, `status/`, `prompts/`)
3. Checks for `.supervisor-rules.md` in the project root — if missing, offers to create one
4. Proposes additions to the project's `CLAUDE.md` / `AGENTS.md` teaching the harness when to activate dispatcher mode
5. User approves all file writes before they happen — no silent modification

### 2. `supervisor.yml` Schema

```yaml
# Global supervisor configuration
# Written by init, user-editable

harnesses:
  claude:
    installed: true
    models: [opus, sonnet, haiku]
    default_model: sonnet
    flags: "--print --dangerously-skip-permissions --output-format=stream-json --verbose"
  opencode:
    installed: true
    models: [kimi-for-coding/k2p5, vultr/DeepSeek-V3.2]
    default_model: kimi-for-coding/k2p5
    flags: "--dangerously-skip-permissions --format json"

defaults:
  timeout_sec: 5400
  max_concurrent: 2
  worktree_base: ~/projects

routing:
  # Model selection heuristic overrides
  security_fix: opus
  bulk_rename: kimi-for-coding/k2p5
  comment_triage: haiku

projects:
  /media/rikki/recover2/projects/llamenos:
    rules_file: .supervisor-rules.md
  /media/rikki/recover2/projects/skybuild:
    rules_file: .supervisor-rules.md
```

### 3. Hook-Based Role Enforcement

**Mechanism:** A lock file (`~/.skybuild-supervisor/active-session.lock`) signals dispatcher mode. Hooks in `hooks.json` check for this file before allowing tool calls.

**Activation:** The skill creates the lock file when it activates.

**Deactivation:** User says "stop dispatching" / "exit supervisor", session ends, or manual `rm`.

**`hooks/hooks.json`:**

```json
{
  "hooks": [
    {
      "matcher": { "tool_name": ["Edit", "Write", "NotebookEdit"] },
      "hook": {
        "type": "command",
        "command": "test -f ~/.skybuild-supervisor/active-session.lock && echo 'BLOCKED: You are in dispatcher mode. Write a prompt file and dispatch a worker instead of editing code directly.' && exit 1 || exit 0"
      }
    },
    {
      "matcher": { "tool_name": "Bash", "input_contains": ["cargo", "bun run test", "playwright", "xcodebuild", "gradlew"] },
      "hook": {
        "type": "command",
        "command": "test -f ~/.skybuild-supervisor/active-session.lock && echo 'BLOCKED: You are in dispatcher mode. Dispatch a worker to run tests, do not run them yourself.' && exit 1 || exit 0"
      }
    }
  ]
}
```

**Allowed in dispatcher mode:** `dstat`, `tmux`, `pgrep`, `gh pr`, `git fetch`, `git status`, `cat` (for reading status files).

### 4. Worker Communication Protocol

One-directional via filesystem. Workers write, supervisor reads. No interactive communication.

**Progress file** (updated by worker at each major phase):
```
~/.skybuild-supervisor/status/<session-name>.progress
```
```yaml
session: fix-auth-regression
phase: 3/5
current: "Running e2e tests after fixing token refresh"
elapsed_sec: 1200
commits: 2
pushed: true
pr: 42
```

**Final status file** (written by worker before exit):
```
~/.skybuild-supervisor/status/<session-name>.status
```
```yaml
session: fix-auth-regression
status: SUCCESS | BLOCKED | FAILED | NEEDS_CONTEXT
pr: 42
merged_sha: abc123
duration_sec: 2400
notes: "Fixed token refresh race condition, 3 commits, all tests green"
```

**Injected into every worker prompt** — a "Communication Protocol" section that tells the worker how and when to update these files.

### 5. Enhanced `dstat` Output

The status script reads both `.progress` and `.status` files:

```
$ dstat

 worker                 | status      | phase | pid   | pr  | elapsed | note
 fix-auth-regression    | RUNNING     | 3/5   | 48201 | #42 | 20m     | Running e2e tests after fixing token refresh
 rename-hub-to-org      | RUNNING     | 1/5   | 48340 | —   | 4m      | Inspecting state, verifying branch
 pr-comment-sweep       | SUCCESS     | —     | —     | #39 | 12m     | Replied to 4 threads, no follow-up PR needed
```

Options: `dstat`, `dstat --24h`, `dstat --all`, `dstat --history`.

### 6. Per-Project Rules (Decoupled)

Project-specific rules live in the project, not the plugin:

**`.supervisor-rules.md`** (in project root):
```markdown
# Supervisor Rules for Llamenos

1. Spot-check affected e2e specs locally BEFORE pushing.
2. Only merge PRs that are up-to-date with main AND all required checks green.
3. Root-cause only — no --no-verify, no weakening app code to silence tests.
4. Testid-only selectors in any touched E2E test.
5. When changing types/schemas: grep ALL test files for stubs that construct the old shape.
6. If blocked for >30 min, write status: BLOCKED and exit.
7. Never merge the release PR autonomously.
```

The skill reads this file and injects it into the "Rules" block of every worker prompt. If no rules file exists, init offers to scaffold one from the project's CLAUDE.md.

### 7. SKILL.md Changes from Current

Key differences from the existing `~/.claude/skills/supervising-dispatched-sessions/SKILL.md`:

| Aspect | Current | New |
|--------|---------|-----|
| Role enforcement | Red flags section (advisory) | Lock file + hooks (deterministic) |
| Project rules | Hardcoded `prompt-rules-*.md` files | Per-project `.supervisor-rules.md` via config |
| Status directory | `~/tier-overnight-status/` | `~/.skybuild-supervisor/status/` |
| Prompt directory | `~/tier-prompts/` | `~/.skybuild-supervisor/prompts/` |
| Log directory | `~/NAME.log` | `~/.skybuild-supervisor/logs/` |
| Worker progress | None (status at exit only) | `.progress` files updated at each phase |
| Model routing | Hardcoded in `model-routing.md` | `supervisor.yml` routing section |
| Main repo path | Hardcoded in scripts | Discovered from cwd or config |
| Init flow | Manual setup | Auto-init on first use, proposes CLAUDE.md additions |
| dstat output | status/pid/pr/elapsed/note | Adds phase column from progress files |
| PR comment sweep | Hardcoded owner/repo | Discovered from `gh` context |

### 8. AGENTS.md / CLAUDE.md Injection

On project init, the plugin proposes appending this block:

```markdown
## Supervisor Dispatch (skybuild-supervisor plugin)

When the user says "dispatch", "supervisor", "coordinate", "queue up", or "merge train",
invoke the supervising-dispatched-sessions skill. In dispatcher mode:
- NEVER edit code, run tests, or debug directly
- ONLY write prompt files, dispatch workers, and monitor status
- Use `dstat` to check worker status
- Use `dispatch-one.sh` for ad-hoc single workers
- Project rules are in `.supervisor-rules.md`
```

## Testing Strategy

1. **Hook enforcement:** Verify Edit/Write/Bash-test calls are blocked when lock file exists, allowed when it doesn't
2. **Init flow:** Run init in a clean environment, verify supervisor.yml is correct, verify harness detection
3. **dstat:** Verify progress + status file parsing, verify output format
4. **dispatch-one.sh:** Verify worktree creation, tmux launch, log file creation
5. **Cross-harness:** Test with both `claude` and `opencode` as the dispatching harness

## Migration Path

For existing users (i.e., us):
1. Install the plugin
2. Run init — it detects existing `~/tier-overnight-status/` and `~/tier-prompts/` and offers to migrate
3. Move `prompt-rules-llamenos.md` → `.supervisor-rules.md` in the llamenos project root
4. Move `prompt-rules-skybuild.md` → `.supervisor-rules.md` in the skybuild project root
5. Remove old `~/.claude/skills/supervising-dispatched-sessions/` (replaced by plugin)
