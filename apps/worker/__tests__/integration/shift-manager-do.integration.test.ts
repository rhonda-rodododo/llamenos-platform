/**
 * Integration tests for ShiftManagerDO — requires @cloudflare/vitest-pool-workers runtime.
 *
 * Tests cover:
 * - Shift CRUD operations
 * - Current volunteer calculation based on shifts and time
 * - Volunteer clock-in/clock-out
 * - Shift overlap detection
 * - Fallback group handling when no shifts match
 */
import { describe, it, expect } from 'vitest'

describe('ShiftManagerDO integration', () => {
  it.todo('creates a new shift')
  it.todo('lists all shifts')
  it.todo('updates an existing shift')
  it.todo('deletes a shift')
  it.todo('returns current on-shift volunteers')
  it.todo('handles clock-in/clock-out state')
  it.todo('handles shift overlap (volunteer in multiple shifts)')
  it.todo('returns empty list when no shifts match current time')
})
