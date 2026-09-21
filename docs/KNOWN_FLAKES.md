# Known E2E Flakes

A short, factual registry of intermittent desktop E2E failures: what the symptom
looks like, the root cause once found, and current status. The goal is that the
*next* occurrence is recognized by `grep`-ing this file in seconds, instead of
being re-diagnosed from scratch (or worse, misattributed to whatever feature
spec happened to be running when it surfaced).

## How to use this file

- **Before filing a new flake investigation**, grep this file for the failing
  testid, step name, or file. If it matches an existing entry, you have your
  root cause (or at least your starting point) already.
- **When you fix a flake**, add or update its entry here in the *same PR* as the
  fix — not as a follow-up. An entry that never gets written is why the same bug
  gets re-diagnosed twice.
- **Statuses**: `RESOLVED` (root cause fixed, landed), `MITIGATED` (root cause
  understood, exposure reduced, not fully eliminated), `OPEN` (symptom known,
  cause not yet found).
- Keep entries short and factual — a registry nobody can be bothered to update
  is worse than no registry.

## Entries

### `login-pin-race` — PIN entry fails/times out at login, misattributed to whatever spec ran first

- **Symptom**: A feature spec (observed: `core/reports.feature.spec.js`,
  `core/schema-browser.feature.spec.js`) fails before reaching any of its own
  assertions, with a stack trace bottoming out in `enterPin`
  (`tests/helpers.ts`). CI evidence (fleet PR #934, `e2e (2)` shard, 3
  consecutive runs): 4, then 2, then 3 failures, always in the same two files,
  always at login. The affected specs looked "singled out" only because they
  happen to run first in that shard — an ambient login flake lands on whichever
  spec is unlucky enough to log in next. `main` was green and the same files
  passed 5/5 locally, i.e. genuinely intermittent, not a code regression.
- **Root cause** (two compounding issues, both fixed together):
  1. `enterPin`'s own React race: `PinInput` is a controlled input;
     `handleKeyDown`'s `value.length >= minLength` check reads the `value` prop
     captured in its closure at render time. If `Enter` is pressed before React
     re-renders with the final keystroke, the closure sees a stale (too-short)
     value and silently skips `onComplete` — no error, no visible symptom.
  2. Under CI load (shared box, multiple shards/workers contending for CPU), the
     PIN screen itself can take longer than the previous hardcoded 10s to
     render after `page.goto`/`page.reload` — a plain page-load timing issue,
     not the React race, but indistinguishable from it without a named error.
  3. Compounding factor: `enterPin` had **30 call sites across 17 files**, each
     an independent chance for either race to fire, and `loginAsAdmin()`
     additionally had a second, slower, differently-shaped login path (cold
     PBKDF2 import via `ADMIN_SEED`) that only real staleness would ever
     exercise — untested in practice, and itself a source of divergent timing.
- **Fix** (this file's PR):
  1. `enterPin` now waits on the PIN input's visibility with `Timeouts.AUTH`
     (was a hardcoded 10s) and wraps both its visibility wait and its
     post-typing `toHaveValue` check in named errors (`[enterPin] login: ...`)
     that say which login step failed, instead of a bare Playwright timeout
     that gets attributed to the feature spec that happened to call it.
  2. `loginAsAdmin()` no longer has the legacy PBKDF2 fallback path — it always
     restores from the `tests/storage/admin.json` cache (written once by the
     "bootstrap" Playwright project, a hard `dependencies` of every project
     that logs in as admin) and fails loudly with an actionable message if that
     cache is missing, rather than silently taking a slower, divergent path.
  3. `tests/fixtures/auth.ts`'s per-role session-reuse fixtures (previously
     dead code — built, but never actually imported anywhere) were fixed
     (removed dead code referencing a `/api/auth/token/refresh` endpoint that
     doesn't exist in the backend) and wired up as the standard Playwright
     session-reuse pattern; see `tests/session-reuse.spec.ts` for a test whose
     body never calls `enterPin()` yet runs fully authenticated.
  4. Call sites that genuinely test PIN/login behavior itself (wrong-PIN
     attempts, lockout, challenge dialogs, bootstrap onboarding, re-auth after
     reload) intentionally still drive the real PIN UI — see the PR body for
     the full list and why each one stays.
- **Status**: MITIGATED. The React race and the CI-load timing gap are both
  addressed, and the flake surface (call sites, divergent code paths) is
  reduced. Not marked RESOLVED because an intermittent failure needs sustained
  clean CI runs, not one green run, to confirm — see the PR body for the local
  repeat-run counts gathered before/after.

### `reports-close-btn-visibility` — intermittent close-button-visibility assertion in reports.feature

- **Symptom**: discovered while gathering the 10-consecutive-run evidence for
  `login-pin-race` above (`core/reports.feature.spec.js`, sequential single-worker
  runs against a real backend). 2 of 10 runs failed, each with exactly one
  failure, in two different scenarios: "Close button is not visible on waiting
  report" (run 3) and "Close button is not visible on already closed report"
  (run 8). Both assert a close button's *absence* based on report status. Not a
  login failure — both runs authenticated fine and failed deep in their own
  scenario body.
- **Root cause**: not yet investigated — out of scope for the PR that found it
  (login-pin-race). Worth checking first: whether the assertion is a
  non-waiting `isVisible()`/`.not.toBeVisible()` snapshot racing a status-driven
  re-render (the same shape as `#678` below and `#669`/`#670`), since status
  changes after report creation are exactly the kind of async re-render that
  bug shape catches.
- **Status**: OPEN.

### `case-tab-click-race` — tab-click step misses the panel that hasn't mounted yet (#678)

- **Symptom**: `'I click the {string} tab'` step intermittently failed to find
  `case-tab-<key>` / `contact-tab-<key>` under full-shard contention, despite
  passing reliably in isolation.
- **Root cause**: the step guarded its click with `isVisible({ timeout })`
  probes. `Locator.isVisible()` does not poll — it samples the DOM once and
  returns immediately, ignoring the `timeout` option entirely (same root cause
  as #669/#670). Under load, the sample could land before `RecordDetail` /
  `ContactProfile` finished mounting, see nothing, and fall through to a
  text/role-based fallback selector with no matching guarantee either.
- **Fix**: wait once for whichever of the two mutually-exclusive panel headers
  (`case-detail-header` / `contact-profile-header`) mounted, using a real
  waiting `expect()`, then assert-and-click that panel's own tab testid. No
  timeout widened; no non-waiting probe guarding a click; no text/role selector
  left in the step.
- **Status**: RESOLVED — `515fcefc8`, "fix(e2e): stop the tab-click step from
  racing panel mount (#678)".
