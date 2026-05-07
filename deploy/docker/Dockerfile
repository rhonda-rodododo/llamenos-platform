# Multi-stage Dockerfile for Llamenos (Bun self-hosted mode)
#
# Builds:
#   Stage 1: Install JS dependencies
#   Stage 2: Build Rust crypto library (.so) for bun:ffi
#   Stage 3: Production image (API-only — desktop clients connect to this)
#
# Bun runs TypeScript natively — no esbuild transpilation step needed.

# Stage 1: Install runtime deps
FROM oven/bun:1@sha256:87416c977a612a204eb54ab9f3927023c2a3c971f4f345a01da08ea6262ae30e AS deps
# oven/bun:1 pinned 2026-03-21 — update via Dependabot or on new minor release
WORKDIR /app
COPY package.json bun.lockb ./
# Copy workspace package.json stubs so bun can resolve the workspace graph from the
# lockfile. Without these, --frozen-lockfile fails because the lockfile references
# workspace packages. Without the lockfile, some @aws-sdk versions freshly downloaded
# from npm carry workspace:^ refs for @smithy deps, which fail to resolve in a non-monorepo
# Docker context. Using --frozen-lockfile with these stubs avoids re-resolution entirely.
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/test-specs/package.json packages/test-specs/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY site/package.json site/package.json
RUN bun install --frozen-lockfile --production --ignore-scripts

# Stage 2: Build Rust crypto FFI (.so)
FROM rust:1-slim AS rust-builder
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY packages/crypto/ packages/crypto/
RUN cargo build --release --manifest-path packages/crypto/Cargo.toml --features server \
    && mkdir -p packages/crypto/dist/server \
    && cp packages/crypto/target/release/libllamenos_core.so packages/crypto/dist/server/

# Stage 3: Production
FROM oven/bun:1-slim@sha256:7e8ed3961db1cdedf17d516dda87948cfedbd294f53bf16462e5b57ed3fff0f1
# oven/bun:1-slim pinned 2026-03-21 — update via Dependabot

# Create non-root user
RUN groupadd -r llamenos && useradd -r -g llamenos -d /app -s /sbin/nologin llamenos

WORKDIR /app

# Copy runtime dependencies
COPY package.json ./
COPY --from=deps /app/node_modules/ node_modules/

# Copy source (Bun runs TS directly — no bundled output)
COPY src/ src/
COPY apps/worker/ apps/worker/
COPY packages/shared/ packages/shared/
COPY packages/i18n/ packages/i18n/
COPY packages/protocol/ packages/protocol/
COPY packages/crypto/ffi.ts packages/crypto/ffi.ts
COPY tsconfig.json ./

# Copy native crypto library from Rust build
COPY --from=rust-builder /build/packages/crypto/dist/server/libllamenos_core.so packages/crypto/dist/server/

# Copy Drizzle SQL migrations + migration runner (applied at startup)
COPY drizzle/migrations/ drizzle/migrations/
COPY scripts/run-migrations.ts scripts/run-migrations.ts

# Copy entrypoint (runs migrations then starts the app)
COPY deploy/docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Serve a minimal download page for browsers hitting the root URL
COPY deploy/docker/download-page/ public/

# Set ownership
RUN chown -R llamenos:llamenos /app

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
