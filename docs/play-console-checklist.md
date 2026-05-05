# Google Play Console Submission Checklist

## Status as of 2026-05-04

### Completed

- [x] **Screenshots** — 7 phone screenshots (1233×2673 PNG) copied to `apps/android/fastlane/metadata/android/en-US/phoneScreenshots/`
- [x] **Store listing text** — title, short description (79 chars), full description (3508 chars) in `apps/android/fastlane/metadata/android/en-US/`
- [x] **App icon** — 512×512 PNG at `apps/android/fastlane/metadata/android/en-US/icon.png` (generated from `site/public/favicon.svg`)
- [x] **Upload keystore** — PKCS12 RSA-4096, 10000-day validity, generated at `apps/android/upload-keystore.jks` (gitignored)
- [x] **Release AAB** — signed AAB built at `/tmp/llamenos-android-build/app/outputs/bundle/release/app-release.aab` (~91 MB, `jar verified`)
- [x] **Fastlane config** — `Fastfile` + `Appfile` with `metadata`, `internal`, and `promote_to_production` lanes
- [x] **`.gitignore`** — covers `keystore.properties`, `*.jks`, `google-play-key.json`

### Pending — Manual Play Console Steps

- [ ] **Feature graphic** (1024×500 PNG) — Required for production track. Design task; not strictly required for internal test track.
- [ ] **Data safety form** — Play Console → App content → Data safety. Fill in data collection/sharing practices.
- [ ] **Content rating** — Play Console → App content → Content rating. Complete the IARC questionnaire.
- [ ] **Target audience** — Play Console → App content → Target audience and content. Not for children.
- [ ] **App access** — Play Console → App content → App access. Describe how reviewers can access restricted content.

### Pending — Service Account Setup (for Fastlane CI upload)

1. Go to **Google Play Console → Setup → API access**
2. Link (or create) a Google Cloud project
3. Create a service account → download JSON key
4. In Play Console → **Users and permissions** → Invite the service account with **Release manager** role
5. Save the JSON key as `apps/android/google-play-key.json` (gitignored) or set `GOOGLE_PLAY_JSON_KEY` env var
6. Base64-encode the key and store as `PLAY_SERVICE_ACCOUNT` GitHub Secret for CI:
   ```bash
   base64 -w0 google-play-key.json
   ```
7. Run metadata upload:
   ```bash
   cd apps/android && bundle exec fastlane metadata
   ```
8. Run full internal track upload (AAB + metadata + screenshots):
   ```bash
   cd apps/android && bundle exec fastlane internal
   ```

### Pending — Play App Signing

Google Play manages the final app signing key after you opt in to **Play App Signing**:
- Upload the AAB signed with the upload key (`upload-keystore.jks`)
- Play Console re-signs it with the Play-managed key before distributing to users
- Store the upload keystore password securely (e.g., a password manager or KMS)

### Credentials Reference

| Credential | Location | Notes |
|------------|----------|-------|
| Upload keystore | `apps/android/upload-keystore.jks` | Gitignored — back up securely |
| Keystore password | `apps/android/keystore.properties` | Gitignored — never commit |
| Google Play service account | `apps/android/google-play-key.json` | Gitignored — set `GOOGLE_PLAY_JSON_KEY` |
| GitHub CI secret | `PLAY_SERVICE_ACCOUNT` | Base64-encoded service account JSON |

### Screenshot Manifest

| File | Source | Screen |
|------|--------|--------|
| `01_dashboard.png` | `dashboard-android.png` | Main dashboard |
| `02_calls.png` | `call-history-android.png` | Call history |
| `03_notes.png` | `note-detail-android.png` | Note detail (E2EE) |
| `04_cases.png` | `cases-android.png` | Case management |
| `05_shifts.png` | `shifts-android.png` | Shift scheduling |
| `06_admin.png` | `admin-android.png` | Admin panel |
| `07_settings.png` | `settings-android.png` | Settings |
