# Epic 296: Load Testing & Capacity Planning

**Status**: PENDING
**Priority**: Medium
**Depends on**: None
**Blocks**: None
**Branch**: `desktop`

## Summary

Create k6 load test scripts targeting the Node.js self-hosted backend, covering concurrent call handling, high-volume messaging, mixed admin operations, and burst traffic scenarios. Produce a capacity planning document that maps workload sizes to hardware requirements. Add an optional CI job for manual load test execution.

## Problem Statement

Llamenos has zero load testing. The system handles real crisis calls where dropped connections or slow responses can have life-threatening consequences. Without load testing:

1. **Unknown breaking point.** We don't know how many concurrent calls the system handles before PostgreSQL connections saturate, parallel ringing latency spikes, or the Nostr relay falls behind on event delivery.
2. **No capacity planning.** Operators deploying for 5 calls/day vs. 500 calls/day have no guidance on hardware sizing. A VPS with 1 GB RAM might handle a small org but silently degrade for a larger one.
3. **Performance regressions invisible.** Code changes that add latency (e.g., additional DB queries in call routing) are only caught when volunteers report "the app feels slow."

k6 is the right tool: open-source, scriptable in JavaScript, generates Prometheus-compatible metrics, and runs in CI. The Node.js self-hosted backend is the load test target because it's the deployment path for the target audience (activist organizations self-hosting on affordable infrastructure).

## Implementation

### Phase 1: k6 Test Scripts

**Directory: `tests/load/`**

#### Scenario 1: Concurrent Calls

**File: `tests/load/concurrent-calls.js`**

```javascript
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const errorRate = new Rate('errors')
const callSetupLatency = new Trend('call_setup_latency', true)
const callAnswerLatency = new Trend('call_answer_latency', true)

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const TEST_SECRET = __ENV.TEST_SECRET || 'test-secret'

export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 10 },   // Ramp to 10 concurrent calls
        { duration: '3m', target: 25 },   // Sustain 25 concurrent
        { duration: '2m', target: 50 },   // Peak at 50
        { duration: '1m', target: 50 },   // Hold peak
        { duration: '1m', target: 0 },    // Ramp down
      ],
    },
  },
  thresholds: {
    'call_setup_latency': ['p95<2000'],   // Call setup under 2s at p95
    'call_answer_latency': ['p95<1000'],  // Answer under 1s at p95
    'errors': ['rate<0.05'],              // Error rate under 5%
    'http_req_duration': ['p99<5000'],     // Overall p99 under 5s
  },
}

export default function () {
  // Simulate incoming call (Twilio webhook format)
  const callSid = `CA${randomHex(32)}`
  const callerNumber = `+1555${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`

  const setupStart = Date.now()
  const incomingRes = http.post(`${BASE_URL}/api/test-simulate/incoming-call`, JSON.stringify({
    callSid,
    from: callerNumber,
    to: '+15551234567',
  }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Secret': TEST_SECRET,
    },
  })

  check(incomingRes, {
    'incoming call accepted': (r) => r.status === 200,
  }) || errorRate.add(1)
  callSetupLatency.add(Date.now() - setupStart)

  sleep(randomBetween(1, 3)) // Simulate ring time

  // Simulate volunteer answering
  const answerStart = Date.now()
  const answerRes = http.post(`${BASE_URL}/api/test-simulate/answer-call`, JSON.stringify({
    callSid,
    volunteerId: `vol-${__VU}`,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Secret': TEST_SECRET,
    },
  })

  check(answerRes, {
    'call answered': (r) => r.status === 200,
  }) || errorRate.add(1)
  callAnswerLatency.add(Date.now() - answerStart)

  sleep(randomBetween(30, 120)) // Simulate call duration

  // End call
  http.post(`${BASE_URL}/api/test-simulate/end-call`, JSON.stringify({
    callSid,
    duration: Math.floor(randomBetween(30, 120)),
  }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Secret': TEST_SECRET,
    },
  })

  sleep(randomBetween(1, 5)) // Gap between calls
}

function randomHex(length) {
  const chars = '0123456789abcdef'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * 16))
  }
  return result
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}
```

#### Scenario 2: High-Volume Messaging

**File: `tests/load/messaging-throughput.js`**

```javascript
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

const messageLatency = new Trend('message_send_latency', true)
const messagesDelivered = new Counter('messages_delivered')
const errorRate = new Rate('errors')

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const TEST_SECRET = __ENV.TEST_SECRET || 'test-secret'

export const options = {
  scenarios: {
    steady_state: {
      executor: 'constant-arrival-rate',
      rate: 17,             // ~1000/hour
      timeUnit: '1m',
      duration: '10m',
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    'message_send_latency': ['p95<500'],
    'errors': ['rate<0.02'],
  },
}

export default function () {
  const conversationId = `conv-${Math.floor(Math.random() * 10) + 1}`
  const messageBody = `Load test message ${Date.now()} from VU ${__VU}`

  const start = Date.now()
  const res = http.post(`${BASE_URL}/api/test-simulate/incoming-message`, JSON.stringify({
    conversationId,
    from: `+1555${String(__VU).padStart(7, '0')}`,
    body: messageBody,
    channel: 'sms',
  }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Secret': TEST_SECRET,
    },
  })

  check(res, {
    'message accepted': (r) => r.status === 200,
  }) || errorRate.add(1)

  messageLatency.add(Date.now() - start)
  messagesDelivered.add(1)

  sleep(0.5)
}
```

#### Scenario 3: Mixed Admin Operations

**File: `tests/load/mixed-operations.js`**

```javascript
import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Rate } from 'k6/metrics'

const errorRate = new Rate('errors')

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

export const options = {
  scenarios: {
    mixed_load: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '2m', target: 25 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{operation:health}': ['p95<200'],
    'http_req_duration{operation:notes_list}': ['p95<1000'],
    'http_req_duration{operation:volunteers_list}': ['p95<500'],
    'http_req_duration{operation:audit_log}': ['p95<2000'],
    'errors': ['rate<0.05'],
  },
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
}

export default function () {
  const roll = Math.random()

  if (roll < 0.30) {
    // 30% health checks
    group('health_check', () => {
      const res = http.get(`${BASE_URL}/api/health`, {
        tags: { operation: 'health' },
      })
      check(res, { 'health ok': (r) => r.status === 200 }) || errorRate.add(1)
    })
  } else if (roll < 0.55) {
    // 25% note list/read
    group('notes', () => {
      const res = http.get(`${BASE_URL}/api/notes`, {
        headers,
        tags: { operation: 'notes_list' },
      })
      check(res, { 'notes listed': (r) => r.status === 200 }) || errorRate.add(1)
    })
  } else if (roll < 0.75) {
    // 20% volunteer list
    group('volunteers', () => {
      const res = http.get(`${BASE_URL}/api/volunteers`, {
        headers,
        tags: { operation: 'volunteers_list' },
      })
      check(res, { 'volunteers listed': (r) => r.status === 200 }) || errorRate.add(1)
    })
  } else if (roll < 0.85) {
    // 10% audit log (heavier query)
    group('audit', () => {
      const res = http.get(`${BASE_URL}/api/audit?limit=50`, {
        headers,
        tags: { operation: 'audit_log' },
      })
      check(res, { 'audit listed': (r) => r.status === 200 }) || errorRate.add(1)
    })
  } else if (roll < 0.95) {
    // 10% shifts
    group('shifts', () => {
      const res = http.get(`${BASE_URL}/api/shifts`, {
        headers,
        tags: { operation: 'shifts' },
      })
      check(res, { 'shifts listed': (r) => r.status === 200 }) || errorRate.add(1)
    })
  } else {
    // 5% settings read
    group('settings', () => {
      const res = http.get(`${BASE_URL}/api/settings/spam`, {
        headers,
        tags: { operation: 'settings' },
      })
      check(res, { 'settings read': (r) => r.status === 200 }) || errorRate.add(1)
    })
  }

  sleep(randomBetween(0.5, 2))
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}
```

#### Scenario 4: Burst Test

**File: `tests/load/burst.js`**

```javascript
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

const errorRate = new Rate('errors')

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const TEST_SECRET = __ENV.TEST_SECRET || 'test-secret'

export const options = {
  scenarios: {
    normal: {
      executor: 'constant-vus',
      vus: 5,
      duration: '2m',
    },
    burst: {
      executor: 'constant-vus',
      vus: 50,              // 10x spike
      duration: '2m',
      startTime: '2m',      // Starts after normal phase
    },
    recovery: {
      executor: 'constant-vus',
      vus: 5,
      duration: '2m',
      startTime: '4m',      // Recovery phase
    },
  },
  thresholds: {
    'errors': ['rate<0.10'],                        // Allow 10% errors during burst
    'http_req_duration{scenario:normal}': ['p95<1000'],
    'http_req_duration{scenario:recovery}': ['p95<2000'],  // Recovery may be slower
  },
}

export default function () {
  const callSid = `CA${Date.now()}${__VU}`

  const res = http.post(`${BASE_URL}/api/test-simulate/incoming-call`, JSON.stringify({
    callSid,
    from: `+1555${String(__VU).padStart(7, '0')}`,
    to: '+15551234567',
  }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Secret': TEST_SECRET,
    },
  })

  check(res, {
    'call processed': (r) => r.status === 200 || r.status === 429,
    'not server error': (r) => r.status < 500,
  }) || errorRate.add(1)

  sleep(randomBetween(1, 3))
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}
```

### Phase 2: Test Runner Script

**File: `tests/load/run.sh`**

```bash
#!/usr/bin/env bash
#
# Llamenos Load Test Runner
#
# Usage:
#   ./run.sh calls          # Run concurrent calls test
#   ./run.sh messages       # Run messaging throughput test
#   ./run.sh mixed          # Run mixed operations test
#   ./run.sh burst          # Run burst test
#   ./run.sh all            # Run all tests sequentially
#   ./run.sh calls --out json=results.json   # Export results

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_SECRET="${TEST_SECRET:-test-secret}"

if ! command -v k6 &>/dev/null; then
  echo "k6 not found. Install: https://k6.io/docs/get-started/installation/"
  echo "  brew install k6  (macOS)"
  echo "  sudo apt install k6  (Debian/Ubuntu)"
  exit 1
fi

scenario="${1:-all}"
shift || true

run_test() {
  local name="$1" file="$2"
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  Running: ${name}"
  echo "  Target:  ${BASE_URL}"
  echo "════════════════════════════════════════════════════════════"
  echo ""
  k6 run \
    -e BASE_URL="${BASE_URL}" \
    -e TEST_SECRET="${TEST_SECRET}" \
    "${SCRIPT_DIR}/${file}" \
    "$@"
}

case "${scenario}" in
  calls)    run_test "Concurrent Calls" "concurrent-calls.js" "$@" ;;
  messages) run_test "Messaging Throughput" "messaging-throughput.js" "$@" ;;
  mixed)    run_test "Mixed Operations" "mixed-operations.js" "$@" ;;
  burst)    run_test "Burst Test" "burst.js" "$@" ;;
  all)
    run_test "Concurrent Calls" "concurrent-calls.js" "$@"
    run_test "Messaging Throughput" "messaging-throughput.js" "$@"
    run_test "Mixed Operations" "mixed-operations.js" "$@"
    run_test "Burst Test" "burst.js" "$@"
    ;;
  *)
    echo "Unknown scenario: ${scenario}"
    echo "Usage: $0 {calls|messages|mixed|burst|all}"
    exit 1
    ;;
esac
```

### Phase 3: Capacity Planning Document

**File: `docs/CAPACITY_PLANNING.md`**

Template structure (filled in after initial load test runs):

```markdown
# Capacity Planning Guide

## Workload Profiles

| Profile | Calls/Day | Messages/Day | Concurrent Calls | Recommended Hardware |
|---------|-----------|-------------|-------------------|---------------------|
| Small (single org) | 5-20 | 50-200 | 1-3 | 1 vCPU, 2 GB RAM, 20 GB disk |
| Medium (regional) | 50-200 | 500-2000 | 5-15 | 2 vCPU, 4 GB RAM, 50 GB disk |
| Large (statewide) | 200-1000 | 2000-10000 | 15-50 | 4 vCPU, 8 GB RAM, 100 GB disk |

## Bottleneck Analysis

(Populated from load test results)

### PostgreSQL
- Connection pool: `pg_pool_size` default is 10
- At 25 concurrent calls: pool utilization ~60%
- At 50 concurrent calls: pool saturation possible — increase to 20

### Memory
- Base footprint: ~200 MB (Node.js app + overhead)
- Per concurrent call: ~5 MB (parallel ringing state, WebRTC signaling)
- 50 concurrent calls: ~450 MB total

### Disk I/O
- Backups: ~X MB/day database growth
- Recordings (if enabled): ~1 MB/minute per call
- Relay events: ~Y MB/day

## Scaling Recommendations

- **Vertical first**: Increase RAM before adding CPUs. PostgreSQL benefits from buffer cache.
- **Split PostgreSQL**: Use multi-host inventory (Epic 276) to put DB on dedicated VPS.
- **Recording storage**: Use RustFS on separate disk/VPS if call recordings enabled.
```

### Phase 4: CI Integration

**File: `.github/workflows/load-test.yml`**

```yaml
name: Load Test (Manual)

on:
  workflow_dispatch:
    inputs:
      scenario:
        description: 'Test scenario'
        required: true
        default: 'all'
        type: choice
        options:
          - calls
          - messages
          - mixed
          - burst
          - all
      duration_multiplier:
        description: 'Duration multiplier (0.5 = half duration, 2 = double)'
        required: false
        default: '1'

jobs:
  load-test:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_DB: llamenos
          POSTGRES_USER: llamenos
          POSTGRES_PASSWORD: loadtest
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: grafana/setup-k6-action@v1

      - name: Install dependencies
        run: bun install

      - name: Build server
        run: bun run build

      - name: Start backend
        run: |
          export DATABASE_URL=postgresql://llamenos:loadtest@localhost:5432/llamenos
          export ENVIRONMENT=development
          bun run start:node &
          sleep 10
          curl -sf http://localhost:3000/api/health || exit 1

      - name: Run load test
        run: |
          chmod +x tests/load/run.sh
          tests/load/run.sh ${{ inputs.scenario }} \
            --out json=load-test-results.json

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: load-test-results
          path: load-test-results.json
```

### Phase 5: Package.json Scripts

Add to root `package.json`:

```json
{
  "scripts": {
    "load:calls": "tests/load/run.sh calls",
    "load:messages": "tests/load/run.sh messages",
    "load:mixed": "tests/load/run.sh mixed",
    "load:burst": "tests/load/run.sh burst",
    "load:all": "tests/load/run.sh all"
  }
}
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `tests/load/concurrent-calls.js` | Create | k6 script: 50 concurrent calls with parallel ringing |
| `tests/load/messaging-throughput.js` | Create | k6 script: 1000 messages/hour across 10 conversations |
| `tests/load/mixed-operations.js` | Create | k6 script: weighted mix of API operations |
| `tests/load/burst.js` | Create | k6 script: normal load to 10x spike to recovery |
| `tests/load/run.sh` | Create | Test runner script with scenario selection |
| `docs/CAPACITY_PLANNING.md` | Create | Hardware sizing guide (template, populated after first run) |
| `.github/workflows/load-test.yml` | Create | Manual CI workflow for load tests |
| `package.json` | Extend | Add `load:*` scripts |
| `.gitignore` | Extend | Add `tests/load/*.json` (result files) |

## Testing

1. **Local smoke test**: Start Docker Compose backend. Run `bun run load:calls` with short duration (`k6 run --duration 30s`). Verify k6 output shows thresholds evaluated and requests succeeded.

2. **All scenarios**: Run `bun run load:all` against local Docker backend. Verify all 4 scenarios complete without k6 errors (test script errors, not HTTP errors).

3. **Threshold validation**: Verify that a healthy local deployment passes all thresholds. If not, adjust thresholds to match reasonable local performance.

4. **CI workflow test**: Trigger `workflow_dispatch` on a feature branch. Verify the job starts, spins up PostgreSQL, starts the backend, and runs the specified scenario.

5. **Results portability**: After a run, verify `load-test-results.json` contains per-request timing data that can be analyzed with k6's built-in summary or imported into Grafana.

## Acceptance Criteria

- [ ] Four k6 test scripts covering concurrent calls, messaging, mixed operations, and burst traffic
- [ ] Runner script (`run.sh`) supports individual scenario and `all` modes
- [ ] Capacity planning document with workload profiles and hardware recommendations
- [ ] CI workflow for manual load test execution with scenario selection
- [ ] All scripts use the existing `/api/test-simulate/*` endpoints (no new backend changes required)
- [ ] Thresholds defined: p95 call setup < 2s, p95 message send < 500ms, error rate < 5%
- [ ] Results exportable as JSON for historical comparison
- [ ] `package.json` scripts: `load:calls`, `load:messages`, `load:mixed`, `load:burst`, `load:all`

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Load tests accidentally run against production | Low | Critical | Scripts default to `http://localhost:3000`; require `X-Test-Secret` header; simulation endpoints only available in `ENVIRONMENT=development` |
| k6 not available on all developer machines | Medium | Low | Runner script checks for k6 and provides install instructions; CI job installs it automatically |
| Test simulation endpoints don't fully model real call flow | Medium | Medium | Simulation endpoints are already used by Playwright E2E tests; they exercise the same code paths as real Twilio webhooks |
| Results vary significantly between hardware | High | Low | Capacity planning doc includes hardware specs for each benchmark run; relative comparisons between versions are more useful than absolute numbers |
| PostgreSQL connection pool exhaustion during load test | Medium | Medium | k6 thresholds catch this as increased latency/errors; capacity planning doc recommends pool size increases for higher concurrency |
