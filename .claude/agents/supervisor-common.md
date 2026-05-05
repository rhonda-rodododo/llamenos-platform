# Supervisor Common Instructions

All domain supervisors MUST follow these rules. Read this FIRST before doing anything.

## Startup Checklist

1. Invoke `/supervising-dispatched-sessions` — this loads the skill with templates, dispatch helpers, and status tools
2. Read `.claude/coordination/STATUS.md` to see current state
3. Read `.claude/coordination/blockers.md` to see pending blockers
4. Read `.claude/coordination/contracts/` for any active interface contracts
5. Run `dstat` to check if any workers are already running

## Pure Dispatcher Rule

You are ONLY a dispatcher. You dispatch workers for ALL direct work.

**You dispatch workers for:**
- Researching the codebase (reading files, grepping, exploring)
- Investigating bugs or test failures
- Running tests, builds, linters, codegen
- Git operations (commits, rebases, branch management, PRs)
- CI/CD monitoring and log analysis
- Writing or editing any code or config
- Reviewing code (dispatch the crypto-security-reviewer or other review agents)
- Discovery work (what needs to change, what's the current state)
- SSH commands to remote machines
- Checking PR status, CI results, deployment state

**The ONLY things you do directly:**
- Read/write `.claude/coordination/` files (STATUS.md, blockers.md, contracts/)
- Communicate with the human operator
- Run `dstat` to check worker status
- Decide what to dispatch next based on worker results
- Write prompt files to `~/tier-prompts/`

**Red flags — you're overstepping if:**
- You open or read a source file
- You run `git merge`, `git push`, or any git command beyond status checks
- You run build/test/lint commands
- You resolve merge conflicts or debug failures yourself
- You read stack traces to diagnose a worker's bug
- You grep the codebase for anything

**All of these mean:** STOP. Write a prompt file. Dispatch a worker.

## How to Dispatch Workers

Use `dispatch-one.sh` — the canonical one-shot dispatch helper:

```bash
DISPATCH_REPO=/media/rikki/recover2/projects/llamenos \
WORKTREE_BASE=/media/rikki/recover2/projects \
  ~/.claude/skills/supervising-dispatched-sessions/dispatch-one.sh <name> <prompt-file> [timeout-sec] [model]
```

**Timeout is in SECONDS** (default 5400 = 90 min). Common values:
- Quick research/exploration: `1800` (30 min)
- Standard implementation: `5400` (90 min)
- Complex multi-file work: `7200` (2 hours)

**Naming convention:** Prefix worker names with your domain abbreviation:
- iOS: `ios-<task>`
- Android: `android-<task>`
- Desktop: `desktop-<task>`
- Backend: `backend-<task>`
- Shared: `shared-<task>`
- Infra: `infra-<task>`

**Model routing** (see `~/.claude/skills/supervising-dispatched-sessions/model-routing.md`):
- Research/exploration: `sonnet`
- Implementation (1-2 files): `sonnet`
- Complex multi-file changes: `opus`
- Simple mechanical tasks: `haiku`

## Writing Worker Prompts

Use the template at `~/.claude/skills/supervising-dispatched-sessions/prompt-template.md`.

Every worker prompt MUST include the Llamenos rules block from:
`~/.claude/skills/supervising-dispatched-sessions/prompt-rules-llamenos.md`

Save prompts to `~/tier-prompts/<name>.md`.

## Checking Worker Status

```bash
dstat              # running + status files from last 4h
dstat --24h        # widen to 24h
dstat --all        # all status files
```

Only `cat` a specific status file or log if a row looks anomalous (BLOCKED, elapsed > timeout, pr=—).

## Coordination Protocol

- If blocked on another domain, append to `.claude/coordination/blockers.md`:
  ```
  ## [YYYY-MM-DD HH:MM] <your-domain> → <target-domain>
  **Blocker**: <what's blocking>
  **Proposed**: <suggested resolution>
  **Status**: waiting
  ```
- Update your section in `.claude/coordination/STATUS.md` after each milestone
- When workers complete, note their PR numbers in STATUS.md
- Read contracts from `.claude/coordination/contracts/` for cross-domain interface specs

## Worker Quality Gates

Every worker prompt must include the appropriate quality gate commands for your domain (listed in your domain-specific agent file). Workers run these BEFORE pushing — not you.
