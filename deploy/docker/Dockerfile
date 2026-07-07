# Multi-stage Dockerfile for Llamenos (Bun self-hosted mode)
#
# Builds:
#   Stage 1: Install JS dependencies
#   Stage 2: Build Rust crypto library (.so) for bun:ffi
#   Stage 3: Production image (API-only — desktop clients connect to this)
#
# Bun runs TypeScript natively — no esbuild transpilation step needed.

# Stage 1: Install runtime deps
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS deps
# oven/bun:1.3.5 pinned to match .mise.toml — update via Dependabot or on new minor release
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
FROM rust:1-slim@sha256:6abf73f05806f36362d0ff2722f2250c6153398831edd0455e0e0baa1f78ecc7 AS rust-builder
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY packages/crypto/ packages/crypto/
RUN cargo build --release --manifest-path packages/crypto/Cargo.toml --features server \
    && mkdir -p packages/crypto/dist/server \
    && cp packages/crypto/target/release/libllamenos_core.so packages/crypto/dist/server/

# Stage 3: Production
FROM oven/bun:1.3.14-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04
# oven/bun:1.3.5-slim pinned to match .mise.toml — update via Dependabot

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
