# First release — readiness triage (desktop, Android, iOS)

Date: 2026-09-24 · Tracker: #769 · Base: `origin/main` b66832856 · Iteration 1 of a few.

Scope ruling (supervisor, 2026-09-24): **one milestone, "First release", covering desktop, Android and iOS.** The `lane:desktop|android|ios` labels are the platform axis. Bar: nothing that weakens crypto, leaks data, or bypasses a gate ships, whatever the audience.

## Headlines

1. **The iOS release job is a false green.** Run 35531746557 reported `Build (iOS)` = success while its own log says `** ARCHIVE FAILED **` (*"requires a provisioning profile with the Push Notifications feature"*) and `archive not found`. Archive and export both end in `| xcpretty || true`; `upload-artifact` only warns on no files; signing and TestFlight steps were skipped for missing secrets. Nothing was built. The claim "iOS build already succeeds in CI" is wrong.
2. **iOS needs 7 secrets, not 3**, and none exist. The build is signed with a certificate and provisioning profile delivered as CI secrets (`macos-latest` is GitHub-hosted; it never sees the local keychain).
3. **The Apple account is active and most material already exists** (read-only `ssh mac`): `Apple Distribution: Richard Schulte (KN6NH935ZU)`, an App Store profile (`aps-environment=production`, expires 2027-05-02), and an App Store Connect key file. The profile's internal `Name` is `org.llamenos.hotline AppStore`, but `ExportOptions.plist` and the Fastfile reference `match AppStore org.llamenos.hotline` (its *filename*), so export would fail on the name even with correct secrets.
4. **Android push depends on infrastructure nobody has enabled.** Push is self-hosted ntfy/UnifiedPush (no FCM — correct for the threat model, do not reintroduce it). The relay is off by default everywhere (`llamenos_ntfy_enabled: false`, compose profile `push`), the app never registers with a distributor (#955), and the backend accepts endpoints on any host (a default ntfy install would route wake-signal metadata through ntfy.sh). Filed #959, #960.
5. **The Play upload would have silently skipped**: workflow read `PLAY_SERVICE_ACCOUNT_JSON`, the repo secret is `PLAY_SERVICE_ACCOUNT`. Fixed in PR #958.
6. **`v<version>` releases are immutable**, so mobile-release's post-publish upload to `v<version>` cannot work; desktop assets go to `desktop-v<version>` (PR #957). Follow-up for mobile is with the supervisor.

## Milestone structure

- Milestone #1 **renamed** "Internal Availability" → **"First release"** (keeps its 25 closed issues and history; a new milestone would orphan them). Description rewritten to the scope-only meaning.
- Milestones #2 "iOS Internal Beta" and #3 "Post-Beta Backlog" were created by concurrent stray triage runs. Their open issues were migrated: blocking work → #1; everything else has **no milestone** (a "backlog" milestone never closes and is a second scope axis). Both now hold zero open issues. **Recommendation:** close them (do not delete — history); operator's call.
- Only blocking work sits in the milestone, so its progress bar means "can we ship".

## Closed by an earlier pass, re-verified here (all 13 hold)

| # | Evidence checked on `origin/main` |
|---|---|
| 648 | `.github/ci/tsc-tests-baseline.json` = `{}`; `bunx tsc --noEmit -p tsconfig.tests.json` exits 0 (run here). 6c5c6659f, c055a82ab, 0aa6c3284 |
| 688 | `tests/steps/cases` has no control-flow `isVisible()` (only comments); 08044dd6b, 18e13282f, 552ede042 |
| 693 | `apps/android/Gemfile` + `Gemfile.lock` tracked; Fastfile has `metadata`/`internal`/`promote_to_production`; eca1fa5e4 (#613) |
| 694 | `CaseDetailSteps.waitForDetailLoaded()` waits for `case-status-pill` or `case-detail-error` only; ab019f9b6 |
| 695 | `test-specs:validate --platform android` = 443/567 (78.1%) PASS (run here); 07cd882a5. **Residual:** threshold still 76 (AC said ratchet to 78) |
| 697 | `AuthLoginBDDTests.swift` present; iOS threshold is 5 (≥ 4); 2361a0abb |
| 699 | no `ui-tooling` alias or reference remains; 3ad572bcf |
| 713 | four runners online/idle with required labels (checked now); a 2026-09-21 publish job was picked up in 3 s |
| 750 | `WhatsAppChannelConfigView.swift`, `TelegramChannelConfigView.swift` exist, wired in `ChannelConfigListView.swift:52,56` |
| 753 | iOS `ShiftsViewModel.clockIn()` → `POST /api/shifts/clock-in`; `clock-in-button` in `ShiftsView` |
| 759 | no `firebase`/`google-services` dependency or plugin; Android uses UnifiedPush (`PushService.kt`). The real gap is #955 |
| 760 | `DemoBanner` rendered at `ui/MainScreen.kt:185`; d8a0ca7b8. **Residual:** `DemoBannerConfigResponse` is hand-declared, not from protocol types |
| 763 | `ShiftsViewModel.clockIn/clockOut` (`:114,:136`) + `DashboardViewModel` |

## Needs verification / left open on purpose

- **#646** — libcrux advisories are fixed via #852/#830. Pinned in `Cargo.lock`:

  | Crate | Version |
  |-------|---------|
  | `libcrux-secrets` | 0.0.6 |
  | `libcrux-sha3` | 0.0.10 |

  Desktop `quick-xml` + unmaintained crates remain and `cargo deny check advisories` is still `continue-on-error` (`security-audit.yml:452,456`).
- **#649** — hono cleared (#922); 42 allowlist entries remain (vite et al., dev-tooling).
- **#655 / #707** — premise is obsolete for the deployed path: compose and CI build `deploy/docker/Dockerfile` (`oven/bun`, target `app`); `Dockerfile.nodejs` is referenced by no workflow or compose file (orphan). What remains real: AVX2 on the host (#706) and no CI job that starts the production image and probes health (`ci.yml:478,1013` only `|| echo ::warning::`).
- **#751 / #761** — "no out-of-band verification when linking devices on mobile" is overstated: both mobiles derive and display a 6-digit SAS (`CryptoService.swift:401`, `CryptoService.kt:786`, `DeviceLinkScreen.kt`). The open question is parity with the newer emoji `derive_sas`; verify what desktop shows before treating as a security gap.
- **#774** — `HUMAN_QUEUE_LABELS` digest section exists (#841, `orchestrator/src/digest-issue.ts`); the AC's `WorkSource` form is not confirmed.
- **#820 / #647** — superseded by #702: `bun run lint` on clean main = **53 errors, all under `apps/worker/`**; src/client, packages, tests, orchestrator are at zero. The lefthook hook lints *staged files only*, so it blocks commits that stage an erroring worker file, not "every commit".
- Not examined in depth: fleet-lane issues #640, #802–#812, #818, #845, #898, #948 (orchestrator internals; not release work).

## Scope per platform

### (a) BLOCKING

**All platforms / backend**
- #953 `RELEASE_BOT_TOKEN` unset — `knope-release-pr.yml` fails on every push to main (latest run failed 2026-09-24T03:13Z); `release` is 44 commits behind with a stale "prepare release 0.19.16". No release can be cut. *Operator.*
- #954 provision the staging (= demo) backend; #706 host CPU flags (AVX2). *Operator.* Host must be a `*.llamenos.org` name with a Let's Encrypt cert (#726 — mobile pins hard-fail; no code change needed if this holds).
- #723 simulation/dev surface unreachable under `ENVIRONMENT=demo` → no way to exercise a call end to end. *Decision.*
- #731 `serverEventKeyHex` — a single global relay key returned from `/auth/me` to every authenticated user (`routes/auth.ts:176`, still live): cross-hub leak. Interim permission gate is blocking; per-hub envelope is the follow-up.
- #735 tester onboarding guide (must cover ntfy distributor, SmartScreen click-through, macOS status, TestFlight invite).
- #956 `verify-release-live` — the only end-to-end proof; keep the TestFlight surface required, exclude only the updater-manifest surface.

**Desktop** — PR #957 (signed installers to `desktop-v<ver>`, in flight) and #741 for macOS only: with no Developer ID cert the `.dmg` is withheld, so macOS testers get nothing. The Mac has *Apple Distribution*/*Development* identities only; a **Developer ID Application** certificate is needed. Operator decides: ship Linux+Windows first, or hold macOS. Windows SmartScreen is an accepted known issue if documented.

**Android** — #757 (PR #958 in flight), #758 (secrets exist; verify the JSON and the Play internal track), #955 (no `UnifiedPush.register…` call site anywhere on main — the app cannot be rung), #959 (relay off by default; new), #960 (endpoint allow-list; new).

**iOS** — #743 (make the job able to fail), #744 (one signing path; profile-name mismatch), #745 (rewritten: 7 secrets), #746 (no test-only banner at all — a data-safety control), #747 (no Notification Service Extension; pushes are contentless and render nothing), #748 (decision; recommend defer CallKit, stop sending `.voip` pushes, document limitation).

### (b) IMPORTANT, NOT BLOCKING (known issues)
Desktop updater channel #714 #715 #719 (no auto-update; fixes need manual reinstall — accept knowingly); desktop bugs #789 (event link 404) #797 (contact Cases tab) #896; #787 (net.rs security tests not run in CI — recommend soon); #734 (download page: remove the placeholder GPG fingerprint before it is public); #766 (invite deep link — tester onboarding path decision; manual handout is the interim); #725 seeded data; #728 (use Twilio/SignalWire for the beta); #837 (no ingestion endpoint for pin-mismatch reports; pinning itself still hard-fails); iOS #749 #751 #752 #684; Android #761 #762 #764 #765; #649 #646 #791 #655 #707 #702.

### (c) LATER
#727 (pin rotation channel), #679, #709, #736, #737, #878, #930, #820/#647 (superseded), fleet items, #773 (ruleset has `required_approving_review_count: 0`, so it does not gate merging today).

## Filed
- #959 ntfy relay off by default in every deploy path (Android testers cannot be rung).
- #960 backend accepts UnifiedPush endpoints on any host (metadata leak via ntfy.sh default).
Already tracked, not re-filed: #953 (release token/branch), #719 (five secrets + `llamenos-releases`, which does not exist — 404), lint (#702).

## Operator checklist (one list)

| Item | Issue |
|---|---|
| `RELEASE_BOT_TOKEN` (fine-grained PAT, Contents+PRs write) | #953 |
| Staging host on `*.llamenos.org`, `lscpu` AVX2 output, `DEMO_INVENTORY_YML`, `DEMO_VARS_YML_ENCRYPTED`, `ANSIBLE_VAULT_PASSWORD`, `DEMO_SSH_PRIVATE_KEY`, `STAGING_BASE_URL` | #954, #706 |
| iOS: `IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, `APPLE_TEAM_ID` (=KN6NH935ZU), `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`; ASC app record + Internal Testing group; APNs `.p8` for the backend | #745 |
| Play: verify service-account JSON + Internal testing track | #758 |
| macOS: Developer ID Application cert + notarization credentials (or descope macOS) | #741 |
| Updater channel (known issue for now): `RELEASES_REPO_PAT`, `RUSTFS_*` ×4, create `llamenos-releases` | #719 |

## Not done in this iteration
No device tests (no Android/iOS device; push wake path unverified beyond code search). Fleet-lane issues not examined. `#957`/`#958` not reviewed. Whether the ntfy Android app defaults to ntfy.sh is from its documented behaviour, not re-tested. `.github/workflows/` untouched by design.
