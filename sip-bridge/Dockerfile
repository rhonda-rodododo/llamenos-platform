FROM oven/bun:1@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy source code
COPY src/ src/
COPY tsconfig.json ./

# Type check
RUN bun run typecheck

# Build
RUN bun build src/index.ts --outdir dist --target bun

# Production stage
FROM oven/bun:1@sha256:856da45d07aeb62eb38ea3e7f9e1794c0143a4ff63efb00e6c4491b627e2a521
WORKDIR /app

COPY --from=base /app/dist/ dist/
COPY --from=base /app/package.json ./

# Shared environment variables (set at runtime)
ENV PBX_TYPE=asterisk
ENV BRIDGE_HOST=0.0.0.0
ENV BRIDGE_PORT=3000

# Asterisk defaults (override at runtime for other PBX types)
ENV ARI_URL=ws://asterisk:8088/ari/events
ENV ARI_REST_URL=http://asterisk:8088/ari
ENV ARI_USERNAME=llamenos
# ARI_PASSWORD must be set at runtime — no default (CWE-798)

# FreeSWITCH defaults (used when PBX_TYPE=freeswitch)
ENV ESL_HOST=freeswitch
ENV ESL_PORT=8021
# ESL_PASSWORD must be set at runtime

# Kamailio defaults (used when PBX_TYPE=kamailio)
ENV KAMAILIO_JSONRPC_URL=http://kamailio:5060/jsonrpc

# Worker/bridge secrets — must be set at runtime
# WORKER_WEBHOOK_URL=http://app:3000
# BRIDGE_SECRET=<random>

ENV STASIS_APP=llamenos

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["bun", "run", "dist/index.js"]
