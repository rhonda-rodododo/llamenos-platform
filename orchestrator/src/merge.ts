import { gh, ghJson } from './gh.js'
import type { VerifyReport } from './verify.js'
import type { SecondOpinionResult } from './review.js'

type ReviewVerdict = SecondOpinionResult['verdict']

/**
 * The highest-stakes pure function in the fleet: it is the only thing that
 * decides whether an autonomous worker's code lands on `main` unattended, on
 * a codebase whose entire threat model is protecting the identity of callers
 * and volunteers from a well-funded adversary.
 *
 * Every condition below is an AND. There is no path that merges on a
 * subset — each check returns its own `false` immediately, and only the
 * function's final line, reached when every single one has passed, returns
 * `merge: true`. Do not refactor this into a single boolean expression whose
 * failing clause can't be named: the `reason` on every refusal exists so a
 * human reading the ledger can tell which gate stopped a given PR, not just
 * that one did.
 *
 * `currentHeadSha` (fix-round finding W1) is the PR's head commit read
 * IMMEDIATELY before this decision — it is compared against
 * `report.verifiedCommit`, which `verifyMechanical` recorded when it
 * actually examined the tree. This is the defense that matters most in this
 * file: environment-variable stripping and a `.git`-less review snapshot
 * (see review.ts) remove the CONVENIENT ways a verifier with shell access
 * could tamper with what gets merged, but a model with a home directory can
 * still authenticate to its own accounts and push a modified branch by hand
 * if it chooses to. Refusing to merge anything but the exact commit that was
 * verified is what actually closes that path — a verifier that pushes to
 * the branch invalidates its own approval rather than laundering it through
 * this gate, and the same check catches the far more ordinary case of a
 * human pushing to the branch between verification and merge.
 */
export function mayAutoMerge(
  report: VerifyReport,
  ciGreen: boolean,
  reviewVerdict: ReviewVerdict,
  currentHeadSha: string,
): { merge: boolean; reason: string } {
  // 1. Mechanical verification (scope, never-write) must have passed outright.
  if (!report.passed) {
    return {
      merge: false,
      reason: `mechanical verification failed: ${report.reasons.join('; ') || 'unspecified'}`,
    }
  }

  // 2. Tests must have been PROVEN to pass — `undefined` (infrastructure
  //    failure, or nothing diff-targeted even ran) is not proof, and neither
  //    is an explicit `false`. An unproven diff is not a merge candidate no
  //    matter how green everything else looks.
  if (report.testsPassed !== true) {
    return {
      merge: false,
      reason: report.testsPassed === false
        ? 'diff-targeted tests failed'
        : 'tests could not be established (none ran for this diff, or the test ' +
          'runner\'s result could not be parsed) — refusing to merge on an unproven diff',
    }
  }

  // 3. High impact always goes to a human, even with everything else green.
  //    This is not a mechanical failure — verifyMechanical records impact,
  //    it never fails on it — but the merge gate is exactly where "recorded,
  //    not blocking" must stop being true.
  //
  //    This is also, deliberately, the ONLY guard against a crypto diff
  //    auto-merging: `packages/crypto/`, `packages/protocol/schemas/`,
  //    `crypto-labels.json`, and auth/session/sigchain code are all
  //    `HIGH_IMPACT_PATHS` (impact.ts), so `classifyImpact` marks them
  //    `impact: 'high'` before this function ever runs. The
  //    crypto-security-reviewer agent (review.ts `requiredAdditionalReviewers`)
  //    is requested on these diffs as an EXTRA, mandatory reviewer — but its
  //    verdict is advisory to a human, never a merge permission, and this
  //    function's signature has no parameter for it on purpose: there is no
  //    "cryptoVerdict" to check here, and there must never be one. A future
  //    change that added such a parameter and let an approving crypto
  //    verdict skip or weaken this branch would be exactly the quiet
  //    promotion of "advisory" into "merge permission" this comment exists
  //    to warn against. If the crypto reviewer approves, the diff still
  //    stops here, at a human, same as any other high-impact diff.
  if (report.impact !== 'low') {
    return {
      merge: false,
      reason: `high-impact diff requires human review: ${report.impactReasons.join('; ') || 'unspecified'}`,
    }
  }

  // 4. CI must be green. A worker's own local test run (step 2) is not a
  //    substitute for the project's actual CI — they can disagree, and CI
  //    is the system of record for what ships.
  if (!ciGreen) {
    return { merge: false, reason: 'CI is not green' }
  }

  // 5. The non-author second opinion must have explicitly passed.
  //    UNREADABLE is refused exactly like FAIL: an unreachable or
  //    incoherent reviewer is not a pass, and this is the one place a
  //    silent degradation to "no review at all" would actually cost
  //    something — so it is refused here even though verify.ts and
  //    review.ts already refuse to let it happen upstream.
  if (reviewVerdict !== 'PASS') {
    return {
      merge: false,
      reason: reviewVerdict === 'UNREADABLE'
        ? 'non-author review was unreadable — an unreachable or incoherent reviewer is not a pass'
        : 'non-author review did not pass',
    }
  }

  // 6. The branch must not have moved since it was verified. Comparing
  //    against a RECORD (`report.verifiedCommit`, set once by
  //    `verifyMechanical`) rather than re-deriving "what was verified" from
  //    anything observed here is the entire point — a check that re-read
  //    the branch's state at merge time and called that "verified" would
  //    trivially agree with itself and catch nothing.
  if (report.verifiedCommit !== currentHeadSha) {
    return {
      merge: false,
      reason: `branch moved after verification: verified ${report.verifiedCommit ?? '(unknown)'}, ` +
        `PR head is now ${currentHeadSha}`,
    }
  }

  return {
    merge: true,
    reason: 'mechanical verification passed, tests proven green, low impact, CI green, non-author review passed, ' +
      'and the branch has not moved since verification',
  }
}

interface PrCheck { bucket: string }

/**
 * Returns `undefined` on any failure to read CI state, and also when the PR
 * has NO checks configured at all — an empty check list is not evidence of
 * green, it is evidence that nothing looked. A read that fails must return
 * `undefined`, never a value that could be mistaken for "yes, verified
 * green."
 */
export async function ciStatusFor(pr: string): Promise<boolean | undefined> {
  const checks = await ghJson<PrCheck[]>(['pr', 'checks', pr, '--json', 'bucket'])
  if (checks === undefined || checks.length === 0) return undefined
  return checks.every((c) => c.bucket === 'pass')
}

/**
 * Squash merge, deliberately: `cli.ts revert <runId>` is a single `gh pr
 * close` plus branch deletion, which only stays a one-commit-to-undo
 * operation on `main` if the merge itself was ever exactly one commit.
 *
 * `--match-head-commit expectedHeadSha` (fix-round finding W1) makes GitHub
 * itself refuse the merge server-side if the branch has advanced past the
 * commit `mayAutoMerge` was told was verified — the same check `mayAutoMerge`
 * already made in-process, enforced again at the point of no return so a
 * race between that check and this call (however small the window) cannot
 * merge something unverified. Confirmed present via `gh pr merge --help`
 * against the installed `gh` (2.100.0: `--match-head-commit SHA   Commit
 * SHA that the pull request head must match to allow merge`); if a future
 * `gh` version ever drops it, this call would need to fall back to reading
 * the head SHA immediately beforehand and aborting on mismatch instead —
 * that fallback is NOT implemented here because the flag is confirmed
 * available in this fleet's pinned `gh` version.
 */
export async function mergePr(pr: string, expectedHeadSha: string): Promise<void> {
  await gh(['pr', 'merge', pr, '--squash', '--delete-branch', '--match-head-commit', expectedHeadSha])
}
