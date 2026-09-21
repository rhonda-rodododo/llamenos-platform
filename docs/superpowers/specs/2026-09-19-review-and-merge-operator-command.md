# Fleet addendum — `review-and-merge`: an operator command that reviews and merges locally

Status: **Addendum to** `docs/superpowers/specs/2026-09-11-llamenos-fleet-orchestrator-design.md`
Date: 2026-09-19
Refs: #812
Scope: `orchestrator/src/review-and-merge.ts`, `orchestrator/src/cli.ts`,
`orchestrator/src/review.ts` (new exports only), `tests/orchestrator/`,
`.claude/skills/fleet-review-and-merge/`.

---

## 1. Why this exists

`fleet/review` has run as a GitHub Actions job (`.github/workflows/fleet-review.yml`) since
#812 first split it out of `ci.yml`. That design is correct in policy — GitHub computes the
verdict on its own runners, against the PR's exact head commit, and the ruleset requires it
— but expensive in practice: nearly every PR against this job's own bootstrap, base-ref
availability, skipped-vs-absent semantics, label wiring, engine smoke test, or provider
quota has been a pure-plumbing fix with no product value of its own (see this file's own
git history, and `fleet-review.yml`'s header comment, which documents three separate
fail-open bugs found and fixed in that plumbing before this addendum).

A coding-agent session run from an operator's own terminal reviews better than a metered
API call boxed into a CI job's turn/timeout budget, has no bootstrap-ordering problem to
get wrong, and uses the operator's own `claude` login rather than a provisioned, quota'd
service key. `review-and-merge` moves the review there — but keeps GitHub as the enforcer,
so nothing about the ruleset, the required-checks list, or the "no self-approval" invariant
changes. A stray `gh pr merge` from anywhere else, or a bug in this command's own merge
step, still cannot skip a red check: the command re-derives the same GitHub-side readiness
state a naive `gh pr merge` would be refused against, and refuses first, with a reason.

## 2. Shape

One new subcommand, `llamenos-fleet review-and-merge <pr>`:

1. **Freshness.** `GET repos/{R}/commits/{sha}/check-runs?check_name=fleet/review` against
   the PR's *current* head SHA — never a time window, never the PR number, exactly the same
   key discipline `review-cache.ts`'s artifact cache already uses for the CI path. A prior
   `success` skips the engine; anything else (missing, `failure`, `neutral`, in-progress) is
   treated identically to "no verdict yet" and re-reviewed.
2. **Review.** `git archive <head> | tar -x` into a fresh, `.git`-less temp directory,
   control files stripped, then a non-author `claude --print --model opus` session
   (read-only: `--permission-mode plan`, an empty project root, `--add-dir` onto the export
   only) against the diff and changed-file list. Reuses `review.ts`'s `buildReviewPrompt`,
   `exportReviewSnapshot`, `invokeVerifierEngine` and `toSecondOpinion` directly — newly
   exported from that file for this purpose, not reimplemented. `opus` is deliberately a
   different tier from `cli.ts`'s `DEFAULT_MODEL` (`'sonnet'`, what a dispatched worker
   authors with): reviewing with the same tier that wrote the diff reintroduces the
   same-model blind-spot problem `VERIFIER_BRIEF` already warns against.
3. **Record.** `POST repos/{R}/check-runs` with `name: fleet/review`, the PR's head SHA, and
   a conclusion of `success` (PASS) or `failure` (FAIL or UNREADABLE) — the same check-run
   *name* the Actions job posts as its own job result, so the ruleset's required context is
   satisfied identically either way.
4. **Merge.** `gh pr checks <pr> --required --json name,state,bucket` re-reads the PR's
   required checks (which now includes the check-run just posted); merges
   (`--squash --delete-branch`) only if the head has not moved since step 1/2, `fleet/review`
   itself is `pass`, and every other required check is also `pass`. A bot-authored PR always
   stops here instead of merging — `CODEOWNERS` forbids self-approval, and this command
   never approves on the operator's behalf.

`.github/workflows/fleet-review.yml` is **not** deleted by this change — removing the only
reviewer this repo has, even briefly, is worse than the plumbing cost above. It stays until
this command is proven on real PRs; removing it is an explicit follow-up.

## 3. What did NOT change

- **No new write capability outside this one file.** `postReviewCheckRun` in
  `review-and-merge.ts` is the only code path in `orchestrator/src` that calls the Checks
  API's create endpoint — asserted by a rail in `guards.test.ts` ("creates a check-run from
  exactly one file"). Nothing else gained `checks:write`-shaped behavior.
- **`tick.ts`'s autonomous loop still never merges anything.** The existing
  `enableAutoMerge`/`disableAutoMerge` pair (arm/un-arm) is untouched. The new, real
  `gh pr merge --squash --delete-branch` call is confined to `review-and-merge.ts` and is
  reached only by a human running this command by name against a named PR — never by the
  scheduled `tick` pass. `guards.test.ts`'s merge-shape rail now recognizes three legitimate
  shapes (arm, un-arm, squash-from-review-and-merge-only) instead of two, and still fails
  closed on any fourth.
- **No mechanical re-verification.** This command does not run `verifyMechanical` (scope,
  never-write, diff-targeted tests) — that is `fleet/verify`'s job, already required
  independently, and re-running it here would be a second, driftable copy of a decision
  GitHub's required-checks list already makes. The `VerifyReport`-shaped object fed to
  `buildReviewPrompt` exists only to carry `classifyImpact`'s impact classification into the
  prompt, with `passed: true` unconditionally — it is never used as a merge gate itself.

## 4. Test coverage (`tests/orchestrator/review-and-merge.test.ts`)

Freshness hit (no engine call) and miss (engine called, check posted); a prior FAIL never
reused as fresh; UNREADABLE and FAIL both post a failing check-run and refuse to merge; the
export snapshot is always cleaned up, including when the reviewer throws; head-moved and
other-required-check-red both refuse with a stated reason; a bot-authored PR stops short of
merging; running the command twice against an already-merged head performs no second review
or merge. Two mutation-style assertions pin the exact predicates a regression would most
plausibly weaken: `hasSuccessfulReview` must not treat a non-`success` conclusion as fresh,
and `evaluateMergeReadiness` must refuse when `fleet/review` is simply absent from the
required-checks list (not just when it is present but failing).
