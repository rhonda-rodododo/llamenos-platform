# oven/bun:1.3.5-slim digest pinned to match .mise.toml — update via scripts/update-image-digests.sh
FROM oven/bun:1.3.5-slim@sha256:6111acec4c5a703f2069d6e681967c047920ff2883e7e5a5e64f4ac95ddeb27f
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
EXPOSE 3100
CMD ["bun", "run", "src/index.ts"]
