# Multi-stage Dockerfile for Llamenos (Bun self-hosted mode)
#
# Builds:
#   Stage 1: Install dependencies (pure JS — no native build tools needed)
#   Stage 2: Production image (API-only — desktop clients connect to this)
#
# Bun runs TypeScript natively — no esbuild transpilation step needed.

# Stage 1: Install runtime deps
FROM oven/bun:1@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS deps
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

# Stage 2: Production
FROM oven/bun:1-slim@sha256:478281fdd196871c7e51ba6a820b7803a8ae97042ec86cdbc2e1c6b6626442d9
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
COPY tsconfig.json ./

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
