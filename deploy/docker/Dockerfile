# Multi-stage Dockerfile for Llamenos (Bun self-hosted mode)
#
# Builds:
#   Stage 1: Install dependencies (pure JS — no native build tools needed)
#   Stage 2: Production image (API-only — desktop clients connect to this)
#
# Bun runs TypeScript natively — no esbuild transpilation step needed.

# Stage 1: Install runtime deps
FROM oven/bun:1@sha256:8956c7667fa17beb6e3c664115e66bdacfe502da5d99603626e74c197bdef160 AS deps
# oven/bun:1 pinned 2026-03-21 — update via Dependabot or on new minor release
WORKDIR /app
COPY package.json bun.lockb ./
# Strip workspace references — Docker only builds the server, not the full monorepo
RUN bun -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf-8'));delete p.workspaces;require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"
RUN bun install --production --ignore-scripts

# Stage 2: Production
FROM oven/bun:1-slim@sha256:d3c7094c144dd3975d183a4dbc4ec0a764223995bff73290d983edb47043a75f
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

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health/ready').then(r=>{if(!r.ok)process.exit(1)})" || exit 1

CMD ["bun", "src/server/index.ts"]
