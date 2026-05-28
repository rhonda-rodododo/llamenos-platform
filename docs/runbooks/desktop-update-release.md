# Desktop Update Release Operations

## Purpose

How desktop updates are published to the update server, and how to manually re-upload if needed.

## Automated Flow (CI)

When a GitHub Release is published, `tauri-release.yml` automatically:

1. Builds desktop artifacts for macOS (universal), Windows (x64), Linux (x86_64)
2. Signs artifacts with Ed25519 (`TAURI_SIGNING_PRIVATE_KEY`)
3. Generates `latest.json` manifest via `scripts/generate-update-manifest.ts`
4. Uploads artifacts + manifest to RustFS S3 bucket via AWS CLI
5. Desktop clients poll `https://updates.llamenos.org/desktop/latest.json` for new versions
6. Tauri updater verifies Ed25519 signature before applying

## Manifest Format

```json
{
  "version": "1.2.3",
  "notes": "Release notes here",
  "pub_date": "2026-05-27T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<ed25519_sig>",
      "url": "https://releases.llamenos.org/desktop/llamenos_1.2.3_aarch64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "<ed25519_sig>",
      "url": "https://releases.llamenos.org/desktop/llamenos_1.2.3_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "<ed25519_sig>",
      "url": "https://releases.llamenos.org/desktop/llamenos_1.2.3_x64-setup.nsis.zip"
    }
  }
}
```

## Manual Re-upload

If CI fails or you need to manually publish:

### 1. Build artifacts locally

```bash
bun run tauri:build
```

### 2. Generate manifest

```bash
TAURI_SIGNING_PRIVATE_KEY="<key>" bun run scripts/generate-update-manifest.ts dist/artifacts
```

### 3. Upload to server

```bash
rsync -avz dist/artifacts/ deploy@<1984_VPS_IP>:/opt/llamenos/services/update-server/artifacts/desktop/
```

### 4. Verify

```bash
curl https://updates.llamenos.org/desktop/latest.json | jq .version
# Should show the new version
```

## Anti-Rollback

The Tauri updater in `src/client/lib/updater.ts` enforces a version floor — clients reject updates with a version lower than their current version. This prevents downgrade attacks even if `latest.json` is tampered with (signature verification would also catch this).
