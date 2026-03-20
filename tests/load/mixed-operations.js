import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Per-operation custom metrics
const healthLatency = new Trend('health_check_latency', true);
const notesLatency = new Trend('notes_list_latency', true);
const volunteersLatency = new Trend('volunteers_list_latency', true);
const auditLatency = new Trend('audit_log_latency', true);
const shiftsLatency = new Trend('shifts_list_latency', true);
const settingsLatency = new Trend('settings_read_latency', true);
const errorRate = new Rate('errors');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_SECRET = __ENV.TEST_SECRET || 'test-secret';

const headers = {
  'Content-Type': 'application/json',
  'X-Test-Secret': TEST_SECRET,
};

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const options = {
  stages: [
    { duration: '1m', target: 5 },
    { duration: '2m', target: 25 },
    { duration: '3m', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    health_check_latency: ['p(95)<500'],
    notes_list_latency: ['p(95)<1500'],
    volunteers_list_latency: ['p(95)<1500'],
    audit_log_latency: ['p(95)<2000'],
    shifts_list_latency: ['p(95)<1500'],
    settings_read_latency: ['p(95)<1000'],
    errors: ['rate<0.05'],
  },
};

// Weighted operation selection
// 30% health, 25% notes, 20% volunteers, 10% audit, 10% shifts, 5% settings
const operations = [
  { weight: 30, fn: doHealthCheck },
  { weight: 25, fn: doNotesList },
  { weight: 20, fn: doVolunteersList },
  { weight: 10, fn: doAuditLog },
  { weight: 10, fn: doShiftsList },
  { weight: 5, fn: doSettingsRead },
];

function pickOperation() {
  const roll = randomBetween(1, 100);
  let cumulative = 0;
  for (const op of operations) {
    cumulative += op.weight;
    if (roll <= cumulative) return op.fn;
  }
  return operations[0].fn;
}

function doHealthCheck() {
  const res = http.get(`${BASE_URL}/api/health`, { headers });
  const ok = check(res, {
    'health check 200': (r) => r.status === 200,
  });
  errorRate.add(!ok);
  healthLatency.add(res.timings.duration);
}

function doNotesList() {
  const res = http.get(`${BASE_URL}/api/notes`, { headers });
  const ok = check(res, {
    'notes list 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  errorRate.add(!ok);
  notesLatency.add(res.timings.duration);
}

function doVolunteersList() {
  const res = http.get(`${BASE_URL}/api/users`, { headers });
  const ok = check(res, {
    'volunteers list 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  errorRate.add(!ok);
  volunteersLatency.add(res.timings.duration);
}

function doAuditLog() {
  const res = http.get(`${BASE_URL}/api/audit`, { headers });
  const ok = check(res, {
    'audit log 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  errorRate.add(!ok);
  auditLatency.add(res.timings.duration);
}

function doShiftsList() {
  const res = http.get(`${BASE_URL}/api/shifts`, { headers });
  const ok = check(res, {
    'shifts list 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  errorRate.add(!ok);
  shiftsLatency.add(res.timings.duration);
}

function doSettingsRead() {
  const res = http.get(`${BASE_URL}/api/settings`, { headers });
  const ok = check(res, {
    'settings read 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  errorRate.add(!ok);
  settingsLatency.add(res.timings.duration);
}

export default function () {
  const operation = pickOperation();
  operation();
  sleep(randomBetween(1, 3));
}
