FROM oven/bun:1@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy source code
COPY src/ src/
COPY tsconfig.json ./

# Build
RUN bun build src/index.ts --outdir dist --target bun

# Production stage
FROM oven/bun:1@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521
WORKDIR /app

COPY --from=base /app/dist/ dist/
COPY --from=base /app/package.json ./

# Runtime environment — all required values must be set via the compose env
ENV PORT=3100
# BEARER_TOKEN must be set at runtime — no default (CWE-798)
ENV SIGNAL_CLI_URL=http://signal-cli:8080

# Persistent SQLite store for message queue
VOLUME /app/data

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

CMD ["bun", "run", "dist/index.js"]
