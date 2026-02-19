# Multi-stage Dockerfile for Llamenos (Node.js self-hosted mode)
#
# Builds:
#   Stage 1: Frontend SPA (vite build)
#   Stage 2: Node.js server (esbuild)
#   Stage 3: Runtime deps (better-sqlite3 native module + ws)
#   Stage 4: Production image

# Stage 1: Build frontend SPA
FROM oven/bun:1 AS frontend
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY src/ src/
COPY public/ public/
COPY vite.config.ts tsconfig.json ./
COPY tailwind.config.ts* ./
RUN bun run build

# Stage 2: Build Node.js server
FROM oven/bun:1 AS backend
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY src/ src/
COPY tsconfig.json esbuild.node.mjs ./
RUN node esbuild.node.mjs

# Stage 3: Install runtime deps (better-sqlite3 needs python3/make/g++ for node-gyp)
FROM node:22-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --production && npm cache clean --force

# Stage 4: Production
FROM node:22-slim

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r llamenos && useradd -r -g llamenos -d /app -s /sbin/nologin llamenos

WORKDIR /app

# Copy runtime dependencies (includes better-sqlite3 native module + ws)
COPY package.json ./
COPY --from=deps /app/node_modules/ node_modules/

# Copy built artifacts
COPY --from=frontend /app/dist/client/ dist/client/
COPY --from=backend /app/dist/server/ dist/server/

# Create data directory with correct ownership
RUN mkdir -p /app/data && chown -R llamenos:llamenos /app

# Switch to non-root user
USER llamenos

# Environment defaults
ENV PLATFORM=node \
    PORT=3000 \
    DATA_DIR=/app/data \
    NODE_ENV=production

VOLUME /app/data
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server/index.js"]
