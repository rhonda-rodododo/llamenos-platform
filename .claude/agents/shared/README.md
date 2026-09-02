# Shared supervisor sources

These four files are the canonical, version-controlled copies of the shared supervisor
rules that `.claude/agents/build-agents.sh` composes into every generated
`.claude/agents/<name>-supervisor.md` file:

- `SKILL.md` — core dispatch protocol (worktrees, launcher, status files, merge flow)
- `model-routing.md` — model routing reference for dispatched workers
- `prompt-rules-llamenos.md` — Llamenos-specific worker rules pasted into every worker prompt
- `prompt-template.md` — worker prompt template

They used to live only outside the repo, at
`$HOME/.claude/skills/supervising-dispatched-sessions/`, which meant the generated agent
files were built from machine-local, untracked sources — not reproducible on another
machine, and nothing caught drift. They are vendored here so the build is reproducible
and CI can verify the committed agents match their sources (`bun run agents:check`,
mirroring `bun run codegen:check`).

**Do not edit a generated `.claude/agents/<name>-supervisor.md` file directly.** It is
overwritten every time `build-agents.sh` runs. Edit the relevant fragment in
`.claude/agents/fragments/` or one of the shared files in this directory instead, then
run `bun run agents:build` (or `.claude/agents/build-agents.sh`) to regenerate.

When the upstream copy at `$HOME/.claude/skills/supervising-dispatched-sessions/` changes,
sync the relevant file(s) here by hand and regenerate — this directory is the source of
truth for this repo, not a mirror that auto-updates.
