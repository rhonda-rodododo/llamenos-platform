# Control test — #812 (unmodified guard, no fix applied)

Throwaway PR built directly on unmodified `origin/main` (old, unscoped
`head_commit` guard still in place) to empirically confirm whether that
guard alone starves ci-status/gitleaks/fleet/verify on a normal
(non-GITHUB_TOKEN) `pull_request` event with a `chore(release):`-titled
head commit, before concluding it's the sole cause of PR #594's blocked
state.

Never merged; delete after capturing evidence for PR #867.
