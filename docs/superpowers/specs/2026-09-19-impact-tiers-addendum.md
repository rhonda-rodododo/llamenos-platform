# Fleet addendum — impact tiers: a PR's blast radius decides what it waits for

Status: **Addendum to** `docs/superpowers/specs/2026-09-11-llamenos-fleet-orchestrator-design.md`
Date: 2026-09-19
Refs: #812, #664
Scope: `orchestrator/src/impact.ts` (new exports only), `orchestrator/src/ci.ts`
(`decideReviewGate`), `orchestrator/src/cli.ts` (`review-gate`),
`.github/workflows/fleet-review.yml` (comments only — no step or trigger
change), `tests/orchestrator/`.

---

## 1. Why this exists

Operator rule, 2026-09-19, extending "a PR's changes shape which checks matter"
(`docs/superpowers/specs/2026-09-11-llamenos-fleet-orchestrator-design.md`, §5.5/§5.6, and
the `classifyImpact` `low`/`high` axis it already documents): the *ceremony* a PR waits on
should scale with its impact too, not just the depth of a review that already runs. A
documentation fix should not wait on a model review; an instruction change should not wait
on the mobile suites; crypto should wait on everything.

This is a NEW, independent axis from `classifyImpact`'s `low`/`high`. That function decides
how CAREFULLY a review reads a diff that is already going to be reviewed — more reviewer
turns, a longer timeout (`review.ts`'s `HIGH_IMPACT_MAX_TURNS`/`HIGH_IMPACT_TIMEOUT_MS`). It
never decided whether a review runs at all, and still doesn't; `classifyImpact` and
`HIGH_IMPACT_PATHS` are unchanged by this addendum. A **tier** decides whether a review runs
at all, and (eventually, per §4 below) which other suites a diff waits on.

## 2. The tiers (single source of truth: `orchestrator/src/impact.ts`)

- **Tier 0 — no executable content**: `docs/**`, `*.md` outside `.claude/`, spec prose.
  Waits on cheap repo checks only (lint/typecheck where applicable). No model review.
- **Tier 1 — instructions and tooling that shape future work**: `.claude/agents/**`,
  `.claude/skills/**`, `docs/superpowers/specs/**`, `lefthook.yml`, editor/lint config.
  Waits on cheap checks + code-owner review (these paths are, or should be, already
  code-owned — see §3's honest accounting of what is not yet true). No model review, no
  e2e/mobile suites.
- **Tier 2 — everything else, and always**: product code, `packages/crypto/**`, auth/
  session/sigchain, `packages/protocol/schemas/**`, `.github/workflows/**`,
  `orchestrator/**`, `tests/orchestrator/**`, dependency manifests. Waits on the full gate,
  including the non-author model review.

A diff spanning tiers takes the **highest** tier it touches — never an average, never
"mostly docs." `tierFor(changedFiles)` (impact.ts) is the one function that computes this;
every consumer calls it rather than re-deriving its own notion of "this diff doesn't need
X."

### Resolving the overlap with `HIGH_IMPACT_PATHS`

`HIGH_IMPACT_PATHS` (impact.ts, pre-existing) is reused as the Tier 2 "always" list rather
than re-curated — two lists of "which paths are sensitive" that could drift apart is exactly
the failure mode this project already argues against elsewhere (see `CRYPTO_REVIEW_PATHS` in
`review.ts`, itself derived from `HIGH_IMPACT_PATHS` rather than duplicated). Two of its
entries — `.claude/agents/` and `lefthook.yml` — are ALSO named as Tier 1 examples above,
because they were added to `HIGH_IMPACT_PATHS` for a different, still-valid reason (the
fleet's own trust base: a worker that edits its own agent definition or the write-deny hook
can widen its own authority) that predates this tier system.

`tierForFile` resolves this by checking `TIER1_PATHS` **before** `HIGH_IMPACT_PATHS`, so
those two paths classify Tier 1 for the new question ("does a model review run at all")
without editing `HIGH_IMPACT_PATHS` or its still-valid `low`/`high` axis — a diff under
`.claude/agents/` still reads `high` from `classifyImpact` (more reviewer turns, if a review
were requested); it simply never reaches a reviewer at all, because Tier 1 never requests
one. No other `HIGH_IMPACT_PATHS`/`SECRET_PATH_PATTERNS` entry overlaps a `TIER1_PATHS`
prefix today — pinned in `tests/orchestrator/impact.test.ts` by hardcoded `it.each` examples
(not a live-list iteration, so deleting an entry from `HIGH_IMPACT_PATHS` is still caught,
per the rail in §5 below).

## 3. What is honest, not yet true

`.claude/skills/` and `docs/superpowers/specs/` (two of the four Tier 1 examples in the
operator rule) and the lint/editor config paths (`.editorconfig`, `eslint.config.*`, etc.)
are **not yet** listed in `CODEOWNERS`, unlike `.claude/agents/` and `lefthook.yml`. Tier 1's
own definition promises "code-owner review" for every path in it — that promise is only
mechanically true for the two paths already owned.

`CODEOWNERS` is outside this change's owned paths (`orchestrator/`, `tests/orchestrator/`,
`.github/workflows/`, `docs/superpowers/specs/`), so adding the missing lines is a follow-up
for whoever owns that file, not done here — see the worker status notes for this PR. Until
then, a diff under `.claude/skills/` or `docs/superpowers/specs/` still correctly skips the
model review (the tier itself does not depend on `CODEOWNERS` coverage), but does not yet get
the human code-owner review its own tier definition describes.

## 4. Where this is wired in today, and where it composes with in-flight PRs

**Landed here:** `fleet/review`'s decision step (`decideReviewGate`, `ci.ts`, called from
`review-gate` in `cli.ts` and `fleet-review.yml`'s "Decide whether to run the review engine"
step) gains one new branch, ordered after the cached-PASS check and before the label check:

> diff is Tier 0 or Tier 1 → conclude success with reason `no reviewable content (tier N)`,
> no engine call.

The job still always runs and never skips — a skipped required check is satisfied silently,
which is the fail-open `fleet-review.yml`'s own header already documents removing (#844/#848).
This branch concludes success **explicitly**, with the tier and the contributing file list
printed to the step's own stdout (`runReviewGate`, `cli.ts`) — that stdout IS this check's
auditable output, the same convention `runVerifyCi`/`runReviewCi` already use for their own
verdicts.

**Composes with, not forked from** (both open PRs at the time this landed — verify their
state with `gh pr view` before assuming either description below is still current):

- **`review-and-merge` (#864, `ll-review-and-merge`)** adds a NEW operator command,
  `orchestrator/src/review-and-merge.ts`, that reviews and merges a PR from a local terminal
  session instead of CI, posting the verdict as the real `fleet/review` check-run. That file
  does not exist on the base this addendum was written against, so it could not be edited
  here. Once #864 merges, `runReviewAndMerge` should call `tierFor` the same way
  `decideReviewGate` does: for a Tier 0/1 diff, skip `runNonAuthorReview` entirely and call
  `postReviewCheckRun` directly with a synthetic PASS-shaped success (title/summary stating
  "no reviewable content (tier N)"), before ever exporting the head or invoking `claude`.
  This is a small, mechanical addition — `tierFor` is already exported for exactly this reuse
  — left as a named follow-up rather than guessed at against a file this change could not see.
- **Path-scoping (#862, `ll-fix-664-path-scope`)** adds `.github/scripts/detect-changed-
  platforms.sh`, a bash script that is the single source of truth for which CI job runs on
  which platform (ios/android/desktop/backend/crypto/ansible/orchestrator/audit), including
  its own independent `docs_only` detection. That script does not exist on the base this
  addendum was written against either. The two classifications are NOT identical in shape —
  platform detection answers "which platform does this touch," tiers answer "how much
  ceremony does this diff earn" — but their `docs_only`/Tier-0 boundaries describe
  overlapping intent and should not be allowed to drift. Unifying a bash script's
  classification onto this TypeScript function needs the script to shell out to `bun`
  (`bun orchestrator/src/cli.ts <some tier-reporting subcommand>` printing the changed-file
  classification as script-parseable output), which is a real change to that script's own
  contract and is out of scope here — named as a follow-up rather than done blind against a
  script this change could not see either.

## 5. Test coverage

`tests/orchestrator/impact.test.ts` (`describe('tierFor', ...)`): Tier 0 for docs/`*.md`,
Tier 1 for each `TIER1_PATHS` example, Tier 2 for ordinary product code, an empty diff is
Tier 0, a mixed diff resolves to its highest tier with reasons naming only the contributing
files, and the "never demoted" rail — hardcoded `it.each` examples (not a live-list
iteration) for `HIGH_IMPACT_PATHS` entries and every `SECRET_PATH_PATTERNS` pattern, so
deleting an entry from either list is caught rather than silently iterating over fewer cases.
A dedicated case pins the `.claude/agents/`/`lefthook.yml` overlap: `high` under
`classifyImpact`, Tier 1 under `tierFor`, on purpose.

`tests/orchestrator/guards.test.ts` (`decideReviewGate` rail, extended from three branches to
four): a docs-only diff concludes `low-tier` even when `requested: false` (the harder case,
proving tier is checked before the label); a Tier 1 diff concludes `low-tier`; a cache hit
still wins over an otherwise-low-tier diff (proving the documented order); a mixed diff with
even one Tier 2 file never concludes `low-tier`. Every pre-existing cache-hit/not-requested/
run-engine test is extended with an explicit Tier 2 `changedFiles` fixture so none of their
outcomes silently changed.
