/**
 * Integration tests for CallRouterDO — tests real DO logic with in-memory storage.
 *
 * Tests cover:
 * - Incoming call registration
 * - Active call tracking
 * - Volunteer answer handling (first pickup wins on telephony side)
 * - Call completion and cleanup
 * - Busy volunteer tracking
 * - Voicemail handling
 * - Call history and per-record encrypted storage
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { CallRouterDO } from '@worker/durable-objects/call-router'
import { createDOTestHarness } from './helpers'

describe('CallRouterDO integration', () => {
  let doFetch: ReturnType<typeof createDOTestHarness>['doFetch']
  let doJSON: ReturnType<typeof createDOTestHarness>['doJSON']
  let postJSON: ReturnType<typeof createDOTestHarness>['postJSON']

  beforeEach(() => {
    const harness = createDOTestHarness(CallRouterDO)
    doFetch = harness.doFetch
    doJSON = harness.doJSON
    postJSON = harness.postJSON
  })

  it('registers an incoming call', async () => {
    const res = await postJSON('/calls/incoming', {
      callSid: 'CA-test-001',
      callerNumber: '+15551234567',
      volunteerPubkeys: ['vol-1', 'vol-2'],
    })

    expect(res.status).toBe(200)
    const data = await res.json() as {
      call: {
        id: string
        callerLast4: string
        status: string
        answeredBy: string | null
        startedAt: string
      }
    }
    expect(data.call.id).toBe('CA-test-001')
    expect(data.call.callerLast4).toBe('4567')
    expect(data.call.status).toBe('ringing')
    expect(data.call.answeredBy).toBeNull()
    expect(data.call.startedAt).toBeDefined()
  })

  it('lists active calls', async () => {
    // Register two calls
    await postJSON('/calls/incoming', {
      callSid: 'CA-active-1',
      callerNumber: '+15551111111',
      volunteerPubkeys: ['vol-1'],
    })
    await postJSON('/calls/incoming', {
      callSid: 'CA-active-2',
      callerNumber: '+15552222222',
      volunteerPubkeys: ['vol-2'],
    })

    const data = await doJSON<{ calls: Array<{ id: string; status: string }> }>('/calls/active')
    expect(data.calls).toHaveLength(2)
    expect(data.calls.map((c) => c.id)).toContain('CA-active-1')
    expect(data.calls.map((c) => c.id)).toContain('CA-active-2')
  })

  it('handles volunteer answering a call', async () => {
    await postJSON('/calls/incoming', {
      callSid: 'CA-answer-test',
      callerNumber: '+15553333333',
      volunteerPubkeys: ['vol-1', 'vol-2'],
    })

    const answerRes = await postJSON('/calls/CA-answer-test/answer', {
      pubkey: 'vol-1',
    })

    expect(answerRes.status).toBe(200)
    const data = await answerRes.json() as {
      call: { id: string; status: string; answeredBy: string }
    }
    expect(data.call.status).toBe('in-progress')
    expect(data.call.answeredBy).toBe('vol-1')

    // Verify via active calls endpoint
    const activeCalls = await doJSON<{ calls: Array<{ id: string; status: string; answeredBy: string }> }>(
      '/calls/active'
    )
    const call = activeCalls.calls.find((c) => c.id === 'CA-answer-test')
    expect(call?.status).toBe('in-progress')
    expect(call?.answeredBy).toBe('vol-1')
  })

  it('allows second answer (telephony handles first-pickup-wins)', async () => {
    await postJSON('/calls/incoming', {
      callSid: 'CA-double-answer',
      callerNumber: '+15554444444',
      volunteerPubkeys: ['vol-1', 'vol-2'],
    })

    // First answer succeeds
    const first = await postJSON('/calls/CA-double-answer/answer', {
      pubkey: 'vol-1',
    })
    expect(first.status).toBe(200)

    // Second answer also succeeds (the DO records the last answer;
    // Twilio handles the "first pickup wins" on the telephony side)
    const second = await postJSON('/calls/CA-double-answer/answer', {
      pubkey: 'vol-2',
    })
    expect(second.status).toBe(200)
    const data = await second.json() as { call: { answeredBy: string } }
    expect(data.call.answeredBy).toBe('vol-2')
  })

  it('marks call as completed and moves to history', async () => {
    await postJSON('/calls/incoming', {
      callSid: 'CA-complete-test',
      callerNumber: '+15555555555',
      volunteerPubkeys: ['vol-1'],
    })

    // Answer the call
    await postJSON('/calls/CA-complete-test/answer', { pubkey: 'vol-1' })

    // End the call
    const endRes = await postJSON('/calls/CA-complete-test/end', {})
    expect(endRes.status).toBe(200)
    const endData = await endRes.json() as {
      call: { id: string; status: string; endedAt: string; duration: number }
    }
    expect(endData.call.status).toBe('completed')
    expect(endData.call.endedAt).toBeDefined()
    expect(endData.call.duration).toBeGreaterThanOrEqual(0)

    // Verify call is no longer in active list
    const active = await doJSON<{ calls: unknown[] }>('/calls/active')
    expect(active.calls.find((c: unknown) => (c as { id: string }).id === 'CA-complete-test')).toBeUndefined()

    // But it should be in history
    const history = await doJSON<{ calls: Array<{ id: string; status: string }> }>('/calls/history')
    const historicCall = history.calls.find((c) => c.id === 'CA-complete-test')
    expect(historicCall).toBeDefined()
    expect(historicCall?.status).toBe('completed')
  })

  it('tracks busy volunteers during active calls', async () => {
    // Register and answer a call to make vol-1 busy
    await postJSON('/calls/incoming', {
      callSid: 'CA-busy-test',
      callerNumber: '+15556666666',
      volunteerPubkeys: ['vol-1'],
    })
    await postJSON('/calls/CA-busy-test/answer', { pubkey: 'vol-1' })

    // Verify vol-1 is on an active call
    const active = await doJSON<{ calls: Array<{ answeredBy: string | null; status: string }> }>('/calls/active')
    const busyCall = active.calls.find((c) => c.answeredBy === 'vol-1' && c.status === 'in-progress')
    expect(busyCall).toBeDefined()
  })

  it('cleans up call state after completion', async () => {
    // Create, answer, and end a call
    await postJSON('/calls/incoming', {
      callSid: 'CA-cleanup-test',
      callerNumber: '+15557777777',
      volunteerPubkeys: ['vol-1'],
    })
    await postJSON('/calls/CA-cleanup-test/answer', { pubkey: 'vol-1' })
    await postJSON('/calls/CA-cleanup-test/end', {})

    // Active calls should be empty
    const active = await doJSON<{ calls: unknown[] }>('/calls/active')
    expect(active.calls).toHaveLength(0)

    // Call should be retrievable by ID from history (per-record storage)
    const callRes = await doFetch('/calls/CA-cleanup-test')
    expect(callRes.status).toBe(200)
    const callData = await callRes.json() as { call: { id: string; status: string } }
    expect(callData.call.status).toBe('completed')
  })

  it('handles voicemail (no one answered)', async () => {
    // Register a call and simulate voicemail
    await postJSON('/calls/incoming', {
      callSid: 'CA-timeout-test',
      callerNumber: '+15558888888',
      volunteerPubkeys: ['vol-1', 'vol-2'],
    })

    // Simulate voicemail left
    const vmRes = await postJSON('/calls/CA-timeout-test/voicemail', {})
    expect(vmRes.status).toBe(200)
    const vmData = await vmRes.json() as {
      call: { id: string; status: string; hasVoicemail: boolean }
    }
    expect(vmData.call.status).toBe('unanswered')
    expect(vmData.call.hasVoicemail).toBe(true)

    // Call should be removed from active
    const active = await doJSON<{ calls: unknown[] }>('/calls/active')
    const found = active.calls.find((c: unknown) => (c as { id: string }).id === 'CA-timeout-test')
    expect(found).toBeUndefined()

    // Should be in history
    const history = await doJSON<{ calls: Array<{ id: string; status: string; hasVoicemail: boolean }> }>(
      '/calls/history'
    )
    const historicCall = history.calls.find((c) => c.id === 'CA-timeout-test')
    expect(historicCall).toBeDefined()
    expect(historicCall?.status).toBe('unanswered')
    expect(historicCall?.hasVoicemail).toBe(true)
  })

  it('returns today call count', async () => {
    // Register two calls
    await postJSON('/calls/incoming', {
      callSid: 'CA-count-1',
      callerNumber: '+15550001111',
      volunteerPubkeys: ['vol-1'],
    })
    await postJSON('/calls/incoming', {
      callSid: 'CA-count-2',
      callerNumber: '+15550002222',
      volunteerPubkeys: ['vol-1'],
    })

    const data = await doJSON<{ count: number }>('/calls/today-count')
    expect(data.count).toBeGreaterThanOrEqual(2)
  })

  it('returns 404 for non-existent call', async () => {
    const res = await doFetch('/calls/non-existent-call-id')
    expect(res.status).toBe(404)
  })

  it('updates call metadata (transcription, recording)', async () => {
    await postJSON('/calls/incoming', {
      callSid: 'CA-meta-test',
      callerNumber: '+15550003333',
      volunteerPubkeys: ['vol-1'],
    })

    // Update metadata while call is active
    const metaRes = await doFetch('/calls/CA-meta-test/metadata', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hasTranscription: true,
        hasRecording: true,
        recordingSid: 'RE123456',
      }),
    })
    expect(metaRes.status).toBe(200)
    const metaData = await metaRes.json() as {
      call: { hasTranscription: boolean; hasRecording: boolean; recordingSid: string }
    }
    expect(metaData.call.hasTranscription).toBe(true)
    expect(metaData.call.hasRecording).toBe(true)
    expect(metaData.call.recordingSid).toBe('RE123456')
  })

  it('paginates call history', async () => {
    // Create several calls and end them so they appear in history
    for (let i = 0; i < 5; i++) {
      await postJSON('/calls/incoming', {
        callSid: `CA-page-${i}`,
        callerNumber: `+1555000${String(i).padStart(4, '0')}`,
        volunteerPubkeys: ['vol-1'],
      })
      await postJSON(`/calls/CA-page-${i}/answer`, { pubkey: 'vol-1' })
      await postJSON(`/calls/CA-page-${i}/end`, {})
    }

    const page1 = await doJSON<{ calls: unknown[]; total: number }>('/calls/history?page=1&limit=2')
    expect(page1.calls).toHaveLength(2)
    expect(page1.total).toBe(5)

    const page2 = await doJSON<{ calls: unknown[] }>('/calls/history?page=2&limit=2')
    expect(page2.calls).toHaveLength(2)

    const page3 = await doJSON<{ calls: unknown[] }>('/calls/history?page=3&limit=2')
    expect(page3.calls).toHaveLength(1)
  })
})
