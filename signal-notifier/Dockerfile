FROM oven/bun:1-slim
WORKDIR /app
COPY package.json ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ ./src/
RUN mkdir -p /app/data
ENV NOTIFIER_DB_PATH=/app/data/notifier.db
EXPOSE 3100
CMD ["bun", "run", "src/index.ts"]
