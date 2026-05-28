# Android Release Procedures

## Purpose

How Android builds are published to the Play Console internal testing track (automated) and promoted to production (manual).

## Internal Track (Automated)

When a GitHub Release is published, `mobile-release.yml` automatically:

1. Builds a signed AAB with Gradle
2. Uploads to Play Console internal testing track via Fastlane
3. Internal testers receive the update automatically

### Required GitHub Secrets (android-release environment)

| Secret | Description |
|---|---|
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play service account JSON key |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release keystore |
| `KEYSTORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Signing key alias |
| `KEY_PASSWORD` | Signing key password |

### Manual internal release

If CI fails or you need to push manually:

```bash
cd apps/android

# Build signed AAB
./gradlew bundleRelease

# Upload via Fastlane
SUPPLY_JSON_KEY=/path/to/play-key.json bundle exec fastlane android internal
```

## Production Promote (Manual — Local Only)

Production promotion is intentionally manual. Signing keys never leave the operator's machine.

### Steps

#### 1. Verify internal track is stable

Check Play Console > Internal testing > Review the build. Confirm:
- No crash spikes in the internal track
- All internal testers have verified the build

#### 2. Promote to production

```bash
cd apps/android
SUPPLY_JSON_KEY=/path/to/play-key.json bundle exec fastlane android promote_to_production
```

#### 3. Verify in Play Console

- Check Play Console > Production > Release dashboard
- Confirm the correct version is rolling out
- Monitor crash-free rate for 24h

## Version Management

- `versionName` is managed by knope (e.g., `1.2.3`)
- `versionCode` in CI is overridden by `github.run_number` for monotonic Play Store compliance
- Never manually edit version values — use `bun run version:bump <major|minor|patch>`

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Upload rejected by Play Store | versionCode not monotonic | Check `github.run_number` — ensure it's higher than last upload |
| Signing error | Wrong keystore | Verify `ANDROID_KEYSTORE_BASE64` matches the upload key registered with Play Console |
| Fastlane auth failure | Expired service account | Regenerate key in Google Cloud Console, update secret |
