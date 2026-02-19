# Multi-stage Dockerfile for Llamenos (Node.js self-hosted mode)
#
# Builds:
#   Stage 1: Frontend SPA (vite build)
#   Stage 2: Node.js server (esbuild)
#   Stage 3: Production image

# Stage 1: Build frontend SPA
FROM oven/bun:1 AS frontend
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY src/ src/
COPY public/ public/
COPY vite.config.ts tsconfig.json ./
COPY tailwind.config.ts* ./
RUN bun run build

# Stage 2: Build Node.js server
FROM oven/bun:1 AS backend
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY src/ src/
COPY tsconfig.json esbuild.node.mjs ./
RUN node esbuild.node.mjs

# Stage 3: Production
FROM node:22-slim
WORKDIR /app

# Install better-sqlite3 native module
COPY package.json ./
RUN npm install --production --ignore-scripts && \
    npm install better-sqlite3 --build-from-source

# Copy built artifacts
COPY --from=frontend /app/dist/client/ dist/client/
COPY --from=backend /app/dist/server/ dist/server/

# Create data directory for SQLite databases
RUN mkdir -p /app/data

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
