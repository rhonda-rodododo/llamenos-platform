# Epic 98: Download Experience

**Status**: In Progress
**Created**: 2026-02-26
**Depends on**: Epic 95 (Deployment Architecture), Epic 97 (Desktop Release Pipeline)

## Goal

Update the Astro marketing site with a polished download page that detects the visitor's OS, offers the correct installer, and provides verification instructions — making it easy for non-technical volunteers to install the app.

## Scope

- `/download` page on the Astro marketing site with OS detection (Linux/macOS/Windows)
- Platform-specific download buttons linking to latest GitHub Release assets
- Fallback: manual platform selector for all available builds
- Checksum display and copy-to-clipboard for each artifact
- Verification instructions (inline accordion or linked guide)
- System requirements section (OS versions, disk space, permissions)
- Auto-update explanation (what happens after first install)
- Mobile placeholder messaging ("Mobile app coming soon — desktop only for now")
- Updated homepage hero CTA pointing to `/download`
- Screenshots on the download page from `site/public/screenshots/`

## Files Created/Modified

- `site/src/pages/download.astro`
- `site/src/components/DownloadButton.astro` (OS-aware component)
- `site/src/components/VerifyChecksums.astro`
- `site/src/pages/index.astro` (update CTA)
- `site/src/layouts/Layout.astro` (nav link if needed)

## Dependencies

- Epic 97 complete (GitHub Releases with artifacts and checksums exist)
- Marketing site deployed on Cloudflare Pages (`bun run deploy:site`)
