# oven/bun:1-slim digest pinned 2026-05-18 — update via scripts/update-image-digests.sh
FROM oven/bun:1-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
EXPOSE 3100
CMD ["bun", "run", "src/index.ts"]
