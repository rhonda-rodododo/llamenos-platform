# Multi-stage Dockerfile for Llamenos (Bun self-hosted mode)
#
# Builds:
#   Stage 1: Install JS dependencies
#   Stage 2: Build Rust crypto library (.so) for bun:ffi
#   Stage 3 (`app`): Production image (API-only — desktop clients connect to this)
#   Stage 4-6 (`static`): Caddy image for docker-compose.production.yml's
#     `caddy` service (built SPA + custom rate-limiting Caddy binary)
#
# EVERY consumer of this file MUST pass an explicit stage (`--target` /
# compose `build.target` / build-push-action `target:`). Docker builds the
# LAST stage when none is given, and that is `static` (Caddy) — not `app`.
# Call sites: deploy/docker/docker-compose.yml (app), docker-compose.production.yml
# (caddy), .github/workflows/{docker,release,ci,security-audit}.yml.
#
# Bun runs TypeScript natively — no esbuild transpilation step needed.

# Stage 1: Install runtime deps
FROM oven/bun:1.4.0@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6 AS deps
# This runtime base is pinned independently of .mise.toml's `bun = "1.3.5"`.
# .mise.toml pins the *developer/CI tool* version (kept in sync with
# .github/workflows/ci.yml's bun-version input); this image is the
# *production container* base and tracks its own Dependabot-driven minor
# bumps on its own schedule. The two are allowed to diverge — Bun's runtime
# compatibility across 1.3.x/1.4.x minors is not the same contract as "CI
# uses the same tool version everywhere". Update via Dependabot or on a new
# minor release.
WORKDIR /app
COPY package.json bun.lockb ./
# Copy workspace package.json stubs so bun can resolve the workspace graph from the
# lockfile. Without these, --frozen-lockfile fails because the lockfile references
# workspace packages. Without the lockfile, some @aws-sdk versions freshly downloaded
# from npm carry workspace:^ refs for @smithy deps, which fail to resolve in a non-monorepo
# Docker context. Using --frozen-lockfile with these stubs avoids re-resolution entirely.
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/test-specs/package.json packages/test-specs/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY site/package.json site/package.json
RUN bun install --frozen-lockfile --production --ignore-scripts

# Stage 2: Build Rust crypto FFI (.so)
FROM rust:1-slim@sha256:cc0448b41c3b7b7fea44f5dc50eacba729a56db365b65b7bd5e8a82d5b3db078 AS rust-builder
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY packages/crypto/ packages/crypto/
RUN cargo build --release --manifest-path packages/crypto/Cargo.toml --features server \
    && mkdir -p packages/crypto/dist/server \
    && cp packages/crypto/target/release/libllamenos_core.so packages/crypto/dist/server/

# Stage 3: Production
FROM oven/bun:1.4.0-slim@sha256:e0ee68d16ccb9927bf02aa7dd8fd4bf3369ee6d46da04faa72b05ce8bfd135f6 AS app
# Pinned independently of .mise.toml's dev/CI `bun = "1.3.5"` — see the
# `deps` stage comment above for why the two are allowed to diverge. Update
# via Dependabot.

# Apply outstanding Debian security updates on top of the pinned base.
# The base digest above is the newest published for the `1.4.0-slim` tag, so a
# digest bump cannot pick these up: when Debian publishes a security update the
# upstream image lags it, and security-audit.yml's image-scan gate (fail on
# FIXABLE CRITICAL) goes red on a base the tag can't move off. Upgrading here
# rebases onto the current debian-security archive (this landed for perl-base
# 5.40.1-6 → 5.40.1-6+deb13u1: CVE-2026-13221, CVE-2026-42496, CVE-2026-8376).
# No new packages are installed — upgrade only, then the apt lists are dropped.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r llamenos && useradd -r -g llamenos -d /app -s /sbin/nologin llamenos

WORKDIR /app

# Copy runtime dependencies with correct ownership
COPY --chown=llamenos:llamenos package.json ./
COPY --chown=llamenos:llamenos --from=deps /app/node_modules/ node_modules/

# Copy source with correct ownership (Bun runs TS directly — no bundled output)
COPY --chown=llamenos:llamenos src/ src/
COPY --chown=llamenos:llamenos apps/worker/ apps/worker/
COPY --chown=llamenos:llamenos packages/shared/ packages/shared/
COPY --chown=llamenos:llamenos packages/i18n/ packages/i18n/
COPY --chown=llamenos:llamenos packages/protocol/ packages/protocol/
COPY --chown=llamenos:llamenos packages/crypto/package.json packages/crypto/package.json
COPY --chown=llamenos:llamenos packages/crypto/ffi.ts packages/crypto/ffi.ts
COPY --chown=llamenos:llamenos tsconfig.json ./

# Copy native crypto library from Rust build with correct ownership
COPY --chown=llamenos:llamenos --from=rust-builder /build/packages/crypto/dist/server/libllamenos_core.so packages/crypto/dist/server/

# Copy Drizzle SQL migrations + migration runner with correct ownership
COPY --chown=llamenos:llamenos drizzle/migrations/ drizzle/migrations/
COPY --chown=llamenos:llamenos scripts/run-migrations.ts scripts/run-migrations.ts

# Copy entrypoint (runs migrations then starts the app)
COPY --chown=llamenos:llamenos deploy/docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Serve a minimal download page for browsers hitting the root URL
COPY --chown=llamenos:llamenos deploy/docker/download-page/ public/

# Switch to non-root user
USER llamenos

# Environment defaults
ENV PLATFORM=bun \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD bun -e "fetch('http://localhost:3000/api/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD []

# ─────────────────────────────────────────────────────────────────────────
# Stages below build the `static` target consumed by
# docker-compose.production.yml's `caddy` service (Tier 4 split-origin
# Caddy: see deploy/docker/Caddyfile.production).

# Stage 4: Install full JS deps (incl. devDependencies) for the SPA build.
# Separate from the `deps` stage above, which installs --production only.
FROM oven/bun:1.4.0@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6 AS frontend-deps
WORKDIR /app
COPY package.json bun.lockb ./
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/test-specs/package.json packages/test-specs/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY site/package.json site/package.json
RUN bun install --frozen-lockfile --ignore-scripts

# Stage 5: Build the SPA (Vite) served at /srv/app by the `static` image.
# The client imports Zod schemas straight from packages/protocol/schemas
# (via the @protocol alias) — no protocol codegen step is required for
# this build, unlike the native (iOS/Android) clients.
FROM frontend-deps AS frontend-builder
COPY index.html vite.config.ts tsconfig.json ./
COPY public/ public/
COPY src/client/ src/client/
COPY packages/shared/ packages/shared/
COPY packages/i18n/ packages/i18n/
COPY packages/protocol/ packages/protocol/
ARG BUILD_VERSION=dev
ARG BUILD_COMMIT=local
ARG BUILD_TIME=
ENV GITHUB_SHA=${BUILD_COMMIT}
RUN bun run build

# Stage 6: Custom Caddy binary with the caddy-ratelimit plugin.
# Caddyfile.production's `rate_limit` directive (auth/register throttling —
# see CLAUDE.md's "Call spam mitigation" / network-level rate limiting
# requirement) is NOT part of stock Caddy; it ships only via this plugin,
# built with xcaddy. Without this stage Caddy refuses to start with
# "unrecognized directive: rate_limit".
# Digest bump (issue #650, 2026-09-20): refreshes the Alpine package layer
# (curl/c-ares/libcrypto3/libssl3 CVEs) under the same 2.11.4 tag — same Caddy
# version, no behavior change. See the `static` stage below for the matching bump.
FROM caddy:2.11.4-builder-alpine@sha256:2b9f32cbba6045e79212bb253f595588d20be8f7d1edf61582c519e124e0d2d8 AS caddy-builder
RUN xcaddy build --with github.com/mholt/caddy-ratelimit

# Stage 7 (`static`): Caddy image serving the built SPA. Matches the
# `caddy:2.11.4-alpine` base pinned in docker-compose.yml, with the custom
# rate-limiting binary swapped in and the SPA baked into /srv/app.
# Digest bump (issue #650, 2026-09-20): see caddy-builder stage above — same
# tag, refreshed Alpine layer. Trivy re-scan of this stage went from 23 fixable
# HIGH (curl/c-ares/libcrypto3/libssl3) to 0 on the OS layer; the xcaddy-built
# binary's own Go-module HIGH findings (golang.org/x/*, grpc) are unaffected by
# this bump — they come from the Caddy 2.11.4 release's resolved dependency set,
# not the Alpine base, and need a Caddy version bump to clear (follow-up, needs
# Caddyfile.production + caddy-ratelimit plugin compat validation first).
FROM caddy:2.11.4-alpine@sha256:de23def33b17fb5d1290b0f6c2add1d70780e52341896c00a4c8a2a2fe9d355e AS static
COPY --from=caddy-builder /usr/bin/caddy /usr/bin/caddy
COPY --from=frontend-builder /app/dist/client /srv/app
# NOTE: /srv/crypto (the Tier-4 sandboxed-crypto-iframe origin referenced by
# Caddyfile.production's {$CRYPTO_DOMAIN} block) is intentionally left
# empty. The crypto-sandbox/ app that's supposed to be baked in here was
# developed on an unmerged branch (commit a294b15a5, "tier 4 PR-B") and
# never landed on main — there is no source in this tree to build. Do not
# fabricate placeholder content: crypto.$CRYPTO_DOMAIN will 404 until that
# app is merged. See the PR that added this comment for full context.
RUN mkdir -p /srv/crypto
