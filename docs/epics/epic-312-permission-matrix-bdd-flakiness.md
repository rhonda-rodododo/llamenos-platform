# Epic 312: Permission Matrix BDD Test Flakiness

## Problem

The backend BDD `permission-matrix.feature.spec.js` tests exhibit intermittent failures (0-27 depending on run conditions). Failures appear only when the backend is under concurrent load (e.g., desktop E2E + backend BDD running simultaneously against the same Node.js instance).

### Failure Pattern

- Failures are in role-based access tests: `reporter denied access to X`, `hub-admin has access to Y`, `reviewer denied access to Z`
- Tests pass when run individually or in isolation
- Failure count varies across runs (27, 6, 0) — classic state leak / race condition
- All failures are in `permission-matrix.feature.spec.js` — other BDD tests are stable

### Root Cause Hypothesis

The permission matrix tests create volunteers with specific roles (super-admin, hub-admin, reviewer, reporter, volunteer) and test API access. When the backend receives concurrent `test-reset` calls from other test suites running in parallel, the identity state (created volunteers with assigned roles) may be wiped mid-scenario, causing auth/permission checks to fail.

## Proposed Fix

1. **Isolate backend BDD from desktop E2E**: Don't run both against the same backend instance simultaneously, OR use a separate port/database for backend BDD
2. **Add test-level state guards**: Each permission matrix scenario should verify its precondition volunteers exist before making the access check
3. **Increase test-reset granularity**: Use `test-reset-records` (light reset) instead of `test-reset` (full reset) in the permission matrix step hooks, preserving identity state

## Priority

Low — tests pass in isolation and in CI (which runs suites sequentially). Only affects local development when running multiple test suites concurrently.

## Discovered

2026-03-13 during Linux E2E test session.
