# Contributing to Llamenos

## Development Setup

### Clone all three repos

```bash
# All repos must be siblings in the same parent directory
git clone git@github.com:rhonda-rodododo/llamenos.git
git clone git@github.com:rhonda-rodododo/llamenos-core.git
git clone git@github.com:rhonda-rodododo/llamenos-mobile.git
```

### Prerequisites

**Desktop (llamenos)**:
- Rust 1.85+, Bun, platform-specific WebKit deps
- Run: `cd llamenos && ./scripts/dev-setup.sh`

**Crypto core (llamenos-core)**:
- Rust 1.85+, optional: cargo-ndk (Android), wasm-pack (WASM)
- Run: `cd llamenos-core && ./scripts/dev-setup.sh`

**Mobile (llamenos-mobile)**:
- Bun, JDK 17, Android SDK/NDK, Xcode (macOS)
- Run: `cd llamenos-mobile && ./scripts/dev-setup.sh`

## Coding Standards

### TypeScript

- Strict mode, no `any` unless absolutely necessary
- Use `@shared/*` imports for cross-boundary types
- All user-facing strings must use i18next (`t()`)

### Rust

- `cargo clippy --all-features -- -D warnings` must pass
- All sensitive data uses `Zeroize` trait
- New crypto operations must add a domain separation label to `labels.rs`

### React Native

- NativeWind for styling (Tailwind classes)
- `testID` props on all interactive elements
- Never import crypto directly — use `crypto-provider.ts`

## Adding a New Crypto Operation

1. **Add label** to `llamenos-core/src/labels.rs` AND `llamenos/src/shared/crypto-labels.ts` AND `llamenos-mobile/src/lib/crypto-labels.ts`
2. **Implement in Rust** in the appropriate module (`ecies.rs`, `encryption.rs`, etc.)
3. **Add FFI wrapper** in `llamenos-core/src/ffi.rs` if needed for mobile
4. **Add tests** in the Rust module
5. **Update interop tests** in `llamenos-core/tests/interop.rs`
6. **Update platform.ts** in `llamenos/src/client/lib/platform.ts` (desktop IPC)
7. **Update crypto.ts** in `llamenos-mobile/src/lib/crypto.ts` (mobile JS fallback)
8. Run `cargo test` in llamenos-core, `bun run test` in llamenos

## Adding a New API Endpoint

1. **Add handler** in `llamenos/src/worker/api/`
2. **Add route** in the appropriate Durable Object's `DORouter`
3. **Add types** in `llamenos/src/shared/types.ts`
4. **Add client method** in `llamenos/src/client/lib/api.ts`
5. **Add mobile client method** in `llamenos-mobile/src/lib/api-client.ts`
6. **Add E2E tests** in `llamenos/tests/` (Playwright)

## Adding E2E Tests

### Desktop (Playwright)

```bash
bun run test:ui                          # Interactive UI mode
bun run test -- --grep "my test"         # Run specific test
```

- Use `data-testid` selectors (never `getByRole` for fragile matches)
- Create unique resources per test (use `Date.now()` in names)
- Use helpers from `tests/helpers.ts`

### Mobile (Detox)

```bash
bun run e2e:build:ios && bun run e2e:test:ios
bun run e2e:build:android && bun run e2e:test:android
```

- Use `testID` props for element selection
- Tests run serially (max 1 worker)
- 120s timeout per test

## Cutting a Release

1. Ensure all tests pass in all three repos
2. Bump version: `cd llamenos && bun run version:bump patch "description"`
3. Push: `git push && git push --tags`
4. CI builds desktop installers and publishes to GitHub Releases
5. For mobile: tag the mobile repo and CI produces APK + iOS sim build

## License

AGPL-3.0-or-later. All contributions must be compatible with this license.
