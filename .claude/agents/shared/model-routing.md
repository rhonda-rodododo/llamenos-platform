# Model Routing for Dispatched Workers

Pick the model per worker. Your Claude Max budget is precious — don't spend Opus on boilerplate; don't spend Kimi on the merge PR.

This table applies to **tmux workers only** (`dispatch-one.sh`). Native subagents (Task/Agent tool) always run the supervisor's own model — see "Subagents vs tmux workers" in SKILL.md.

**gh auth is per-repo, automatic:** `~/.local/bin/gh` wraps the real CLI and injects the right account's token per repo (`~/.config/gh-per-repo/map`: rhonda-rodododo→llamenos*, acao→translatemd etc.). Never run `gh auth switch`; the wrapper makes it unnecessary and it's racy across concurrent workers.

## Supported models (token → CLI)

| Token | CLI | When to use |
|---|---|---|
| `opus` | `claude --model opus` | Hard fixes, unknown bugs, release-adjacent work, reviews of risky merges, anything where a wrong call costs >30 min of human time. |
| `sonnet` | `claude --model sonnet` | **Default** (`dispatch-one.sh` uses `sonnet` when no model is passed). Mid-tier fixes, routine refactors inside one file, clear-spec features with known patterns. ~2/3 cost of Opus on Max. |
| `haiku` | `claude --model haiku` | PR-comment triage where most replies are "acknowledged / done / moved to follow-up", status sweeps, quick investigations that only need to classify. |
| `fable` | `claude --model fable` | Newest Claude alias; accepted by the dispatcher and verified to resolve. Treat as a peer of `sonnet` until you have your own evidence about where it lands on cost/quality. |
| `kimi` | `opencode run --model kimi-for-coding/k2p6` | Long-context exploration, bulk migrations across many files, scaffolding a new module from a clear spec, frontend-heavy work. Uses paid Kimi for Coding subscription ($99/mo). |
| `kimi-thinking` | `opencode run --model kimi-for-coding/kimi-k2-thinking` | Same as kimi but with extended thinking/reasoning. Use for harder problems that benefit from chain-of-thought. |
| `opencode:<model>` | `opencode run --model <provider/model>` | Any model available in opencode (e.g., `opencode:opencode/gpt-5-nano`, `opencode:vultr/DeepSeek-V3.2`). Use for free/cheap models on grunt work. |
| `copilot` | `copilot --allow-all --no-ask-user -p` | GitHub Copilot CLI (auto model selection). Best for workers running inside an existing VS Code / Copilot subscription — no separate Claude Max quota consumed. |
| `copilot:<model>` | `copilot --model=<model> --allow-all --no-ask-user -p` | Copilot CLI with a pinned model. Use explicit model tokens like `copilot:claude-sonnet-4.6`, `copilot:gpt-5.4`, `copilot:gpt-5.4-mini`. |
| `kimi-cli` | `kimi --output-format stream-json -p` | Kimi Code CLI (kimi3 / new kimi-cli). Runs the default model from `~/.kimi/config.toml` (currently `kimi-code/kimi-for-coding`). Autonomous, no questions. |
| `kimi-cli:<model>` | `kimi --output-format stream-json -m <model> -p` | Kimi Code CLI with a pinned model alias. |

## Effort routing (`--effort`)

`--effort` is a separate dial from `--model`, and it is plumbed only into the Claude
runtimes (`opus|sonnet|haiku|fable`). Accepted values: **`low | medium | high | xhigh | max`**.
`dispatch-one.sh` defaults to `medium` and hard-fails an invalid value *before* it cuts a
worktree. Every non-Claude launcher prints `⚠️ --effort ignored: <runtime> does not support it`
rather than dropping the flag silently.

**Rule of thumb: effort is the dial for "how expensive is a wrong answer"; model is the dial
for "how hard is the reasoning."** They are independent — `haiku --effort high` is a legitimate
triage worker, and `opus --effort low` is legitimate for a mechanical rename in a file only
Opus can safely parse.

| Class of work | Model | Effort | Why this tier |
|---|---|---|---|
| Unknown bug, "something is wrong and I don't know what" | `opus` | `xhigh` | Investigation quality compounds; a wrong diagnosis costs a whole re-dispatch |
| Correctness/security review, revert, release PR | `opus` | `xhigh` | A missed defect ships to prod. Reserve `max` for a second pass on something already flagged risky |
| Architecture, spec, plan, ADR authoring | `opus` | `high` | Long-horizon coherence, low token-per-decision |
| Multi-file feature, known pattern, clear spec | `sonnet` | `high` | Default for real feature work |
| Routine fix, <5 files, tests exist to verify | `sonnet` | `medium` | The global default |
| Bulk KB sweep (batch-add, mapping expansion) | `sonnet` | `medium` | Plus a **separate** reviewer dispatch at `opus`/`high` empowered to REJECT |
| PR-comment triage, classify-and-reply | `haiku` | `medium` | Classification, not reasoning |
| Mechanical batch edit against a detailed brief | `haiku` | `low` | The only place `low` is the right answer |
| >10 files / >100k tokens of context to read | `kimi` / `kimi-thinking` | n/a | opencode; effort unsupported — the dispatcher warns |
| Offload from Max quota | `copilot:<model>` | n/a | Copilot CLI; effort unsupported — the dispatcher warns |

`--max-budget-usd N` is also Claude-only and, per `claude --help`, applies to `--print` runs —
which is exactly how workers launch. Use it as a hard cap on an exploratory `opus --effort xhigh`
worker.

## Heuristic for picking

```
Is this the release PR, a revert, or a security fix?       → opus
Does the task cross >10 files or need >100k tokens context? → kimi (long ctx, cheap)
Is the fix likely <5 files, with tests to verify?           → sonnet
Is the task "read these comments and classify/reply"?       → haiku
Am I unsure what's wrong?                                    → opus (it'll investigate better)
Is this routine: typo, rename, lint, dep bump?              → haiku or kimi
Want to offload from Claude Max to Copilot quota?           → copilot or copilot:<model>
Want a native Kimi agent loop (not opencode-wrapped)?       → kimi-cli or kimi-cli:<model>
```

When unsure, pick one tier up. A worker that wastes its budget is a BLOCKED worker.

## Splitting Claude Max + opencode + Copilot models concurrently

Claude Max, opencode-routed models (Kimi, DeepSeek, GPT-5 Nano, etc.), and GitHub Copilot use **independent quotas**. Three parallel tmux queues:

- **Queue A** (Claude): hard/critical tasks, opus + sonnet models
- **Queue B** (opencode): bulk/exploratory tasks — `kimi`, `opencode:vultr/DeepSeek-V3.2`, `opencode:opencode/gpt-5-nano`, etc.
- **Queue C** (Copilot): offload routine tasks to your Copilot subscription — `copilot` or `copilot:<model>`
- **Queue D** (Kimi Code CLI): same Kimi quota as Queue B but through the native `kimi` agent loop — `kimi-cli` or `kimi-cli:<model>`

## When to route to `kimi-cli`

`kimi` / `kimi-thinking` keep routing to opencode for backwards compatibility. Reach for `kimi-cli` instead when:

- **The task needs a full agent loop, not a single opencode run.** The Kimi Code CLI is a purpose-built autonomous CLI (its own tool set, shell access, file editing) — better fit for multi-step fix-build-test cycles than an opencode wrapper.
- **You want the Kimi subscription without opencode quirks.** Same `kimi-for-coding` quota as Queue B, but driven natively. `kimi-cli` (no model) uses the default from `~/.kimi/config.toml` (`kimi-code/kimi-for-coding`); pin with `kimi-cli:<model-alias>`.
- **Shape-heavy work.** Same heuristic as opencode-kimi: bulk migrations, scaffolding, many-file mechanical changes. Decision-heavy work (merge trains, conflict resolution, CI loops) still goes to Claude.
- **`--agent` is NOT supported** for kimi-cli workers (kimi's `--agent` selects an agent profile, a different mechanism). The flag is ignored — keep prompts self-contained.

This triples effective throughput without increasing budget. Keep Queue A short and high-value; Queue B for grep-and-rename grunt work; Queue C for tasks where Copilot quota is available and fresh.

### Available opencode models
```bash
opencode models  # List all available models
```
Current options: `kimi-for-coding/k2p6` (what `model=kimi` actually launches — see dispatch-one.sh), `vultr/DeepSeek-V3.2`, `vultr/GLM-5-FP8`, `opencode/gpt-5-nano`, `opencode/minimax-m2.5-free`, `opencode/nemotron-3-super-free`, and more.

## Queue entry format

The launcher reads 4-field entries:

```
"name|prompt-file|timeout-sec|model"
```

Model is optional; omit to default to **sonnet** (`dispatch-one.sh`: `model="${4:-sonnet}"`). Examples:

```bash
"fix-auth-regression|70-auth.md|10800|opus"
"rename-hub-to-org|71-rename.md|7200|kimi"
"pr-comment-sweep|72-sweep.md|1800|haiku"
```

## Caveats

- **`model=kimi` runs via `opencode run`**, NOT a standalone `kimi` CLI — `dispatch-one.sh` handles this; never invoke `kimi --yolo` directly. (The separate `kimi-cli` token DOES drive the standalone `kimi` binary; they are different runtimes.)
- **Kimi supports up to 500 tool calls** (updated from 100 as of May 2026). Complex multi-agent tasks are fine.
- **Kimi's tool-calling is weaker on multi-constraint loops.** Don't route "merge this PR, resolve conflicts, re-run CI" to Kimi — it'll get lost. Route shape-heavy (lots of files, mechanical change) work to Kimi, decision-heavy work to Claude.
- **opencode `--format json` streams JSON events** (not stream-json like claude). The supervisor reads status files, not stdout, so output format doesn't matter for orchestration.
- **Kimi/opencode does not read `~/.claude/skills/`** — anything the worker relies on from the superpowers skill library must be inlined into the prompt file. Keep Kimi prompts self-contained.
- **Kimi has no equivalent of the superpowers feedback memory system.** Project-specific hardcoded rules (testid selectors, no-workaround discipline, e2e-before-push) must be copy-pasted into the prompt's Rules block every time. The prompt template already does this — don't strip it when routing to Kimi.
- **Copilot CLI (`copilot` / `copilot:<model>`) runs via `copilot --allow-all --no-ask-user --name=<name> --output-format=json -p <prompt>`.** The binary must be installed: `npm install -g @github/copilot`. Requires a GitHub Copilot subscription and auth (`copilot login` or `COPILOT_GITHUB_TOKEN` env var). The `dispatch-one.sh` will fail fast with a clear error if the binary is missing.
- **Copilot supports `--name`**, so worker identity is tracked identically to claude — `status.sh` detects it via `pgrep -af "copilot.*--name <name>"`.
- **Copilot workers cannot read `~/.copilot/skills/`.** Keep prompts self-contained — same rule as Kimi.
- **Copilot model tokens** include: `claude-sonnet-4.6`, `claude-haiku-4.5`, `gpt-5.4`, `gpt-5.4-mini`, `gemini-3.5-flash`. Omit `copilot:<model>` to let Copilot auto-select.
- **Kimi Code CLI (`kimi-cli` / `kimi-cli:<model>`) runs via `kimi --output-format stream-json -p <prompt>` (prompt mode forbids `--auto`/`--yolo` — it is non-interactive by definition).** The `kimi` binary must be in PATH; `dispatch-one.sh` fails fast with a clear error if missing. `kimi-cli` with no suffix uses the default model from `~/.kimi/config.toml` (`default_model`, currently `kimi-code/kimi-for-coding`); `kimi-cli:<model>` maps to `-m <model>`.
- **kimi-cli has no `--name` flag**, so worker identity is tracked by tmux session name / log file, not by the CLI process args. Its `--agent` flag selects agent profiles (a different mechanism) — `dispatch-one.sh` ignores `--agent` for kimi-cli workers.
- **kimi-cli workers do not read `~/.claude/skills/` or `~/.copilot/skills/`.** Keep prompts self-contained — same rule as Kimi/opencode and Copilot.
- **One-off dispatches:** Always use `dispatch-one.sh` for ad-hoc launches. Never manually write `tmux new-session -d ... < file` — tmux doesn't pass stdin correctly with inline commands. The dispatch script writes a launcher file to /tmp and runs that.
