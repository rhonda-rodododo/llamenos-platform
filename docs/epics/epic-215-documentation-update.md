# Epic 215: Documentation Update for Monorepo

## Goal

Update all project documentation (CLAUDE.md, MEMORY.md, README references) to accurately reflect the consolidated monorepo structure after Epics 200-214.

## Context

The project transitioned from a multi-repo setup (llamenos + llamenos-core + llamenos-mobile) to a single monorepo with:
- `apps/desktop/` (Tauri v2)
- `apps/worker/` (Cloudflare Workers)
- `apps/ios/` (SwiftUI native)
- `apps/android/` (Kotlin/Compose native)
- `packages/crypto/` (Rust crypto, formerly llamenos-core)
- `packages/shared/` (shared types)
- `packages/protocol/` (JSON Schema + codegen)
- `packages/i18n/` (locale files + mobile codegen)

CLAUDE.md still references the old multi-repo structure, external llamenos-core, and React Native mobile.

## Implementation

### 1. Update CLAUDE.md

- Update "Multi-Platform Architecture" table (remove 3-repo references, show monorepo)
- Update "Directory Structure" to include `apps/ios/`, `apps/android/`, `packages/*`
- Update "Tech Stack" to reflect native iOS (SwiftUI) and Android (Kotlin/Compose) instead of React Native
- Update "Development Commands" with mobile build/test commands
- Update "Key Technical Patterns" for mobile platform specifics
- Update path aliases section
- Remove references to `~/projects/llamenos-core` and `~/projects/llamenos-mobile`
- Update Gotchas section for mobile-specific issues

### 2. Update MEMORY.md

- Update "Multi-Platform Architecture" section
- Remove stale references to external repos

## Verification

1. CLAUDE.md accurately describes the monorepo directory structure
2. No references to external llamenos-core or llamenos-mobile repos
3. Dev commands section includes Android and iOS commands
4. New developer could understand the project from CLAUDE.md alone

## Dependencies

- Epics 200-210 (monorepo restructuring complete)
