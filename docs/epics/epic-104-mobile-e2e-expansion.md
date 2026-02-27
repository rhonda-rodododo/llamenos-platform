# Epic 104: Mobile E2E Test Expansion

**Status: PENDING** (depends on Epic 103)
**Repo**: llamenos-mobile

## Summary

Increase Detox E2E coverage from ~30% to ~70%, covering all critical paths.

## New Test Files

1. `e2e/conversations.test.ts` — conversation list, open thread, send message, encryption indicator
2. `e2e/settings.test.ts` — profile settings, theme toggle, language switch, lock/logout
3. `e2e/admin-settings.test.ts` — all 5 admin settings sections (create/edit/delete)
4. `e2e/admin-volunteers.test.ts` — volunteer list, add, delete, invite flow
5. `e2e/navigation.test.ts` — tab switching, admin access, deep links
6. `e2e/error-states.test.ts` — network failure, auth expiry, invalid PIN

## Existing Test Improvements

- `e2e/auth.test.ts` — add PIN mismatch retry, nsec import, logout/re-login
- `e2e/dashboard.test.ts` — add call answering mock, break toggle
- `e2e/notes.test.ts` — add note detail view, encrypted content display

## CI Fixes

- Add `brew tap wix/brew && brew install applesimutils` (currently missing)
- Cache CocoaPods (ios/Pods/)
- Add `-camera-back none` to emulator options
