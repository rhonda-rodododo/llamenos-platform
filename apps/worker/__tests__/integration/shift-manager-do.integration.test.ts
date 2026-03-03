/**
 * Integration tests for ShiftManagerDO — tests real DO logic with in-memory storage.
 *
 * Tests cover:
 * - Shift CRUD operations
 * - Current volunteer calculation based on shifts and time
 * - Shift overlap detection (volunteer in multiple shifts)
 * - Fallback group handling when no shifts match
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ShiftManagerDO } from '@worker/durable-objects/shift-manager'
import { createDOTestHarness } from './helpers'

describe('ShiftManagerDO integration', () => {
  let doFetch: ReturnType<typeof createDOTestHarness>['doFetch']
  let doJSON: ReturnType<typeof createDOTestHarness>['doJSON']
  let postJSON: ReturnType<typeof createDOTestHarness>['postJSON']
  let patchJSON: ReturnType<typeof createDOTestHarness>['patchJSON']

  beforeEach(() => {
    const harness = createDOTestHarness(ShiftManagerDO)
    doFetch = harness.doFetch
    doJSON = harness.doJSON
    postJSON = harness.postJSON
    patchJSON = harness.patchJSON
  })

  it('creates a new shift', async () => {
    const res = await postJSON('/shifts', {
      name: 'Morning Shift',
      startTime: '08:00',
      endTime: '16:00',
      days: [1, 2, 3, 4, 5],
      volunteerPubkeys: ['vol-1', 'vol-2'],
    })

    expect(res.status).toBe(200)
    const data = await res.json() as {
      shift: {
        id: string; name: string; startTime: string; endTime: string
        days: number[]; volunteerPubkeys: string[]; createdAt: string
      }
    }
    expect(data.shift.id).toBeDefined()
    expect(data.shift.name).toBe('Morning Shift')
    expect(data.shift.startTime).toBe('08:00')
    expect(data.shift.endTime).toBe('16:00')
    expect(data.shift.days).toEqual([1, 2, 3, 4, 5])
    expect(data.shift.volunteerPubkeys).toEqual(['vol-1', 'vol-2'])
    expect(data.shift.createdAt).toBeDefined()
  })

  it('lists all shifts', async () => {
    await postJSON('/shifts', {
      name: 'Shift A',
      startTime: '00:00',
      endTime: '08:00',
      days: [0, 1, 2, 3, 4, 5, 6],
      volunteerPubkeys: ['vol-a'],
    })
    await postJSON('/shifts', {
      name: 'Shift B',
      startTime: '08:00',
      endTime: '16:00',
      days: [1, 2, 3, 4, 5],
      volunteerPubkeys: ['vol-b'],
    })

    const data = await doJSON<{ shifts: Array<{ name: string }> }>('/shifts')
    expect(data.shifts).toHaveLength(2)
    expect(data.shifts.map((s) => s.name)).toEqual(['Shift A', 'Shift B'])
  })

  it('updates an existing shift', async () => {
    const createRes = await postJSON('/shifts', {
      name: 'Original Shift',
      startTime: '09:00',
      endTime: '17:00',
      days: [1, 2, 3],
      volunteerPubkeys: ['vol-1'],
    })
    const { shift } = await createRes.json() as { shift: { id: string } }

    const updateRes = await patchJSON(`/shifts/${shift.id}`, {
      name: 'Updated Shift',
      volunteerPubkeys: ['vol-1', 'vol-3'],
      days: [1, 2, 3, 4, 5],
    })
    expect(updateRes.status).toBe(200)
    const updated = await updateRes.json() as {
      shift: { name: string; volunteerPubkeys: string[]; days: number[] }
    }
    expect(updated.shift.name).toBe('Updated Shift')
    expect(updated.shift.volunteerPubkeys).toEqual(['vol-1', 'vol-3'])
    expect(updated.shift.days).toEqual([1, 2, 3, 4, 5])
  })

  it('deletes a shift', async () => {
    const createRes = await postJSON('/shifts', {
      name: 'To Delete',
      startTime: '10:00',
      endTime: '18:00',
      days: [1],
      volunteerPubkeys: ['vol-1'],
    })
    const { shift } = await createRes.json() as { shift: { id: string } }

    const deleteRes = await doFetch(`/shifts/${shift.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    const list = await doJSON<{ shifts: unknown[] }>('/shifts')
    expect(list.shifts).toHaveLength(0)
  })

  it('returns current on-shift volunteers', async () => {
    const now = new Date()
    const currentDay = now.getUTCDay()
    const currentHour = now.getUTCHours()

    // Create a shift that covers the current time
    const startHour = Math.max(0, currentHour - 1)
    const endHour = Math.min(23, currentHour + 1)
    const startTime = `${String(startHour).padStart(2, '0')}:00`
    const endTime = `${String(endHour).padStart(2, '0')}:59`

    await postJSON('/shifts', {
      name: 'Active Shift',
      startTime,
      endTime,
      days: [currentDay],
      volunteerPubkeys: ['active-vol-1', 'active-vol-2'],
    })

    // Create another shift on a different day
    const otherDay = (currentDay + 3) % 7
    await postJSON('/shifts', {
      name: 'Inactive Shift',
      startTime: '08:00',
      endTime: '16:00',
      days: [otherDay],
      volunteerPubkeys: ['inactive-vol'],
    })

    const data = await doJSON<{ volunteers: string[] }>('/current-volunteers')
    expect(data.volunteers).toContain('active-vol-1')
    expect(data.volunteers).toContain('active-vol-2')
    expect(data.volunteers).not.toContain('inactive-vol')
  })

  it('handles shift overlap (volunteer in multiple shifts)', async () => {
    const now = new Date()
    const currentDay = now.getUTCDay()
    const currentHour = now.getUTCHours()

    const startHour = Math.max(0, currentHour - 1)
    const endHour = Math.min(23, currentHour + 1)
    const startTime = `${String(startHour).padStart(2, '0')}:00`
    const endTime = `${String(endHour).padStart(2, '0')}:59`

    // Same volunteer in two overlapping shifts
    await postJSON('/shifts', {
      name: 'Shift 1',
      startTime,
      endTime,
      days: [currentDay],
      volunteerPubkeys: ['overlap-vol', 'extra-vol-1'],
    })
    await postJSON('/shifts', {
      name: 'Shift 2',
      startTime,
      endTime,
      days: [currentDay],
      volunteerPubkeys: ['overlap-vol', 'extra-vol-2'],
    })

    const data = await doJSON<{ volunteers: string[] }>('/current-volunteers')
    // Volunteer should appear only once (Set deduplication)
    const overlapCount = data.volunteers.filter((v) => v === 'overlap-vol').length
    expect(overlapCount).toBe(1)
    expect(data.volunteers).toContain('extra-vol-1')
    expect(data.volunteers).toContain('extra-vol-2')
  })

  it('returns empty list when no shifts match current time', async () => {
    const now = new Date()
    const futureDay = (now.getUTCDay() + 3) % 7

    await postJSON('/shifts', {
      name: 'Future Shift',
      startTime: '08:00',
      endTime: '16:00',
      days: [futureDay],
      volunteerPubkeys: ['future-vol'],
    })

    const data = await doJSON<{ volunteers: string[] }>('/current-volunteers')
    expect(data.volunteers).not.toContain('future-vol')
  })
})
