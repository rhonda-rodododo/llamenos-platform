# Fleet addendum — deterministic, event-driven orchestration

Status: **Addendum to** `docs/superpowers/specs/2026-09-11-llamenos-fleet-orchestrator-design.md`
Date: 2026-09-13
Scope: `orchestrator/`, `tests/orchestrator/`, `orchestrator/systemd/`, the
`fleet-verify` / `fleet-review` jobs in `.github/workflows/ci.yml`.

All line references are against the fleet as it exists on PR #777
(`fleet-drop-merge-gate`), i.e. the fleet as it will be once #777 lands. That
branch is treated as `main` throughout.

---

## 1. Why this addendum exists

The fleet's *policy* is already sound: GitHub is the gate, the two required
checks are computed on GitHub's runners against one head SHA, the orchestrator
merges nothing, and outcome facts are derived on read rather than cached in a
label. `ledger.ts`'s module comment, `status.ts`, and `worktree.ts`'s single
remaining label write are the record of that work, and none of it is reopened
here.

What is left is *mechanism*. The fleet still:

- wakes on a wall clock rather than on the thing it is reacting to;
- rescans all state on every wake rather than consuming a cursor of events;
- decides two of its most consequential questions — "did the tests pass?" and
  "what did the reviewer say?" — by matching a regular expression against
  human-readable prose that a pull request can influence;
- carries one of its own gate facts (the verified commit SHA) as a substring
  of a 300-character-truncated free-text note.

Two of those are **fail-open in a required check**. That is the whole reason
this document is ordered the way it is.

The standing constraints are unchanged and every proposal below is written to
respect them:

- **GitHub is the gate.** Nothing here moves a merge decision back into the
  orchestrator. Every replacement is about *when the fleet wakes* and *how it
  reads a fact it already gathers*.
- **Derive, never cache.** Two proposals (§4.3, §4.4) exist specifically to
  delete a cached claim.
- **Prefer removing a capability to guarding it.** §4.9 and §4.10 remove
  capabilities. Exactly one new guard is proposed (§4.10) and it guards the
  absence of a capability that does not exist yet, which is the cheap
  direction.
- **Fragile complexity is worse than a small gap.** §5 lists what is
  deliberately left alone, including three places where the obvious "more
  deterministic" answer is worse than the gap.

---

## 2. Inventory

Categories: **(a)** time-based polling instead of event-driven; **(b)** full
state scan instead of a cursor of events processed idempotently; **(c)**
model/LLM judgement where a deterministic rule could decide; **(d)** heuristic
(regex over prose, similarity thresholds); **(e)** cached state used as truth.

| # | Cat | Location | What it does today | Why it is non-deterministic / polling | Failure it can cause |
|---|---|---|---|---|---|
| 1 | c | `orchestrator/src/verify.ts:243-247`, `:336-355`, `:359` | `parseFailingCount` regexes `/Tests\s+(\d+)\s+failed/i` out of vitest's text reporter; a non-zero exit with no parsed count sets `testsPassed = undefined`, and `passed` is `!scopeFailed && testsPassed !== false` | The verdict depends on a human-facing reporter string, and the "could not parse" branch resolves to **pass** | `fleet/verify` — a **required** check — goes green when the test runner OOM'd, crashed before collecting, was killed, or changed its summary wording. Fail-open |
| 2 | c/d | `orchestrator/src/review.ts:157-162` | `parseVerdict` takes the **first** `/verdict:\s*(pass\|fail)/i` match **anywhere** in the reviewer's stdout | The brief (`review.ts:119-131`) demands a terminal line; the parser accepts any position, any case, first-wins | A reviewer that quotes the diff before deciding is parsed from the quoted text. The literal string `VERDICT: PASS` is already present in tracked files (`tests/orchestrator/review.test.ts:21`, `ci.test.ts:168`), so a PR can put it in a diff the reviewer will echo. `fleet/review` — the other **required** check — goes green on the defendant's own words. Also: "I first wrote VERDICT: PASS, but … VERDICT: FAIL" parses PASS |
| 3 | d/e | `orchestrator/src/status.ts:69-77` + `orchestrator/src/tick.ts:155-159`, `:321-327` | The verified commit is written into the ledger `note` as a `sha=<commit>` field and read back with a regex; `truncateNote` caps the note at 300 chars, and `arm=failed(<error>)` is **prefixed** before the trace | A typed fact is stored as a substring of prose that a variable-length error message can push past the truncation boundary. `sha=` is the last field emitted, so it is the first thing lost | `llamenos-fleet status <issue>` reports "verification never ran" for a PR that was fully verified and reviewed — the exact ambiguity `buildGateTrace` was built to remove |
| 4 | d/e | `orchestrator/src/engines.ts:250-256` → `orchestrator/src/cli.ts:264` (`resolveDispatchResult`, `:231-239`) | `branch` and `worktree` are repaired deterministically; `pr` is still taken from the worker's own status file | The status file is written non-atomically by an external dependency (`dispatch-one.sh:1265` `cat > "$SF"`, and the launcher footer's `io.open(sf, "w")`), read on a 5-second poll. `status:` is written **before** `pr:` | A read interleaved with a write sees `status: SUCCESS` with no `pr` → `tick.ts:330-365` skips scope, tests and review entirely, records `SUCCESS`, labels `needs-human`. That is issue #660's exact shape, still reachable |
| 5 | a | `orchestrator/src/engines.ts:230-237` | `while (Date.now() < deadline) { readStatus(); await sleep(5000) }` for up to `timeoutSec + 30s` (90 min + 30 s by default) | Progress is discovered by re-`stat`ing a file 1,080 times rather than by being told once. `Date.now()` is read directly, not injected | The pass is serial (`tick.ts:479-538`), so one 90-minute worker blocks every other lane for the rest of that pass; and `engines.ts:97-101` concedes the loop is unobservable to any unit test |
| 6 | a | `orchestrator/systemd/llamenos-fleet-tick.timer:13` | `OnCalendar=*-*-* *:00,30:00` | The fleet reacts to a labelled issue on a wall clock, not on the label | Up to 30 minutes of latency on every item; and every wake costs a full backlog scan whether or not anything changed |
| 7 | b | `orchestrator/src/tick.ts:458-472` + `orchestrator/src/source.ts:46-53`, `:60-63` | Per lane: `gh issue list --limit 200`, then one `gh issue view --json labels` per item, then `judge` over everything | O(backlog) API calls per wake, forever, with no notion of what changed since the last wake | Rate-limit pressure that grows with the backlog rather than with the work; and a rejection histogram recomputed from scratch each pass, which cannot say what changed |
| 8 | b | `orchestrator/src/source.ts:46-53`; consumed by `tick.ts:171-179` (`claimAcrossLanes`) and `tick.ts:492` (`taken >= lane.cap`) | `gh issue list` with no `--sort`/`--order`; candidate order is whatever the API returned | `selectForLane` is pure but **order-preserving**, so it is a pure function of the input order — and the input order is not pinned | Which issue a cap-1 lane picks is not reproducible and cannot be replayed from the ledger. Two runs over the same board can dispatch different work |
| 9 | b/e | `orchestrator/src/cli.ts:57-72` (`lastTickResult`), consumed at `:121`, `:509`, `:795` | Reads the **entire** `fleet.log` backwards on every `doctor`/`status`/`digest`, returning the last line that JSON-parses to an object with a `ran` key | A log file used as an event store: no schema, no cursor, unbounded growth, and any other JSON log line carrying `ran` is mistaken for a `TickResult` | The digest's `sourceUnreadable` banner (`digest.ts:232`) and its rejection histogram describe **one** pass — the other 23 between digests are invisible. A stale claim rendered as current state |
| 10 | b | `orchestrator/src/cli.ts:984-993` (`defaultListDirtyFleetPrs`) | `gh pr list --limit 100 --json mergeStateStatus`, keep `=== 'DIRTY'` | `mergeStateStatus` is computed lazily by GitHub and returns `UNKNOWN` while it recomputes; anything not `DIRTY` is treated as clean | A PR that *is* dirty is silently skipped because GitHub had not finished computing it at read time. Read-failure and "fine" are conflated — the one conflation this fleet's `undefined ≠ []` rule exists to forbid |
| 11 | a | `orchestrator/systemd/` contains only `tick` and `digest` units; `integrate` is `cli.ts:1091` | The DIRTY-PR sweep has no timer, no event, and no caller | Nothing ever runs it unattended | A capability that exists, is tested, and never executes. Dead weight that reads as coverage |
| 12 | a | `orchestrator/src/roles/integrator.ts:169-233` (`revertMerge`, `evaluatePostMerge`) | Post-merge revert-on-red. `grep` finds callers **only in `tests/orchestrator/integrator.test.ts`** | Never wired to any event or tick | The spec's §5.4 "CI watch, post-merge revert-on-red" does not happen. `main` can go red after a fleet merge and nothing notices |
| 13 | d | `orchestrator/src/trace.ts:27-31` (`SCOPE_REASON_PREFIXES`) | The gate trace decides `scope=fail(...)` by prefix-matching `verify.ts`'s English reason strings | Two files coupled by prose. The comment admits it and pins it with a test | A reworded reason in `verify.ts` silently renders a scope failure as `scope=pass` in the ledger |
| 14 | d | `orchestrator/src/cli.ts:134`, `:174` | `dep.problems.filter((p) => !/uncommitted/i.test(p))` separates hard failures from warnings | Severity is recovered by regexing the fleet's own English message, when `problemsWith` (`dependency.ts:395-422`) constructed each one and knew its kind | A reworded problem message flips a warning into a `doctor` failure, or a hard failure into a warning nobody acts on |
| 15 | d | `orchestrator/src/ci.ts:111-114` (`verdictSummary`) | `/verdict:/i` over the reviewer's lines, for the job summary | Same first-match-anywhere shape as #2 | Cosmetic only (summary text), but it will disagree with the parsed verdict. Folds into #2 |
| 16 | a/e | `orchestrator/src/killswitch.ts:30-36`, called from `tick.ts:436` and `tick.ts:501` | `gh issue list --label halt` before the pass and **between every dispatch** | A control input read by polling | Acceptable and intentional (fails open on purpose). Listed for completeness; see §5 |
| 17 | c/d | `orchestrator/src/roles/planner.ts:101-110`, `:156-170` | `parseProposals` greedy-matches `/\[[\s\S]*]/` over model output; `isNearDuplicate` uses Jaccard ≥ 0.6 over normalised titles | Both heuristic | Bounded: every proposal is created with `needs-human` unconditionally (`planner.ts:215-229`), so it is inert to every lane. See §5 |
| 18 | — | `orchestrator/src/worktree.ts:70` | `salvage/${branchHint}-${Date.now()}` | Unpredictable name, never recorded in the ledger (only logged, `worktree.ts:196`) | Salvaged work cannot be found from the ledger; two salvages in the same millisecond collide |
| 19 | — | nothing | There is **no** CI re-run capability anywhere in `orchestrator/` (`grep -i rerun` over `orchestrator/src` returns nothing) | — | Nothing to fix. §4.10 makes the absence permanent rather than accidental |

---

## 3. The shape of the replacement

One long-lived process, `llamenos-fleet watch`, installed once, with **no
inbound port**:

```
llamenos-fleet watch  (systemd user service, Restart=always)
  ├─ inotify (fs.watch) on ~/tier-overnight-status/   → worker terminal status
  ├─ GitHub events cursor: GET /repos/{o}/{r}/events  → issue / PR / check events
  │    conditional (If-None-Match), honouring X-Poll-Interval (observed: 60s)
  ├─ fallback tick every 15 minutes                   → the safety net
  └─ the existing tick() body, unchanged, as the handler
```

`tick()` keeps its lock, its halt checks, its breakers and its order. What
changes is only **what wakes it** and **what it is told changed**.

### Why a cursor and not a webhook

A webhook (`check_suite`, `pull_request`, `issues`) is genuinely better on
latency and costs no polling at all. Its cost here is an inbound public
endpoint on the operator's box. `deploy/` has **no** `cloudflared` role,
service, or config today — the tunnel is referenced in `CLAUDE.md` as the
ingress story for the product, not as something already standing. Choosing
webhooks therefore means: stand up a tunnel, hold a webhook secret, verify
`X-Hub-Signature-256` on every delivery, and handle replay. That is a new,
internet-facing trust boundary added to a fleet whose entire security argument
is that it has none.

The cursor gives ~60-second latency (GitHub's own `X-Poll-Interval` on this
repo), costs nothing against the rate limit while nothing changes (a `304` from
a conditional request is not billed), needs no secret, and can be turned off by
stopping one systemd unit. Recommendation: **cursor now, webhook never unless
latency becomes the binding constraint.** The decision is recorded as a
`needs-decision` issue so it is made once, on purpose.

### One non-obvious fact about the events cursor

Event `id`s on this repo are **not** globally monotonic across event types.
Measured on `rhonda-rodododo/llamenos-platform` on 2026-09-13:

```
{"created_at":"2026-09-13T13:33:16Z","id":"14943956576","type":"IssuesEvent"}
{"created_at":"2026-09-13T13:31:35Z","id":"20993830745","type":"PushEvent"}
```

A newer `IssuesEvent` carries a *smaller* id than an older `PushEvent`. A
cursor implemented as an "id high-water mark" — the obvious design — would
therefore drop every issue event permanently the first time a push landed. The
cursor must be **a bounded set of seen event ids plus the newest `created_at`
observed**, and every event must be processed **idempotently**, keyed by id.
The idempotency is what makes replaying the whole page harmless, which is what
makes the fallback tick harmless, which is what makes the whole design fail
safe.

---

## 4. Replacements, in order of risk removed ÷ lines added

### 4.1 `fleet/verify` reads a machine-readable test result, and fails closed

**Today** `verify.ts:215-247` runs `bunx vitest run --config <c> <target>`,
scrapes `/Tests\s+(\d+)\s+failed/i` out of the text reporter, and at `:340`,
`:347-352`, `:359` treats "exited non-zero, nothing parseable" as *not a
failure*.

**Mechanism.** Run with `--reporter=json --outputFile=<tmp>/vitest-<target>.json`
and read the file. Vitest's JSON result carries `success`, `numFailedTests`
and `numFailedTestSuites` as numbers. The verdict becomes:

- file present, parses, `success === true` and `numFailedTests === 0` and
  `numFailedTestSuites === 0` → `testsPassed: true`;
- file present, parses, anything else → `testsPassed: false`;
- **file absent, unparseable, or the runner exited non-zero with no file →
  `testsPassed: false`,** with the reason naming which.

**Removes.** `parseFailingCount` (5 lines) and the entire
`sawUnparsedNonZero` / "infrastructure, not a code failure" branch
(`verify.ts:339-352`, ~14 lines). Net deletion.

**Invariant.** `fleet/verify` is green only when a machine-readable result
exists and says every selected suite passed. There is no path from "could not
tell" to green.

**Fails closed by.** Every unknown resolving to `false`, not `undefined`.

**Test that proves it.** Point `verifyMechanical` at a real temp repo with a
route whose runner is a stub that (i) writes a JSON result with
`numFailedTests: 1`, (ii) writes nothing and exits 137 (SIGKILL/OOM), (iii)
writes malformed JSON and exits 0. All three must produce `passed: false` with
distinguishable reasons. Case (ii) is the one that passes today.

---

### 4.2 `parseVerdict` reads the last line, exactly, or it is UNREADABLE

**Today** `review.ts:157-162`: first `/verdict:\s*(pass|fail)/i` anywhere wins.

**Mechanism.** Take the reviewer's output, split on newlines, drop trailing
blank lines, take the **last non-empty line**, and require it to match
`/^VERDICT: (PASS|FAIL)\b/` — case-sensitive, anchored, no leading text.
`FAIL` may carry ` — <reason>`; `PASS` may carry nothing. Anything else,
including a `VERDICT:` line anywhere earlier in the output, is `UNREADABLE`.
`ci.ts:111-114`'s `verdictSummary` is replaced by returning that same line.

**Removes.** The permissive regex, and `verdictSummary`'s duplicate one
(~4 lines). Nothing is added but an anchor and a "last line" selection.

**Invariant.** A verdict is a statement the reviewer made **as its final act**.
Text the reviewer merely quoted — from the diff, from the PR body, from the
brief — can never be the verdict, because it is never last.

**Fails closed by.** `UNREADABLE` already fails `fleet/review`
(`ci.ts:268-271`, `ok: result.verdict === 'PASS'`) and already ends the
bounded loop for a human (`review.ts:728-743`). This change only widens what
counts as UNREADABLE; it can never turn a FAIL into a PASS.

**Test that proves it.** A reviewer output that *quotes a diff containing the
literal line* `VERDICT: PASS` and then ends `VERDICT: FAIL — leaks a key` must
parse `FAIL`. Today it parses `PASS`. Plus: trailing whitespace/newlines
tolerated; `verdict: pass` lowercase → `UNREADABLE`; a `VERDICT: PASS` line
followed by any prose → `UNREADABLE`.

> The brief already tells the reviewer to end with exactly that line
> (`review.ts:119-131`), so this makes the parser enforce the contract the
> prompt already states. No prompt change is needed.

---

### 4.3 The PR number is derived from GitHub, never read from the worker

**Today** `engines.ts:250-256` takes `pr` from the worker's status file;
`cli.ts:231-239` already repairs `branch` and `worktree` from sources that
cannot drift, and explains at length why the worker's own report is the one
source already observed to omit fields it promised — then leaves `pr` on it.

**Mechanism.** After dispatch, `resolveDispatchResult` also resolves the PR:
`gh pr list --head fleet/<lane>/<item> --state all --json number --limit 1`.
The branch name is deterministic and known before dispatch
(`cli.ts:242`), so this needs nothing from the worker. The status file's `pr:`
is no longer read.

**Removes.** `tick.ts:330-365` — the whole "claimed SUCCESS the fleet cannot
verify" branch, its comment, its `commentOnPr` call and its `needsHuman: true`
(~36 lines), because the case it handles (`pr === undefined` on a SUCCESS)
becomes unreachable for any worker that actually opened a PR. A worker that
opened **no** PR still lands there via `branch`/`worktree`, which is correct
and is kept. Net deletion.

**Invariant.** Every fact the pipeline gates on — branch, worktree, PR — comes
from git or GitHub, never from a file a worker wrote.

**Fails closed by.** An unreadable `gh` response yields `undefined`
(`ghJson`'s contract), which is the existing "cannot verify" path, unchanged.

**Test that proves it.** Feed `resolveDispatchResult` a `DispatchOutcome` with
`outcome: 'SUCCESS'` and **no** `pr` (the torn-read shape) plus a stub
`findPrForBranch` that returns `'42'`; assert the resolved outcome carries
`pr: '42'`, and that `tick` then runs the full verify → review → arm pipeline
rather than the skip branch.

---

### 4.4 The verified SHA is a ledger field, not a substring of prose

**Today** `tick.ts:321-327` builds a trace string ending `sha=<commit>`,
optionally prefixes `arm=failed(<error>)`, then `truncateNote` cuts the whole
thing at 300 chars (`tick.ts:155-159`); `status.ts:69-77` regexes `sha=` back
out.

**Mechanism.** Add `verifiedSha?: string` to `RunRecord` (`ledger.ts:36-47`)
and set it from `report.verifiedCommit` at the one place the terminal row is
built. `status.ts` reads the field. `buildGateTrace` keeps emitting `sha=` for
human readers; nothing parses it any more.

**Removes.** `SHA_FIELD_RE`, `extractVerifiedSha`, its comment, and the
ordering constraint that `sha=` must be the last field — a constraint
currently spread across three files' comments (~20 lines of code and comment).

**Invariant.** A fact the fleet computed is stored as a typed field; the note
stays prose for humans and is never parsed.

**Fails closed by.** `verifiedSha` absent → `headMatchesVerified: undefined` →
rendered "(none recorded)", exactly as today. Truncation can no longer
manufacture that state.

**Test that proves it.** Build a terminal row whose arm-failure message is 400
characters; assert the note truncates **and** `deriveItemStatus` still reports
the verified SHA and `headMatchesVerified: true`. Today the SHA is gone.

---

### 4.5 Selection has one stable total order

**Today** candidate order is the API's (`source.ts:46-53`), consumed by
`claimAcrossLanes` and the per-lane cap.

**Mechanism.** `selectForLane` sorts its accepted candidates by a total order
that is a pure function of the item: **ascending numeric item id**, with the
raw string id as the tiebreak. Oldest issue first, deterministically. The
ledger is not consulted for ordering — attempt counts already gate admission
(`tick.ts:494`), and folding them into ordering would make the order depend on
mutable state for no gain.

**Removes.** Nothing. Adds ~4 lines.

**Invariant.** Given the same open issues and the same labels, two runs pick
the same item, in the same order, on any machine.

**Fails closed by.** N/A — this is a determinism property, not a safety gate.
It makes every other property replayable.

**Test that proves it.** `selectForLane` over a shuffled input array produces
byte-identical output to the sorted input, for several shuffles; and a
property-style check that the output order does not depend on input order.

---

### 4.6 Worker completion arrives as an inotify event

**Today** `engines.ts:230-237` sleep-polls every 5 s.

**Mechanism.** `fs.watch(STATUS_DIR)` (inotify on Linux) filtered to
`<name>.status`; on each event re-read the file and test `isTerminalStatus`.
One `setTimeout` carries the deadline instead of a `Date.now()` comparison in
a loop; the clock is injected so the deadline is testable. One immediate read
before arming the watcher closes the "already terminal" race. `fs.watch` is
documented as unreliable on some platforms — so the fallback is a **single
low-frequency re-read** (60 s), not the 5-second loop: the watcher is the fast
path, the slow re-read is the safety net, and both go through the same
`readStatus` handler.

**Removes.** The `sleep` helper, `POLL_INTERVAL_MS`, and the `Date.now()`
loop (~10 lines), plus 1,080 stat calls per 90-minute worker.

**Invariant.** A worker's terminal status is observed within one filesystem
event, and the deadline is a single timer rather than a race between two
clocks.

**Fails closed by.** Deadline expiry still yields whatever the last read saw,
and `statusToOutcome`'s `default` is already `FAILED` (`engines.ts:126-136`) —
silence remains indistinguishable from failure, never from success.

**Test that proves it.** Against a real temp `STATUS_DIR`: write a
non-terminal status, arm the watcher, then write a terminal status **after**
the watcher is armed, and assert the promise resolves from the event with no
sleep and no deadline expiry. Separately: write the terminal status **before**
arming, and assert it is still observed (the pre-read). Neither test mocks
`fs.watch`.

> This depends on `dispatch-one.sh`, which this repo does not vendor
> (`paths.ts:34-46`). The status file is written non-atomically there, so an
> event can still deliver a half-written file. §4.3 is what makes that
> harmless for the field that matters; `parseStatusFile` already tolerates a
> truncated tail (`engines.ts:47-65`). Asking the dependency for an atomic
> write-then-rename is worth an upstream issue, but the fleet must not depend
> on getting it.

---

### 4.7 Dependency problems and scope failures carry a kind, not a wording

**Today** `cli.ts:134` and `:174` regex `/uncommitted/i` over the fleet's own
English; `trace.ts:27-31` prefix-matches `verify.ts`'s English.

**Mechanism.**
(a) `DependencyReport.problems` becomes
`{ kind: 'missing' | 'not-executable' | 'not-a-repo' | 'unreadable' | 'dirty' | 'stale-rules'; message: string }[]`.
`problemsWith` (`dependency.ts:395-422`) already knows the kind at each push
site. `doctor` filters on `kind !== 'dirty'`; the digest renders `message`.
(b) `VerifyReport` gains `scope: { forbidden: string[]; strayed: string[] }`
— `verifyMechanical` already has both arrays at `verify.ts:311`. `trace.ts`
reads the field.

**Removes.** Both regexes and `SCOPE_REASON_PREFIXES` plus its comment
(~12 lines), and the "pinned by a test so a wording change is caught" coupling
in `trace.test.ts`.

**Invariant.** No decision in the fleet is made by matching text the fleet
itself wrote for a human to read.

**Fails closed by.** An unrecognised `kind` fails `tsc --noEmit` (the same
`Record<Union, T>` technique `digest.ts:46-52` already uses for
`REJECTION_SPECIFICITY`), so a new problem kind cannot default to "warning".

**Test that proves it.** Add a new problem kind in a fixture and assert the
build fails rather than the problem silently becoming a warning; and assert
`buildGateTrace` renders `scope=fail(...)` for a report whose reasons array has
been reworded.

---

### 4.8 `llamenos-fleet watch` — the event loop

**Today** `OnCalendar=*-*-* *:00,30:00` (`llamenos-fleet-tick.timer:13`) plus
a full backlog rescan (`tick.ts:458-472`).

**Mechanism.** A new `watch` subcommand and a `llamenos-fleet-watch.service`
(`Restart=always`, same `EnvironmentFile` and `WorkingDirectory` as the tick
unit). It:

1. reads `GET /repos/{owner}/{repo}/events?per_page=100` with
   `If-None-Match: <stored etag>`, sleeping `X-Poll-Interval` seconds between
   reads (60 on this repo, measured);
2. keeps a cursor at `~/.llamenos-fleet/events-cursor.json`:
   `{ etag, newestCreatedAt, seenIds: string[] }` — a **bounded** ring of the
   last N ids, **not** an id high-water mark (see §3);
3. maps event types to intent — `IssuesEvent` (labeled/opened) → a selection
   pass; `PullRequestEvent` / `CheckSuiteEvent` on a fleet branch → an
   integrate/post-merge evaluation; anything else → ignored;
4. calls the existing `tick()` (or `runIntegrate()`) with its lock, halt
   checks and breakers **completely unchanged**;
5. runs a **fallback tick every 15 minutes** regardless of events, so a dropped
   event, a stale ETag, or an offline window self-heals;
6. keeps the existing `tick` timer installed but lengthens it, or removes it —
   see the issue's acceptance criteria; running both is safe because
   `lock.ts`'s O_EXCL pidfile already makes a second pass exit quietly.

The digest timer is untouched.

**Removes.** The 30-minute wall-clock coupling. It does **not** yet remove the
full backlog scan — step 4 still calls `tick()` as-is. Narrowing the scan to
the event's own item is a **later, separate** change and is deliberately not
proposed here: the scan is correct today, merely wasteful, and "the events
cursor decides which issues get looked at" is precisely the kind of thing that
must earn its complexity after the cursor has run for a while.

**Invariant.** The fleet reacts to a change within ~60 s; no change is
processed twice (idempotent by event id); no event is lost permanently (the
15-minute fallback re-derives everything from GitHub anyway).

**Fails closed by.** Every failure path degrades to the current behaviour: an
unreadable events endpoint → no wake → the fallback tick still runs; a
corrupt cursor file → treated as empty → the next read replays a page, which
is harmless because every handler is idempotent and `tick()` is already
idempotent over a board it re-reads. A crashed watcher → `Restart=always`, and
the tick timer (if kept) is the backstop.

**Test that proves it.** A real ordering/idempotency test over a recorded
event page, with **no mock of the cursor under test**: feed the same page
twice and assert exactly one dispatch; feed a page containing the measured
`IssuesEvent` id `14943956576` **after** the larger `PushEvent` id
`20993830745` and assert the issue event is still processed (the test that
fails against an id-watermark implementation); feed a page out of order and
assert the resulting dispatch set is identical to the in-order one.

---

### 4.9 `integrate` and post-merge revert-on-red: wire them or delete them

**Today** `integrate` has a handler (`cli.ts:1091`) and no timer, no event, no
caller. `evaluatePostMerge` / `revertMerge` (`roles/integrator.ts:169-233`)
have no caller outside `tests/orchestrator/integrator.test.ts`.

**Mechanism (needs-decision).** Either:

- **(A) wire them to events** — `PullRequestEvent`/`CheckSuiteEvent` on a
  fleet branch triggers `runIntegrate()`; a `CheckSuiteEvent` with
  `conclusion: failure` on `main` triggers `evaluatePostMerge` for the merge
  commit the ledger recorded. `mergeStateStatus === 'UNKNOWN'` must be
  re-read, never treated as clean (inventory #10); or
- **(B) delete them** — with the spec's §5.4 Integrator row amended to say the
  fleet does not watch `main`, and the operator watches CI as they do today.

**Prefer (B) unless the operator wants (A).** An untriggered capability is
worse than an absent one: it reads as coverage in the spec, in the tests, and
in the file map, while doing nothing. If (A) is chosen, the revert path already
halts the fleet (`integrator.ts:189`), which is the right direction.

**Invariant (either way).** Every capability in `orchestrator/` is reachable
from a documented trigger, or it is not in `orchestrator/`.

**Test that proves it.** (A): an event-to-handler routing test asserting a
`check_suite` failure on `main` reaches `evaluatePostMerge` with the ledger's
merge SHA, and that an `UNKNOWN` merge state is re-read rather than skipped.
(B): the guard test in §4.10, extended to assert no orphan exported role
function — i.e. every exported function under `orchestrator/src/roles/` is
imported by something outside `tests/`.

---

### 4.10 The fleet never re-runs a check — make that permanent

**Today** there is no re-run capability at all (`grep -i 'rerun\|workflow run'`
over `orchestrator/src` finds nothing). The risk is that one gets added later
as an obvious convenience when a flaky job blocks a fleet PR.

**Mechanism.** A guard test in `tests/orchestrator/guards.test.ts`, in the
existing style of "the fleet never bypasses a PR's checks"
(`guards.test.ts:105-230`): no file under `orchestrator/src` may contain
`rerun`, `run rerun`, `workflow run`, or `--failed` in a `gh` argv. Same
vacuity guard as its neighbours (assert there are sources to scan).

**If the operator ever wants re-runs**, the policy is written down here so it
is not re-litigated: a check may be re-run **at most once per head SHA**, only
for a job named in a repo-tracked `.github/ci/flaky.json` whose entry carries
an open issue link, and the re-run must be recorded in the ledger with the SHA.
Any other re-run — a second attempt on the same SHA, an unlisted job, an
entry with no issue — is forbidden. That is a bigger change than the guard and
should not be built until a real flake forces it.

**Removes.** No code. Adds ~10 lines of test.

**Invariant.** A red check stays red until the commit changes.

**Fails closed by.** Construction — there is nothing to fail.

**Test that proves it.** The guard itself, plus a self-test that it fires:
write a temp file containing `gh(['run', 'rerun', id])` into the scanned tree
and assert the guard fails. (Audit the gate by breaking it, not by reading it.)

---

### 4.11 Small, adjacent

- **`lastTickResult` (inventory #9).** Stop using `fleet.log` as an event
  store. Append each pass's `TickResult` as a typed row to a
  `~/.llamenos-fleet/passes.jsonl`, read the tail. Removes the reverse-scan
  and the "any JSON line with a `ran` key" ambiguity, and lets the digest
  aggregate *every* pass since the last digest instead of only the last one.
  Same JSONL reasoning as `ledger.ts:49-50`.
- **Salvage branch names (inventory #18).** `salvage/<branch>-<runId>` instead
  of `Date.now()`, and record the salvage branch on the ledger row. The run id
  is already unique per dispatch (`tick.ts:149-153`).

---

## 5. What NOT to change

These are already deterministic, or the deterministic alternative is worse.
Listed so they are not re-opened.

| Thing | Why it stays |
|---|---|
| GitHub as the merge gate — required `fleet/verify` / `fleet/review` on one head SHA, CODEOWNERS, auto-merge armed once at `tick.ts:296-300` | This is the correct design. Nothing here moves a merge decision back in-process |
| The gate reading, never executing, the commit it judges (`ci.ts:11-51`, the `git archive` export, `headDirRefusal`) | Load-bearing and already asserted |
| `undefined ≠ []` throughout (`gh.ts:28-40`, `source.ts:20-25`, `tick.ts:460-465`) | The fleet's single most important convention |
| Outcome facts derived on read, never labelled (`ledger.ts:5-25`, `status.ts:1-11`) | Already fixed; this addendum extends the same rule to `pr` (§4.3) and `sha` (§4.4) |
| The one remaining label write, `needs-human` (`worktree.ts:150-160`) | A **control input**, not a cached outcome. Correct |
| The GitHub kill switch failing open, the file switch failing closed (`killswitch.ts:14-28`) | Deliberate asymmetry, guarded by a test |
| Polling the halt label between every dispatch (`tick.ts:501`) | A control input a human must be able to trip from a phone. An event cursor could carry it, but the poll costs one call per dispatch and cannot go quiet the way a subscription can. Keep the poll even after §4.8 |
| `OnCalendar` rather than `OnBootSec`/`OnUnitActiveSec` in both timers | The comments (`llamenos-fleet-tick.timer:6-12`) record a real, twice-observed failure. Any new unit must use `OnCalendar` too |
| The digest timer at 07:00 / 18:00 | A digest is inherently periodic. There is no event for "it is morning" |
| `readAll()` parsing the whole ledger per call (`ledger.ts:61-63`) | Correct and cheap at this size. An index would be a cache that can drift — exactly what this fleet forbids |
| The Planner's LLM judgement, its Jaccard dedupe, and its greedy JSON extraction (`planner.ts:101-170`) | Proposing work is genuinely a judgement task. The determinism that matters is already there and is structural: `buildIssueCreateArgs` attaches `needs-human` unconditionally with no parameter that can suppress it, so every proposal is inert to every lane until a human acts. Tightening the JSON contract is optional polish, not risk reduction |
| `DEAD_REFERENCE_PATTERN` over fenced blocks (`dependency.ts:429`) | A heuristic over a file in a repo this one does not own and cannot pin. A stricter parser would couple to prose this repo cannot control |
| The bounded review loop at `MAX_REVIEW_ROUNDS = 2` (`review.ts:584`) | Already a hard bound, not a judgement |
| `if: github.event_name == 'pull_request'` on both fleet jobs (`ci.yml:1409`, `:1499`) | Correct today, and the reasoning at `ci.yml:1393-1400` is right. One note: a skipped job satisfies a required check, so if a **merge queue** (`merge_group`) is ever enabled, both jobs would skip and the gate would fail open. Not an issue today; a line in the ruleset notes |

---

## 6. Ordering

By risk removed ÷ lines added, highest first:

1. §4.1 vitest JSON result — removes a fail-open in a required check; net deletion
2. §4.2 `parseVerdict` last-line exact match — removes a diff-influenced verdict in the other required check; ~4 lines
3. §4.3 derive the PR from GitHub — deletes 36 lines and an entire unverified-SUCCESS class
4. §4.4 `verifiedSha` as a field — removes a truncation-dependent fact
5. §4.5 stable total order in selection — 4 lines, makes every run replayable
6. §4.7 structured problem kinds and scope results — deletes two prose regexes
7. §4.10 the no-rerun guard — 10 lines of test, permanent
8. §4.6 inotify on the status directory — removes the 5-second poll
9. §4.11 pass records and salvage names — small, adjacent
10. §4.8 `llamenos-fleet watch` — the largest change and the one that needs a decision first
11. §4.9 wire or delete `integrate` / revert-on-red — a decision, then a small change either way
