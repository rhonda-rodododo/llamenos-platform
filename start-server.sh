#!/bin/bash
export PLATFORM=bun
export PORT=3000
export DATABASE_URL="postgresql://llamenos:dev@localhost:5432/llamenos"
export PG_POOL_SIZE=5
export ADMIN_PUBKEY="79215a4c04f08fcd817c6f820c87169beb8cddf96dfa590a1315556b78af9183"
export HOTLINE_NAME="Llámenos (Dev)"
export ENVIRONMENT=development
export DEV_RESET_SECRET="test-reset-secret"
export HMAC_SECRET="c24063417be5f678624901312e223566162759ae0b0f52ed29754f99edecfb25" # gitleaks:allow (dev-only test value)
export STORAGE_ENDPOINT=http://localhost:9000
export STORAGE_ACCESS_KEY=rustfsadmin
export STORAGE_SECRET_KEY=rustfsadmin
export STORAGE_BUCKET=llamenos-files
export SERVER_SECRET="0000000000000000000000000000000000000000000000000000000000000001"
# Allow 1-hour token age in dev/test to tolerate clock skew between test client and server
export TOKEN_MAX_AGE_MS=3600000

exec bun --watch src/server/index.ts
