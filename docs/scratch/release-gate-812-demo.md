# Scratch demo — #812 release-commit gate fix

Throwaway PR to empirically demonstrate that a commit whose message starts
with `chore(release):` still yields `ci-status`, `gitleaks`, `fleet/verify`
(and, once the `review` label is applied, `fleet/review`) as reporting
status contexts on a `pull_request` event, after the guard fix in
`.github/workflows/ci.yml` / `.github/workflows/ios-e2e.yml`.

This file and this branch are never merged — delete after capturing
evidence for PR #867.
