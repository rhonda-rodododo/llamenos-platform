# Llámenos Fleet — autonomous multi-role orchestration to Internal Availability

Status: **Draft — awaiting review**
Date: 2026-09-11
Supersedes: nothing. Complements `.claude/agents/` (roles) and
`~/.claude/skills/supervising-dispatched-sessions/` (dispatch mechanics).

---

## 1. Problem

Llámenos has an unusually complete engineering substrate and an unusually
empty shipping record.

The substrate: six domain supervisors generated from editable fragments
(`.claude/agents/`), a committed cross-domain coordination convention
(`.claude/coordination/`), a six-tab fleet launcher (`scripts/supervisors.sh`),
1,536 BDD feature files with exactly one `@wip`, real UniFFI crypto on both
mobile clients, 39 Ansible roles, a Helm chart, an FDE ISO builder that passes,
and a 21-job CI gate.

The record: `tauri-release.yml` has run once and failed. `mobile-release.yml`
has run twice and failed. `deploy-prod.yml` and `deploy-demo.yml` have never
run at all. The four GitHub Releases carry checksums, cosign signatures,
provenance and SBOMs — and no installers. `deploy/PRODUCTION_CHECKLIST.md` is
83 items and zero checked.

An Android artifact has reached Play developer access, and Apple signing is
configured on the Mac and in App Store Connect. Neither was produced by this
repository's pipeline. That distinction is the whole problem: **an artifact
that exists is not a path that repeats**, and an autonomous fleet cannot hand
over a build it has no way to produce.

Two further facts shape the design:

- Dispatch today is a human typing into six terminals. There is no scheduler,
  no lock, no kill switch, no circuit breaker, no non-author verification, no
  ledger, and no digest — i.e. none of the policy layer that makes unattended
  operation defensible.
- The reference system (`atlas-orchestrator`, in `translatemd`) supplies that
  policy layer, but has **no agent-to-agent messaging and no shared memory at
  all**. One orchestrator, one worker, one message, one response. Its verifier
  reads a static diff after the author's session is already dead; a rejected
  run is discarded wholesale for a human to rescue. Run N+1 knows nothing about
  run N beyond a failure counter. Those capabilities are new construction here,
  not a port.

## 2. Goals

1. An unattended fleet that advances Llámenos toward **Internal Availability**
   without a human in the loop for ordinary work, and that stops — visibly,
   recoverably, and reachable from a phone — for anything expensive to get
   wrong.
2. Distinct roles with real division of labour, not one implementer plus a
   critic.
3. Agent-to-agent messaging carried entirely on GitHub — issue comments for
   work items, PR reviews for diffs — so that agents and humans share one
   channel and no second system needs keeping in sync.
4. Shared memory that survives process death, is reviewable, and actually feeds
   back into what the next agent is told.
5. A burn-down that ends with a non-technical volunteer using the app.

## 3. Non-goals

- **General Availability / public store listing.** Feature graphics, localized
  store metadata, IARC ratings, and public review submission are out of scope.
  Internal and closed testing tracks do not need them.
- **Real PSTN telephony.** Internal testing exercises a simulated call path.
  Live provider numbers, per-call billing, and carrier registration come after
  the app itself is proven.
- **Replacing rungs 0–2.** `dispatch-one.sh`, `dstat`, `dinspect` and the
  status-file protocol keep their jobs. This spec owns *policy*: when a pass may
  run, which lanes, which work, what happens to the output, and who hears about
  it.
- **Full-disk-encrypted production, initially.** See §4.9 — the first backend is
  an explicitly-labelled staging instance. FDE production is a later wave.

## 4. Milestone: Internal Availability

IA is not "an artifact exists". It is "a person who has never opened a terminal
can get this working, use it, and tell us when it breaks". Six conditions, all
required:

| # | Condition | Current state |
|---|---|---|
| IA-1 | A volunteer installs it themselves from a Play internal-testing link and a TestFlight link. No sideloading, no ADB. | Android artifact exists but not from CI; iOS has no CI path |
| IA-2 | The app talks to a real, running backend. | Nothing deployed. `deploy-prod.yml` and `deploy-demo.yml` have never run |
| IA-3 | A volunteer is invited and onboarded without understanding cryptography, with a recovery story that does not involve the maintainer. | Invite/PIN/sigchain code exists; the non-technical path is unverified |
| IA-4 | The core loop works end to end: a call arrives, rings the on-shift volunteer, they answer, they write a note, an admin reads it. | Simulated call path for IA |
| IA-5 | Failures are visible: crash reporting live, and an in-app feedback path. Non-technical testers will not file GitHub issues. | `epic-293-crash-reporting` marked DONE; in-app feedback unverified |
| IA-6 | An admin can install the desktop app from a signed installer. | `tauri-release.yml` has never produced one |

**The staging warning is a hard requirement of IA-2.** The first backend is a
test instance. Every client must display a persistent, unmissable banner
stating that this is a test system and that real caller information must not be
entered. `apps/worker/lib/config.ts` already models a `staging` environment;
this is a banner and a served config flag, not a new concept. It is distinct
from the existing `demoMode` (which seeds fake accounts and schedules data
resets) — staging carries real behaviour with a warning, demo carries fake data.

## 5. Architecture

### 5.1 Layering

```
  rung 3  orchestrator/          POLICY   — this spec
          ├─ when a pass may run, which lanes, which work
          ├─ what happens to output, who merges what
          └─ messaging + shared memory
  rung 2  ~/.claude/skills/supervising-dispatched-sessions/
          └─ MECHANICS — worktrees, tmux sessions, status files, dstat
  rung 1  .claude/agents/        ROLES    — six domain supervisors + reviewers
  rung 0  the repo               WORK
```

### 5.2 File map

New directory `orchestrator/` at the repo root, one concern per file, mirroring
the reference system's proven decomposition:

| File | Owns |
|---|---|
| `src/cli.ts` | `doctor status tick digest halt resume revert send` |
| `src/config.ts` | Lanes, roles, breaker constants, path constants |
| `src/tick.ts` | One pass, end to end. Order is the safety property |
| `src/select.ts` | Pure `judge(item, labels, lane)`; rejection telemetry |
| `src/source.ts` | `WorkSource` port — GitHub Issues/Projects implementation |
| `src/sink.ts` | `WorkSink` port — label/column/comment writes, re-read guarded |
| `src/engines.ts` | Session start/send/stop; failure classification |
| `src/worktree.ts` | Create, `--cwd`, pwd probe, salvage, destroy |
| `src/verify.ts` | Mechanical gates, then non-author second opinion |
| `src/scope.ts` | Lane scope + never-write enforcement over the diff |
| `src/impact.ts` | Who merges what |
| `src/circuit.ts` | Rate and consecutive-failure breakers, quota cooldown |
| `src/killswitch.ts` | File switch and phone-reachable issue switch |
| `src/lock.ts` | One scheduler, pidfile with liveness probe |
| `src/ledger.ts` | Append-only JSONL run records |
| `src/memory.ts` | **New** — brief augmentation from ledger, contracts and prior reviews |
| `src/review.ts` | **New** — emit and read back PR reviews; the bounded review loop |
| `src/digest.ts` | Rendering |
| `src/notify.ts` | Delivery |
| `systemd/` | tick timer, digest timer, engine-server unit |
| `bin/llamenos-fleet` | Wrapper resolving repo through symlink, sourcing env |

State lives at `~/.llamenos-fleet/` (`scheduler.lock`, `runs.jsonl`,
`halt-reason.txt`, `resumed-at`, `env`, `fleet.log`). Worktrees at
`.fleet-worktrees/<branch>` inside the repo, gitignored.

`orchestrator/` and its tests are classified high-impact (§5.8): the fleet may
never merge a change to the thing doing the merging, and weakening its own tests
is the same hazard by a shorter route.

### 5.3 Work source: GitHub, behind a port

The reference system's one structural mistake is that `select.ts` imports
`trello.ts` directly, so the board coupling reaches everywhere. We introduce the
seam on day one:

```ts
interface WorkItem { id, title, body, url, labels, lane?, container }
interface WorkSource {
  list(lane: Lane): Promise<WorkItem[] | undefined>   // undefined ≠ []
  labels(id: string): Promise<string[] | undefined>   // fresh, at dispatch time
}
interface WorkSink {
  move(id, column): Promise<void>                     // re-reads before writing
  comment(id, body): Promise<void>
  attach(id, url): Promise<void>
}
```

**`undefined` is not `[]`, and this is load-bearing.** A source that cannot be
read aborts the entire pass. The failure this prevents is specific and was
observed in the reference system: a credential problem rendered every list
unreadable, and the digest reported a quiet night with a full backlog.

Implementation: GitHub Issues carry the work; a Projects v2 board carries state
as columns (`Next-up → In Progress → In Review → Blocked → Done`); labels carry
lane assignment (`lane:ios`, `lane:backend`, …), dispatchability
(`agent-dispatchable`), and vetoes (`needs-human`, `needs-decision`, `blocked`).
Labels are read fresh per item at dispatch time, never from a search index.
An issue whose body is under 200 characters is rejected as under-specified — a
worker briefed on nothing is worse than no worker.

Everything downstream of selection is source-agnostic by construction.

### 5.4 Lanes and roles

**Lanes** are the six existing supervisors. Critically, each lane's `scopePaths`
and never-write paths are **generated from the owned / does-NOT-own declarations
already in `.claude/agents/fragments/*.md`**, by extending `build-agents.sh`.
The agent's prompt and the scope breaker that polices it then cannot drift
apart, because they have one source. `agents:check` (PR #623) already guards
that generation in CI.

| Lane | Scope source | Default engine |
|---|---|---|
| `ios` | `fragments/ios.md` | Claude |
| `android` | `fragments/android.md` | Claude |
| `desktop` | `fragments/desktop.md` | Claude |
| `backend` | `fragments/backend.md` | Claude |
| `shared` | `fragments/shared.md` | Claude |
| `infra` | `fragments/infra.md` | Claude |

Lane order is claim priority; the first lane to claim an item owns it, so two
workers never race the same issue. Per-lane caps bound concurrency; caps never
spill between lanes.

**Roles** are orthogonal to lanes — a lane says *where*, a role says *what kind
of work*:

| Role | Engine / effort | Produces | May write |
|---|---|---|---|
| **Planner** | Opus, high | Issues, dependency edges, lane assignment | Issues only, never code |
| **Implementer** | Sonnet default; Opus when the issue carries `effort:high` | One issue → one worktree → one PR | Its lane's scope only |
| **Reviewer** | *different engine from the author* — Claude author reviewed by GLM/Kimi via opencode, and vice versa | A verdict, and a reply to the author | Nothing — plan mode |
| **Integrator** | Sonnet | Rebases, CI watch, post-merge revert-on-red | Merges only |
| **Release engineer** | Opus, max | Pipeline runs, artifact verification | Never merges its own work |

`crypto-security-reviewer` (already in `.claude/agents/`) is a **mandatory**
additional reviewer on any diff touching `packages/crypto/`,
`packages/protocol/schemas/`, `crypto-labels.json`, or auth/session code.

The Planner is the capability the reference system lacks entirely: it has no way
to generate work, so every task must be hand-written by a human and an oversized
one simply fails three times and is set aside.

### 5.5 The rails

Eight, each a file, each asserted by a test rather than promised by a comment.

1. **Non-author verification** (`verify.ts`). Mechanical gates first and
   blocking — scope check, diff-targeted tests, never the full suite — then a
   second opinion from a *different engine*. The opinion may only downgrade a
   pass; it can never rescue a mechanical failure. An unreachable reviewer
   blocks. Test selection maps changed paths to test targets and runs by argv
   with no shell, because a worker-authored filename containing `$(...)` would
   otherwise execute inside the gate holding every credential.
2. **One scheduler** (`lock.ts`). O_EXCL pidfile with a liveness probe, not
   `flock`, so a stale lock is recoverable by inspection. A second tick exits
   quietly rather than double-dispatching.
3. **Phone-reachable stop** (`killswitch.ts`). `~/.llamenos-fleet-disabled`
   (fails **closed**) or a pinned issue `🛑 HALT ALL AGENTS` carrying a `halt`
   label (fails **open**, deliberately: failing closed would turn any GitHub
   outage into an invisible stop). Checked before a pass and **between every
   dispatch**, so a stop lands within one worker.
4. **Circuit breakers** (`circuit.ts`). A dispatch-rate ceiling and a
   consecutive-failure halt, with provider-quota outcomes excluded from the
   failure count and handled as a per-lane cooldown instead. A tripped breaker
   writes the same halt file a human would — one halted state, one recovery
   path. A resume marker prevents the recorded failures from immediately
   re-tripping, which otherwise makes `resume` a no-op that looks like it worked.
5. **Rehearsed revert** (`cli.ts revert <runId>`). One command: close the PR,
   delete the branch, remove the worktree. Merges are `--squash` precisely so
   that revert is one commit.
6. **Worker really is in its worktree** (`worktree.ts`). We create the worktree
   off `origin/main` and pass it as `--cwd`; then we **ask the worker for `pwd`
   before briefing it** and abort if the answer is wrong. A flag that is
   accepted and ignored is indistinguishable from one that works, unless you
   ask. Work is salvaged to a pushed branch before teardown on every outcome.
7. **Lane modes** (`config.ts`). `off | shadow | live`. `shadow` reads and
   reports and dispatches nothing. **Lane mode and merge gate are separate
   dials**: a `live` lane *dispatches*; it does not thereby *merge*. A live lane
   doing crypto work still stops at human review (§5.8).

   Ramp: **one shadow pass** (~30 minutes), then all six lanes go `live`
   together at cap 1. The shadow pass answers exactly one question — *did the
   generated scope paths come out right?* — which is cheap to ask and expensive
   to skip, because six lanes with wrong scopes is precisely the overwriting
   failure the design exists to prevent. It is not a trust-building exercise;
   the reference system's scars are already encoded as rails.
8. **A live lane must have a write scope.** A lane with empty `scopePaths` gives
   the scope breaker nothing to compare against. Asserted in a test that refuses
   to let such a lane be `live`.

#### Switching the review engine provider

`fleet/review`'s non-author reviewer (rail 1, above) runs on `opencode`,
driven entirely by two repo variables — `vars.FLEET_REVIEW_PROVIDER` (default
`kimi-for-coding`) and `vars.FLEET_REVIEW_MODEL` (default
`kimi-for-coding/k3-256k`) — plus the `FLEET_REVIEW_API_KEY` secret. Switching
provider needs **no code change**:

1. Set the two repo variables (repo Settings → Secrets and variables →
   Actions → Variables) to the new provider id and its `provider/model`
   string, e.g. `zai-coding-plan` / `zai-coding-plan/glm-5.3`.
2. Replace `FLEET_REVIEW_API_KEY` with a key valid for that provider.
3. Force a re-review of any open PR outside the normal label flow (manual
   debugging only): `gh workflow run fleet-review.yml --ref <branch>
   -f pr_number=<n>`. The normal path is applying the `review` label to the
   PR — see below. The "Authenticate the review engine" step keys
   `~/.local/share/opencode/auth.json` off `FLEET_REVIEW_PROVIDER` itself
   (never a literal), the "Smoke-test the review engine" step passes
   `FLEET_REVIEW_MODEL` to `--model`, and the real "Review" step
   (`review-ci` → `review.ts`'s `VERIFIER_ENGINE`) reads the same
   `FLEET_REVIEW_MODEL` env var — so all three move together from the one
   variable change.

This is what unblocked the fleet on 2026-09-15 (determinism invariant #9,
§11): the Kimi subscription backing the hardcoded provider exhausted its
weekly quota, and being un-switchable — not the fail-closed outage itself —
was the actual bug.

The smoke-test step also now names *why* the engine call failed, on one line,
before it fails the job — it never turns a bad call into a pass. Three
causes: `engine-quota` (weekly/usage-limit language), `engine-auth` (401 /
invalid key), or `engine-unavailable` (anything else: bad model id, network
error, rejected config, or a missing verdict). See the comment above
"Smoke-test the review engine" in `fleet-review.yml` for the exact heuristic.

**`fleet/review` now lives in its own workflow file, `fleet-review.yml`, not
`ci.yml`.** `ci.yml` also triggers on `pull_request`, so a job living there
and merely `if:`-gated to skip on that event was still *instantiated* on
every PR — determinism invariant #1 (§11), in the flesh: #844 merged with
`fleet/review` reporting "skipping" and no model review ever run.

`fleet-review.yml`'s first version (#848) triggered on `workflow_dispatch` +
`merge_group` only, so an ordinary PR produced no `fleet/review` context at
all — MISSING, which blocks a merge exactly like a failing check does. That
fixed the fail-open bug, but exposed a second one, found on #848 itself:
`workflow_dispatch` is a repository-level event with no PR of its own to
attach a check run to, so a dispatched run's result — even a correct,
passing one — never counts toward a PR's required contexts. `gh pr view 848
--json statusCheckRollup` never listed it, and `gh pr merge` was refused with
"the base branch policy prohibits the merge", despite the dispatched run
having succeeded against the PR's own head SHA.

The fix: `fleet-review.yml` now triggers on `pull_request`, scoped to
`types: [labeled]`. Applying the `review` label to a PR is the real trigger —
a `pull_request`-triggered run's check result attaches to the PR's head SHA
automatically, the same mechanism `fleet/verify` (`fleet-verify.yml`) already
relies on.

#848's own first fix reintroduced the same bug class: it narrowed the
`labeled` trigger back down with a job-level `if: github.event_name ==
'workflow_dispatch' || github.event.label.name == 'review'`. GitHub cannot
filter a `pull_request` trigger by label *value* — only by `types:` — so
applying any *other* label (e.g. the fleet's own `agent-dispatchable`) still
instantiated the job, which the `if:` then skipped. `fleet/review`'s own
verdict caught this on #848 itself, before #848 merged.

The job now carries **no job-level `if:` at all** — it always runs and always
reaches a real conclusion, on every `labeled` event. What used to be the
job's `if:` is instead the **"Decide whether to run the review engine" step**
— the `review-gate` CLI subcommand (`orchestrator/src/cli.ts`), which wraps
`decideReviewGate` (`orchestrator/src/ci.ts`) — whose exit code and `outcome`
output gate every step after it via their own step-level `if:
steps.gate.outputs.outcome == 'run-engine'`:

- **`cache-hit`** — a prior PASS is cached for this exact diff content
  (`review-cache.ts`). The gate step exits 0 with `outcome=cache-hit`; every
  later step (engine install, auth, smoke test, the real review) is skipped
  by its own `if:`, and the job concludes **SUCCESS** with no engine call at
  all. This is what makes applying an unrelated label to an already-reviewed
  PR cheap and non-destructive, instead of either a wasted model call or (the
  old bug) a silently-satisfied skip.
- **`run-engine`** — no cached PASS, and this event is the `review` label (or
  a manual `workflow_dispatch`). The gate step exits 0 with
  `outcome=run-engine`, and the pipeline runs exactly as before: install the
  engine, authenticate, smoke-test it, then the real review.
- **`not-requested`** — no cached PASS, and this event is any other label.
  The gate step **fails** (exit 1) with "review not requested — add the
  `review` label to run the non-author review". No engine call, no skip — the
  job goes red, which is the correct, honest state for a PR nobody has asked
  to be reviewed yet.

A step failing mid-job still reaches a real job conclusion (failure) — unlike
a job-level `if:`, which can make the whole job report "skipped" and pass
branch protection regardless (invariant #1, §11). `tests/orchestrator/guards.test.ts`
pins that no job-level `if:` exists on this job again.

With no label applied at all, the workflow's `on: pull_request: types:
[labeled]` trigger never fires and the `fleet/review` context stays ABSENT —
fail closed, same semantics as before. Re-adding the label to unchanged
content reuses the prior PASS via the diff-content review cache
(`review-cache.ts`); a FAIL is never cached, so a re-label after a real fix
reviews again for real. `workflow_dispatch` remains as a manual escape hatch
(see step 3 above) but is no longer positioned as the primary path, since a
`workflow_dispatch` run has no PR of its own and cannot satisfy a required
context on its own. `merge_group` is dropped as a trigger entirely: this
repo's GitHub merge queue is unavailable today (owner type `User` — the
ruleset's `merge_queue` rule is rejected outright), and re-adding it later
needs its own request-detection arm and its own rail, not a trigger sitting
ahead of a queue that does not exist yet.

### 5.6 Agent-to-agent messaging

**GitHub is the channel. There is no separate message bus.**

Three surfaces, each matched to what the message is *about*, so a message always
lands anchored to the artifact it concerns:

| Message is about | Surface | Why |
|---|---|---|
| A work item — planner→implementer, cross-domain ask, "I need X before I can do Y" | **Issue comments** on that item | The item is the thread |
| A diff — the review loop | **PR reviews**, with inline comments | Anchored to the lines in question, carries `APPROVE` / `REQUEST_CHANGES` as machine-readable state, and threads resolve |
| Fleet-wide state — halt, breaker trip | **The pinned control issue** | One place, phone-readable |

**The review loop is a real PR review, not a synthesised message.** The reviewer
role emits `gh pr review --request-changes` or `--approve` with inline comments
on specific lines; the author reads them back via the reviews API and revises.
Bounded at **two rounds**, then a human.

This is materially better than the custom channel two drafts of this spec
proposed, for a reason that generalises: the reviewer's output is now *the same
artifact a human reviewer would produce*. You can open the PR, read the
machine's review inline next to the code, and reply in the same thread — and
your reply is in the channel the author already reads. No bridging, no
translation, no second system that has to be kept in sync with the one
everybody actually looks at.

**Two designs are deliberately cut here**, and the reasoning is recorded so they
are not re-proposed:

- *A git-based mailbox under `.claude/coordination/inbox/`.* Every worker runs
  in its own worktree, so a committed message is invisible to peers until pushed
  and pulled. It silently assumed a shared filesystem that does not exist, and
  the append-at-top `blockers.md` format would have put a three-way merge on the
  hot path of every message with six concurrent lanes.
- *A runtime relay (`relay.ts`) delivering messages between live sessions.* On
  inspection it buys nothing. A worker is inside one long turn — up to 60
  minutes — and cannot act on a message until that turn ends, so sub-second
  delivery has no consumer. Between turns, polling GitHub is equivalent. The
  only genuine need is the orchestrator telling a worker something, and that is
  the send channel it already has. `relay.ts` and `mailbox.ts` are dropped from
  the file map; where the orchestrator needs to wake a worker, it sends on the
  existing channel and points at the GitHub thread.

That leaves the messaging layer as a thin convention over `gh` rather than a
subsystem — which is the correct size for it.

Comment bodies carry a machine-parseable prefix so threads can be read back
without prose parsing:

```
<!-- fleet: from=<role>/<lane> to=<role>/<lane> needs=reply|ack|none ref=<sha|pr> -->
```

### 5.7 Shared memory

Split by what the data *is*, not by convenience. The test is whether a reader
needs the value **as of now** or **as of a commit**.

| Layer | Where | Writer | Why there |
|---|---|---|---|
| Messages, blockers | GitHub issues/comments | any role | Realtime, conflict-free, human-participable |
| Review feedback | GitHub PR reviews (inline) | reviewer role | Anchored to the diff; identical to what a human reviewer produces |
| Per-domain status | **Derived** from the Projects board + ledger | nobody | A file six agents rewrite to restate what the board already knows is a conflict generator with no readers |
| Interface contracts | `.claude/coordination/contracts/` **in git** | the domain owning the interface | Must be true *at a commit* |
| Run ledger | `~/.llamenos-fleet/runs.jsonl` | orchestrator | High write rate, machine-only |

**Contracts stay in git, and this is the one exception worth defending.** A
contract says "the backend's API shape is X, so iOS and Android must match". It
must be true at a given commit, and it must change *in the PR that changes the
interface*, reviewed alongside it. A contract living in a GitHub comment is read
by a worker checked out at an older commit as a description of code that worker
does not have. Everything else in this table benefits from being live; this one
benefits from being pinned. `contracts/` is currently an empty `.gitkeep` and is
the obvious home for the cross-platform coupling this monorepo generates
constantly.

Consequently `.claude/coordination/STATUS.md` and `blockers.md` are **deleted**
— they are conventions that were never used, and both are better served by the
board and by labelled issues.

`memory.ts` augments every brief with what is already known about the item:
prior attempts and why they failed, the reviewer's last verdict, and any
contract governing the files it is about to touch. This closes the reference
system's sharpest gap — there, the ledger is written by the orchestrator and
read by nothing that briefs a worker, so every run starts from zero.

### 5.8 Merge policy

The axis is **how expensive it is to be wrong**, never how confident the agent
sounds.

**Merges on green CI + a non-author review from a different engine:** ordinary
code, tests, docs, BDD step definitions, scoped refactors, dependency bumps that
CI covers.

**Always waits for a human:** `packages/crypto/`, `packages/protocol/schemas/`,
`crypto-labels.json`, auth / session / WebAuthn / sigchain, database migrations,
`.github/workflows/`, `deploy/`, store metadata and signing configuration, the
knope release PR, and `orchestrator/` itself. Plus any diff over 40 files or
1,500 lines, regardless of content.

A high-impact PR gets a *longer* review, not merely a slower one: the reviewer is
told why it was classified high-impact and given the turns to read the
surrounding code, and its review is posted on the issue so the human starts from
it rather than from scratch.

This is stricter than the reference system by design. Llámenos protects
volunteer and caller identity against well-funded adversaries; the crypto and
protocol layers are where a quiet mistake becomes an identity disclosure.

### 5.9 Notification

Per your answer: **ping when blocked, plus a twice-daily digest.** No
notification on ordinary progress.

- **Blocked pings** — a push notification when a decision is genuinely needed:
  a breaker trips, an item exhausts its attempts, a high-impact PR reaches
  review, a human-only action becomes the critical path.
- **Digest**, 07:00 and 18:00 — what shipped, what is blocked and on whom, the
  IA burn-down, the outcome histogram, and **"not picked up (N) — why the board
  did not move"** as a rejection histogram. The last is the one that catches a
  silently broken fleet.
- The digest must state the resume command, and that command must exist. The
  reference system once told people to run a binary that had never been
  installed — the single instruction sent at the moment everything was halted
  did not work.

## 6. The IA burn-down

**Scope note.** The implementation plan that follows this spec covers §5 only —
building the fleet. §6 is not implemented by that plan; it is the *backlog the
fleet consumes*, and lands as seeded GitHub issues with lane labels and
dependency edges. This keeps the build reviewable and stops the plan from
swallowing the entire product roadmap.

Waves are dependency-ordered, not time-boxed.

**Wave 0 — unblock (the fleet cannot work on a red repo)**
- `bun audit` critical: Astro RCE via AVIF, GHSA-26w7-cxv4-gfx2, in `site/`.
  Security Audit has been red three consecutive days on this alone.
- Reconcile the two disjoint tag lineages (`v0.51.6` and `v0.19.9`). The
  updater's `latest.json` cannot be trusted until version identity is single-valued.
- Fix PR #623's two defects and land it, with the rest of the `fleet-*` family
  (#613, #614, #615, #619, #620, #621, #622, #624, #625):
  1. `prompt-rules-llamenos.md` hardcodes `llamenos-hotline` — the *sibling*
     repo — and lists only Bun/Playwright/Postgres test tiers, with no iOS,
     Android, crypto or Tauri tiers. Vendoring it makes that mismatch
     version-controlled and load-bearing.
  2. The vendored copies already lag the `~/.claude/skills/` originals, which
     have since gained the GLM/z.ai runtime.
- **Make the release workflows fail loudly.** Both mobile upload steps are
  guarded on secrets being non-empty, so a missing secret yields a green run
  that shipped nothing. Convert the guards to explicit failures.

**Wave 1 — prove the pipeline (IA-1, IA-6)**
One artifact of each kind, produced **by CI**, attached to a release:
desktop installers (`tauri-release.yml`, one failed run ever), Android AAB to
the internal track (secrets are already provisioned), iOS IPA to TestFlight.
iOS additionally needs the wiring that does not exist: create the GitHub
Environments (none exist today) and add `APPLE_API_KEY_BASE64`, the certificate
secrets, and a real `match` repository — `MATCH_GIT_URL` currently points at a
placeholder. Also reconcile `mobile-release.yml`'s hand-rolled `xcodebuild` path
with the `fastlane` lanes it diverged from, and remove the `|| true` that lets a
failed archive report success.

**Wave 2 — a backend to point at (IA-2)**
Stand up the staging instance, with the warning banner as a blocking
requirement of the wave, not a follow-up. `apps/worker/lib/config.ts` already
models `staging`; the work is the served flag, the client banners on all three
platforms (via `packages/i18n`, all locales), and the deploy itself. Verify
against `deploy/PRODUCTION_CHECKLIST.md` and record which items a staging
instance legitimately defers. Audit the committed `deploy/docker/.env` and
`.env.shard-*` for live credentials before anything is deployed.

**Wave 3 — the human path (IA-3, IA-4, IA-5)**
Walk the non-technical journey end to end and fix what it finds: invite →
install → PIN → device key → sigchain → on shift → simulated call → note →
admin reads it. Crash reporting verified live rather than assumed from an epic
marked DONE. In-app feedback path, because non-technical testers will not open
GitHub issues.

**Wave 4 — hand to testers, then FDE production**
Internal testers on both tracks. Then the FDE production deploy: the ISO builder
already passes, `deploy-prod.yml` has never run, and the 83-item checklist gets
worked.

## 7. Human-only actions

Stated plainly, because a fleet that pretends otherwise wastes your time:
Apple Developer administration and App Store Connect submission; Play Console
account, data-safety declaration, and tester management; signing key custody and
the offline minisign ceremony in the `release-signing` skill; VPS provisioning,
the LUKS passphrase entered over noVNC, and DNS cutover; telephony provider
accounts and any credential that costs money per use.

The fleet's job is to arrive at each of these with everything else complete and
a one-line ask. That ask is what the blocked ping carries.

## 8. Risks

| Risk | Mitigation |
|---|---|
| The fleet edits its own controls | `orchestrator/` and its tests are high-impact; never self-merged |
| A silent fleet looks like a quiet night | `undefined ≠ []` aborts the pass; the digest's rejection histogram is a required section |
| Crypto regression reaches a volunteer | crypto/protocol/auth always human-gated, plus a mandatory `crypto-security-reviewer` |
| A tester enters real caller data on staging | The warning banner is a blocking requirement of Wave 2, on every client |
| Two agents fight over one file | Lane ownership from generated scope paths, enforced mechanically by the scope breaker — not by prompt text, which the reference system relies on and cannot enforce |
| Review loop spirals | Bounded at two rounds, then a human |
| A worker runs outside its worktree | `pwd` probe before briefing; abort on mismatch |
| Credentials exposed to a worker | Workers never receive store, signing, deploy or telephony credentials. Those live only in CI and on your machines |

## 9. Testing

- **Pure functions tested directly**: `judge`, `destinationFor`, `impact`,
  scope checks, breaker predicates. These are where the safety properties live,
  and they take no I/O by design.
- **Guard tests** assert each rail, in the reference system's style: a `live`
  lane cannot have an empty scope; the fleet cannot merge `orchestrator/`; the
  halt check runs between dispatches; an unreadable source aborts the pass.
- **Shadow mode is the integration test.** Every lane runs `shadow` first, and
  the digest reports what would have happened. A lane goes `live` on evidence,
  one lane at a time.

## 10. Decisions recorded

| Question | Decision |
|---|---|
| Work source | GitHub Issues + Projects v2, behind a port |
| Merge policy | Green CI + non-author review; crypto/protocol/auth/CI/deploy/release/orchestrator always human |
| Scheduler host | This Linux box, systemd user timers |
| Notification | Blocked pings + twice-daily digest |
| Milestone | Internal Availability, not GA |
| iOS pipeline | Wire CI properly (Environments + Apple secrets + real match repo) |
| First backend | Staging instance with a mandatory warning banner; FDE production deferred to Wave 4 |
| Telephony | Simulated for IA; real PSTN later |
| Agent messaging | GitHub only: issue comments for items, PR reviews for diffs. No custom bus — a git mailbox assumed a shared filesystem, and a runtime relay had no consumer |
| Shared memory | Contracts in git (true *at a commit*); everything else on GitHub or derived |
| Ramp | One shadow pass, then all six lanes live at cap 1 |

## 11. Determinism invariants

Checkable invariants, not advice — each learned from a specific live failure. Canonical
source: `/home/rikki/tier-prompts/determinism-rules.md`; folded into every worker prompt
via `.claude/agents/fragments/_worker-rules.md`.

**Gating and merges**
1. A skipped required check counts as SATISFIED — never gate with a job-level `if:` inside a workflow that also triggers on `pull_request` (#844 merged with `fleet/review` reporting "skipping" and no review ever run; §5.5).
2. Freshness is keyed to the head SHA, never a time window (a clock lets a push slip past a stale PASS).
3. Anything a gate calls must already exist on `main` — gate jobs run base-ref code (a PR adding the CLI subcommand a gate invokes would break the gate on itself if not landed first, additively).
4. Re-run policy is exhaustive, not ad hoc: UNREADABLE verdicts and named Playwright probe-races get one re-run each; infra/network errors get one; a substantive FAIL, lint, typecheck, backend, or build failure never does (re-running is not a bypass; merging past red is).
5. Never `--admin`, `--force`, `--approve`, `--no-verify`, or a ruleset edit to land a PR (bot-authored PRs need a code-owner approval, given only after the gate passes).
6. A PR's changed paths decide which checks matter — required contexts stay fixed; scoping lives in `ci.yml`'s own `if:` (a skipped job still satisfies the required-check aggregate, per #1).

**Fleet mechanics**
7. Never trust a worker's self-report — branch, worktree, PR number and outcome are derived from `gh`/`git` at read time (a status file that carries branch/worktree is a claim, not an observation).
8. Pass the branch explicitly and verify the worktree is actually on it before briefing the worker (a mismatch is a recorded failure, never a silent skip — rail 6, §5.5).
9. Quota exhaustion is not task failure — classify it separately, halt with the reset time, auto-resume when the window elapses (the 2026-09-15 Kimi weekly-quota outage that made `fleet/review` red repo-wide with no recovery until the provider became switchable; §5.5).
10. A verification gap is not a failure either — a worker that wrote SUCCESS and opened a PR is never recorded FAILED solely because it could not be independently verified.
11. Engines are routed by role, not availability — implementation workers on Claude, the review gate on its own quota (sharing one subscription starves the gate exactly when it is needed most; §5.4).
12. Workers run every command in the FOREGROUND (a backgrounded run outlives the session; the worker dies with no terminal status and the work is lost).
13. Tests must never touch the operator's real fleet state — `FLEET_HOME` isolation is enforced in code (a test resolving the real halt file is an error, not a warning).

**Code rules that keep biting**
14. Codegen renames are bulk renames — never a typealias, never a hand-written duplicate of a generated type (a hand-written duplicate drifts the moment the schema changes).
15. No non-waiting probe may guard a write — `isVisible()`/`.first()` used for control flow around a click/fill/toggle is a bug regardless of flakiness.
16. Fix the app, not the test — a test that passes when its dependency is unreachable is a no-op (make it fail loudly or exclude it by tag).
