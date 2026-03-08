# Epic 289: Desktop Auto-Update (Tauri Updater)

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 288
**Blocks**: None
**Branch**: `desktop`

## Summary

Wire the already-configured Tauri updater plugin to a functional update server. Support both GitHub Releases (default for open-source deployments) and self-hosted manifest URLs (for air-gapped or operator-controlled deployments). Add background update checks, user-facing update prompts with release notes, and an Ansible-configurable update URL.

## Problem Statement

The Tauri updater plugin is configured in `apps/desktop/Cargo.toml` (feature-gated behind `updater`) and `tauri.conf.json` (endpoint pointing to GitHub Releases `latest.json`), but the update flow is incomplete:

1. The `pubkey` in `tauri.conf.json` is a placeholder (`REPLACE_WITH_PUBKEY_FROM_TAURI_SIGNER_GENERATE`) — no real Ed25519 key pair exists for signing updates.
2. The CI workflow (`tauri-release.yml`) builds release artifacts and enables `createUpdaterArtifacts: true`, but does not generate or upload the `latest.json` manifest.
3. The tray menu "Check for Updates" item emits a `check-for-updates` event to the frontend, but no frontend handler exists.
4. There is no periodic background check — volunteers on long shifts would never learn about updates.
5. Self-hosted operators have no way to point the updater at their own infrastructure.

For a crisis hotline app, unattended desktops running stale versions is a security and reliability risk. Volunteers must be notified of updates without disrupting active calls.

## Implementation

### 1. Generate Signing Key Pair

Use `tauri signer generate` to create an Ed25519 key pair. The private key is stored as a GitHub Actions secret (`TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). The public key is committed to `tauri.conf.json`.

```bash
bunx tauri signer generate -w ~/.tauri/llamenos.key
# Outputs public key to stdout — paste into tauri.conf.json
# Private key saved to ~/.tauri/llamenos.key — store as GitHub secret
```

**File: `apps/desktop/tauri.conf.json`** — Replace placeholder:

```json
"updater": {
  "pubkey": "<ACTUAL_ED25519_PUBLIC_KEY>",
  "endpoints": [
    "https://github.com/rhonda-rodododo/llamenos/releases/latest/download/latest.json",
    "{{LLAMENOS_UPDATE_URL}}"
  ]
}
```

The `{{LLAMENOS_UPDATE_URL}}` placeholder is replaced at build time via environment variable injection. If not set, only the GitHub endpoint is used. Tauri tries endpoints in order and uses the first successful one.

### 2. CI: Generate `latest.json` Manifest

The `tauri-release.yml` workflow already has `createUpdaterArtifacts: true` in `tauri.conf.json`, which makes `tauri build` produce `.sig` files and a `latest.json` per platform. The CI job needs to:

1. Merge per-platform manifests into a single `latest.json` with all platform entries.
2. Upload `latest.json` as a GitHub Release asset alongside the binaries.

**File: `.github/workflows/tauri-release.yml`** — Add a merge step after all platform builds:

```yaml
  merge-manifests:
    needs: build
    runs-on: ubuntu-latest
    name: Merge Update Manifests
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts/

      - name: Merge latest.json
        run: |
          node -e "
          const fs = require('fs');
          const glob = require('glob');
          const manifests = glob.sync('artifacts/**/latest.json');
          const merged = { version: '', notes: '', pub_date: '', platforms: {} };
          for (const f of manifests) {
            const m = JSON.parse(fs.readFileSync(f, 'utf8'));
            merged.version = m.version;
            merged.notes = m.notes || '';
            merged.pub_date = m.pub_date || new Date().toISOString();
            Object.assign(merged.platforms, m.platforms || {});
          }
          fs.writeFileSync('latest.json', JSON.stringify(merged, null, 2));
          console.log('Merged manifest:', JSON.stringify(merged, null, 2));
          "

      - name: Upload latest.json to release
        uses: softprops/action-gh-release@v2
        with:
          files: latest.json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 3. CI: Sign Artifacts

Ensure the signing key is available to the Tauri build step:

```yaml
      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

### 4. Frontend: Update Check Handler

**File: `src/client/lib/updater.ts`** — Handles update checking and user notification:

```typescript
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface UpdateInfo {
  version: string
  body: string | null  // Release notes (markdown)
  date: string | null
}

/**
 * Check for updates. Returns update info if available, null if up-to-date.
 * Does NOT auto-install — caller decides when to prompt user.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const update = await check()
    if (!update) return null
    return {
      version: update.version,
      body: update.body,
      date: update.date,
    }
  } catch (err) {
    console.warn('[updater] Check failed:', err)
    return null
  }
}

/**
 * Download and install the pending update, then relaunch.
 * Shows progress via the onProgress callback.
 */
export async function installUpdate(
  onProgress?: (downloaded: number, total: number | null) => void
): Promise<void> {
  const update = await check()
  if (!update) throw new Error('No update available')

  let downloaded = 0
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      onProgress?.(0, event.data.contentLength ?? null)
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
      onProgress?.(downloaded, null)
    } else if (event.event === 'Finished') {
      onProgress?.(downloaded, downloaded)
    }
  })

  await relaunch()
}
```

### 5. Frontend: Background Check Interval

**File: `src/client/lib/updater.ts`** — Add periodic check:

```typescript
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours
let checkTimer: ReturnType<typeof setInterval> | null = null

export function startPeriodicUpdateCheck(
  onUpdateAvailable: (info: UpdateInfo) => void
) {
  stopPeriodicUpdateCheck()

  // Check immediately on startup (with a 30s delay to let the app fully load)
  setTimeout(async () => {
    const info = await checkForUpdate()
    if (info) onUpdateAvailable(info)
  }, 30_000)

  // Then check every 6 hours
  checkTimer = setInterval(async () => {
    const info = await checkForUpdate()
    if (info) onUpdateAvailable(info)
  }, CHECK_INTERVAL_MS)
}

export function stopPeriodicUpdateCheck() {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
```

### 6. Frontend: Update Available Dialog

**File: `src/client/components/update-dialog.tsx`**:

```tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { UpdateInfo } from '@/lib/updater'
import { installUpdate } from '@/lib/updater'

interface UpdateDialogProps {
  update: UpdateInfo | null
  onDismiss: () => void
}

export function UpdateDialog({ update, onDismiss }: UpdateDialogProps) {
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<{ downloaded: number; total: number | null } | null>(null)

  if (!update) return null

  const handleInstall = async () => {
    setInstalling(true)
    await installUpdate((downloaded, total) => setProgress({ downloaded, total }))
    // relaunch happens inside installUpdate — this line is unreachable
  }

  return (
    <Dialog open={!!update} onOpenChange={(open) => { if (!open && !installing) onDismiss() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Available — v{update.version}</DialogTitle>
        </DialogHeader>
        {update.body && (
          <div className="max-h-48 overflow-y-auto text-sm text-muted-foreground whitespace-pre-wrap">
            {update.body}
          </div>
        )}
        {installing && progress && (
          <Progress value={progress.total ? (progress.downloaded / progress.total) * 100 : undefined} />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onDismiss} disabled={installing}>Later</Button>
          <Button onClick={handleInstall} disabled={installing}>
            {installing ? 'Installing...' : 'Install Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### 7. Frontend: Wire into Root Layout

**File: `src/client/routes/__root.tsx`** — Add update check lifecycle:

```tsx
import { startPeriodicUpdateCheck, stopPeriodicUpdateCheck } from '@/lib/updater'
import { UpdateDialog } from '@/components/update-dialog'

// In the root component:
const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null)

useEffect(() => {
  // Only check in Tauri builds (not in Playwright test builds)
  if (window.__TAURI_INTERNALS__) {
    startPeriodicUpdateCheck(setPendingUpdate)
    return () => stopPeriodicUpdateCheck()
  }
}, [])

// Also listen for tray menu "Check for Updates" event
useEffect(() => {
  if (!window.__TAURI_INTERNALS__) return
  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen('check-for-updates', async () => {
    const { checkForUpdate } = await import('@/lib/updater')
    const info = await checkForUpdate()
    if (info) setPendingUpdate(info)
    else {
      // Show "You're up to date" toast
    }
  })
  return () => { unlisten() }
}, [])

// In the JSX:
<UpdateDialog update={pendingUpdate} onDismiss={() => setPendingUpdate(null)} />
```

### 8. Self-Hosted Update Server

For operators who self-host (via Ansible/Docker), the update manifest can be served by Caddy alongside the app.

**File: `deploy/ansible/vars.example.yml`** — Add update URL variable:

```yaml
# ─── Desktop Auto-Updates ────────────────────────────────────────
# URL where the desktop app checks for updates.
# Default: GitHub Releases (public). Set to your own URL for air-gapped deployments.
# The URL must serve a latest.json file in Tauri updater format.
llamenos_update_url: "https://github.com/rhonda-rodododo/llamenos/releases/latest/download/latest.json"
```

**File: `deploy/ansible/templates/caddy.j2`** — Add update manifest route:

```
{{ domain }} {
    # ... existing routes ...

    # Desktop update manifest (self-hosted)
    handle /updates/* {
        root * /opt/llamenos/updates
        file_server
    }
}
```

Operators download release artifacts from GitHub and place them in `/opt/llamenos/updates/latest.json`. The Ansible role can automate this with a cron job or webhook.

### 9. Flatpak Exclusion

The updater feature is already gated behind `#[cfg(feature = "updater")]` in `lib.rs`. Flatpak builds should disable this feature since Flatpak has its own update mechanism (Flathub).

**File: `flatpak/org.llamenos.Hotline.yml`** — Ensure build args exclude updater:

```yaml
build-options:
  env:
    CARGO_FEATURE_ARGS: "--no-default-features --features custom-protocol"
```

### 10. Tauri IPC Mock for Tests

**File: `tests/mocks/tauri-core.ts`** — Add mock for `@tauri-apps/plugin-updater`:

```typescript
// Mock the updater plugin for Playwright tests
export const mockUpdater = {
  check: async () => null, // No updates in test mode
}
```

**File: `tests/mocks/tauri-updater.ts`** — Separate mock module:

```typescript
export async function check() {
  return null // No updates available in test environment
}
```

## Files to Modify

| File | Change |
|------|--------|
| `apps/desktop/tauri.conf.json` | Replace placeholder pubkey, add self-hosted endpoint |
| `.github/workflows/tauri-release.yml` | Add manifest merge job, signing secrets, latest.json upload |
| `src/client/lib/updater.ts` | **New** — Update check, install, periodic check logic |
| `src/client/components/update-dialog.tsx` | **New** — Update available dialog component |
| `src/client/routes/__root.tsx` | Wire update check lifecycle and tray menu handler |
| `tests/mocks/tauri-updater.ts` | **New** — Mock updater for Playwright tests |
| `tests/mocks/tauri-core.ts` | Register updater mock |
| `deploy/ansible/vars.example.yml` | Add `llamenos_update_url` variable |
| `deploy/ansible/templates/caddy.j2` | Add `/updates/*` route for self-hosted manifests |
| `deploy/ansible/templates/env.j2` | Pass `LLAMENOS_UPDATE_URL` to build environment |
| `flatpak/org.llamenos.Hotline.yml` | Verify updater feature is excluded |
| `vite.config.ts` | Add alias for `@tauri-apps/plugin-updater` → mock in test builds |

## Testing

### Desktop (Playwright)

- **Mock update available**: Configure mock updater to return an update — verify dialog appears with version and release notes.
- **Install flow**: Mock download progress events — verify progress bar renders.
- **Dismiss flow**: Click "Later" — verify dialog closes, update check resumes on next interval.
- **Tray menu trigger**: Emit `check-for-updates` event — verify check runs and "up to date" toast appears when no update.
- **No update available**: Mock returns null — verify no dialog or notification.

### CI (Integration)

- **Manifest merge**: Create sample per-platform manifests — verify merged `latest.json` has all platform entries.
- **Signature verification**: Build a test binary, sign with test key, verify `latest.json` signatures match.

### Manual

- **End-to-end**: Tag a new release, let CI build — verify the updater finds and installs it on a running desktop instance.
- **Self-hosted**: Place `latest.json` on a local Caddy server — verify the updater fetches from the custom URL.

## Acceptance Criteria

- [ ] `tauri.conf.json` has a real Ed25519 public key (not placeholder)
- [ ] CI generates and uploads `latest.json` to GitHub Releases with all platform entries
- [ ] CI signs all update artifacts with the Ed25519 private key
- [ ] App checks for updates on launch (after 30s delay) and every 6 hours
- [ ] Update dialog shows version number, release notes, and Install Now / Later buttons
- [ ] Install Now downloads, installs, and relaunches the app
- [ ] "Check for Updates" tray menu item triggers an immediate check
- [ ] Self-hosted operators can set `llamenos_update_url` to point at their own manifest
- [ ] Flatpak builds exclude the updater feature
- [ ] Playwright tests mock the updater (no real network calls)
- [ ] Update check does not interrupt active calls or disrupt UI state

## Risk Assessment

- **Key management**: The Ed25519 private key is a high-value secret. If compromised, an attacker could push malicious updates to all desktop users. Mitigation: store as a GitHub Actions encrypted secret, rotate annually, and document the rotation process.
- **Network dependency**: If GitHub is unreachable, update checks fail silently. The app continues to function — this is acceptable.
- **Self-hosted lag**: Operators using self-hosted update URLs must manually update their `latest.json`. If they forget, volunteers stay on old versions. Documentation and optional automation (Ansible cron) mitigate this.
- **Relaunch during active use**: The "Install Now" button relaunches the app, which would terminate active calls. The dialog should warn about this. "Later" is the safe default.
