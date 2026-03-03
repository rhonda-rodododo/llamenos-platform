/**
 * Integration tests for SettingsDO — tests real DO logic with in-memory storage.
 *
 * Tests cover:
 * - Telephony provider configuration CRUD
 * - Spam/CAPTCHA settings management
 * - Custom field definitions
 * - Messaging configuration
 * - Role definitions CRUD
 * - Rate limiting state
 * - Fallback ring group configuration
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { SettingsDO } from '@worker/durable-objects/settings-do'
import { createDOTestHarness } from './helpers'

describe('SettingsDO integration', () => {
  let doFetch: ReturnType<typeof createDOTestHarness>['doFetch']
  let doJSON: ReturnType<typeof createDOTestHarness>['doJSON']
  let postJSON: ReturnType<typeof createDOTestHarness>['postJSON']
  let patchJSON: ReturnType<typeof createDOTestHarness>['patchJSON']
  let putJSON: ReturnType<typeof createDOTestHarness>['putJSON']

  beforeEach(() => {
    const harness = createDOTestHarness(SettingsDO)
    doFetch = harness.doFetch
    doJSON = harness.doJSON
    postJSON = harness.postJSON
    patchJSON = harness.patchJSON
    putJSON = harness.putJSON
  })

  it('stores and retrieves telephony provider config', async () => {
    const config = {
      type: 'twilio',
      accountSid: 'AC1234567890',
      authToken: 'auth-token-value',
      phoneNumber: '+15551234567',
    }

    const patchRes = await patchJSON('/settings/telephony-provider', config)
    expect(patchRes.status).toBe(200)

    const data = await doJSON<{ type: string; accountSid: string; phoneNumber: string }>(
      '/settings/telephony-provider'
    )
    expect(data.type).toBe('twilio')
    expect(data.accountSid).toBe('AC1234567890')
    expect(data.phoneNumber).toBe('+15551234567')
  })

  it('stores and retrieves spam settings', async () => {
    // Check defaults
    const defaults = await doJSON<{
      voiceCaptchaEnabled: boolean
      rateLimitEnabled: boolean
      maxCallsPerMinute: number
    }>('/settings/spam')
    expect(defaults.voiceCaptchaEnabled).toBe(false)
    expect(defaults.rateLimitEnabled).toBe(true)
    expect(defaults.maxCallsPerMinute).toBe(3)

    // Update settings
    const patchRes = await patchJSON('/settings/spam', {
      voiceCaptchaEnabled: true,
      maxCallsPerMinute: 5,
    })
    expect(patchRes.status).toBe(200)

    // Verify persistence
    const updated = await doJSON<{
      voiceCaptchaEnabled: boolean
      maxCallsPerMinute: number
    }>('/settings/spam')
    expect(updated.voiceCaptchaEnabled).toBe(true)
    expect(updated.maxCallsPerMinute).toBe(5)
  })

  it('manages custom field definitions', async () => {
    const fields = [
      {
        id: 'field-1',
        name: 'caller_name',
        label: 'Caller Name',
        type: 'text',
        required: false,
        visibleToVolunteers: true,
        context: 'all',
      },
      {
        id: 'field-2',
        name: 'severity',
        label: 'Severity Level',
        type: 'select',
        required: true,
        visibleToVolunteers: true,
        options: ['Low', 'Medium', 'High', 'Critical'],
        context: 'call-notes',
      },
      {
        id: 'field-3',
        name: 'internal_notes',
        label: 'Internal Notes',
        type: 'textarea',
        required: false,
        visibleToVolunteers: false,
        context: 'all',
      },
    ]

    const putRes = await putJSON('/settings/custom-fields', { fields })
    expect(putRes.status).toBe(200)
    const putData = await putRes.json() as { fields: Array<{ name: string; order: number }> }
    expect(putData.fields).toHaveLength(3)
    expect(putData.fields[0].order).toBe(0)
    expect(putData.fields[1].order).toBe(1)
    expect(putData.fields[2].order).toBe(2)

    // Admin sees all fields
    const adminFields = await doJSON<{ fields: Array<{ name: string }> }>('/settings/custom-fields?role=admin')
    expect(adminFields.fields).toHaveLength(3)

    // Non-admin sees only volunteer-visible fields
    const volFields = await doJSON<{ fields: Array<{ name: string }> }>('/settings/custom-fields?role=volunteer')
    expect(volFields.fields).toHaveLength(2)
    expect(volFields.fields.every((f) => f.name !== 'internal_notes')).toBe(true)
  })

  it('stores messaging channel configuration', async () => {
    const messagingConfig = {
      enabledChannels: ['sms', 'signal'],
      inactivityTimeout: 30,
      maxConcurrentPerVolunteer: 5,
      autoAssign: true,
    }

    const res = await patchJSON('/settings/messaging', messagingConfig)
    expect(res.status).toBe(200)

    const data = await doJSON<{
      enabledChannels: string[]
      inactivityTimeout: number
      maxConcurrentPerVolunteer: number
      autoAssign: boolean
    }>('/settings/messaging')
    expect(data.enabledChannels).toEqual(['sms', 'signal'])
    expect(data.inactivityTimeout).toBe(30)
    expect(data.maxConcurrentPerVolunteer).toBe(5)
    expect(data.autoAssign).toBe(true)
  })

  it('manages role definitions', async () => {
    // Default roles should be seeded
    const defaultRoles = await doJSON<{ roles: Array<{ slug: string; isSystem: boolean }> }>('/settings/roles')
    expect(defaultRoles.roles.length).toBeGreaterThan(0)

    // Create a custom role
    const createRes = await postJSON('/settings/roles', {
      name: 'Crisis Counselor',
      slug: 'crisis-counselor',
      permissions: ['calls:answer', 'notes:write'],
      description: 'Specialized crisis counselor role',
    })
    expect(createRes.status).toBe(201)
    const created = await createRes.json() as {
      id: string; name: string; slug: string; isDefault: boolean; isSystem: boolean
    }
    expect(created.name).toBe('Crisis Counselor')
    expect(created.slug).toBe('crisis-counselor')
    expect(created.isDefault).toBe(false)
    expect(created.isSystem).toBe(false)

    // Update the role
    const updateRes = await patchJSON(`/settings/roles/${created.id}`, {
      name: 'Senior Crisis Counselor',
      permissions: ['calls:answer', 'notes:write', 'notes:read'],
    })
    expect(updateRes.status).toBe(200)
    const updated = await updateRes.json() as { name: string; permissions: string[] }
    expect(updated.name).toBe('Senior Crisis Counselor')
    expect(updated.permissions).toContain('notes:read')

    // Delete the role
    const deleteRes = await doFetch(`/settings/roles/${created.id}`, { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    // Verify deleted
    const afterDelete = await doJSON<{ roles: Array<{ id: string }> }>('/settings/roles')
    expect(afterDelete.roles.find((r) => r.id === created.id)).toBeUndefined()
  })

  it('tracks rate limit state', async () => {
    const key = 'caller-+15551234567'

    // First call -- not rate limited
    const first = await postJSON('/rate-limit/check', { key, maxPerMinute: 3 })
    const firstData = await first.json() as { limited: boolean }
    expect(firstData.limited).toBe(false)

    // Second call
    const second = await postJSON('/rate-limit/check', { key, maxPerMinute: 3 })
    const secondData = await second.json() as { limited: boolean }
    expect(secondData.limited).toBe(false)

    // Third call -- should trigger rate limit (>= maxPerMinute)
    const third = await postJSON('/rate-limit/check', { key, maxPerMinute: 3 })
    const thirdData = await third.json() as { limited: boolean }
    expect(thirdData.limited).toBe(true)
  })

  it('stores fallback ring group', async () => {
    // Default should be empty
    const defaults = await doJSON<{ volunteers: string[] }>('/fallback')
    expect(defaults.volunteers).toEqual([])

    // Set fallback group
    const putRes = await putJSON('/fallback', {
      volunteers: ['vol-pub-1', 'vol-pub-2', 'vol-pub-3'],
    })
    expect(putRes.status).toBe(200)

    // Verify persistence
    const data = await doJSON<{ volunteers: string[] }>('/fallback')
    expect(data.volunteers).toEqual(['vol-pub-1', 'vol-pub-2', 'vol-pub-3'])
  })

  it('stores IVR audio recording references', async () => {
    // Upload a fake audio file
    const audioData = new Uint8Array(1024)
    for (let i = 0; i < audioData.length; i++) audioData[i] = i % 256

    const uploadRes = await doFetch('/settings/ivr-audio/greeting/en', {
      method: 'PUT',
      body: audioData.buffer,
    })
    expect(uploadRes.status).toBe(200)
    const uploadData = await uploadRes.json() as {
      ok: boolean; promptType: string; language: string; size: number
    }
    expect(uploadData.ok).toBe(true)
    expect(uploadData.promptType).toBe('greeting')
    expect(uploadData.language).toBe('en')
    expect(uploadData.size).toBe(1024)

    // List IVR audio
    const listData = await doJSON<{ recordings: Array<{ promptType: string; language: string }> }>(
      '/settings/ivr-audio'
    )
    expect(listData.recordings).toHaveLength(1)
    expect(listData.recordings[0].promptType).toBe('greeting')

    // Retrieve the audio
    const audioRes = await doFetch('/settings/ivr-audio/greeting/en')
    expect(audioRes.status).toBe(200)
    expect(audioRes.headers.get('Content-Type')).toBe('audio/wav')

    // Delete the audio
    const deleteRes = await doFetch('/settings/ivr-audio/greeting/en', { method: 'DELETE' })
    expect(deleteRes.status).toBe(200)

    // Verify deleted
    const afterDelete = await doJSON<{ recordings: unknown[] }>('/settings/ivr-audio')
    expect(afterDelete.recordings).toHaveLength(0)
  })

  it('stores call settings (queue timeout, voicemail max)', async () => {
    // Check defaults
    const defaults = await doJSON<{
      queueTimeoutSeconds: number; voicemailMaxSeconds: number
    }>('/settings/call')
    expect(defaults.queueTimeoutSeconds).toBe(90)
    expect(defaults.voicemailMaxSeconds).toBe(120)

    // Update settings
    const res = await patchJSON('/settings/call', {
      queueTimeoutSeconds: 60,
      voicemailMaxSeconds: 180,
    })
    expect(res.status).toBe(200)
    const updated = await res.json() as {
      queueTimeoutSeconds: number; voicemailMaxSeconds: number
    }
    expect(updated.queueTimeoutSeconds).toBe(60)
    expect(updated.voicemailMaxSeconds).toBe(180)

    // Verify clamping to bounds (30-300)
    const clampRes = await patchJSON('/settings/call', {
      queueTimeoutSeconds: 10,  // below min, should be clamped to 30
      voicemailMaxSeconds: 500, // above max, should be clamped to 300
    })
    const clamped = await clampRes.json() as {
      queueTimeoutSeconds: number; voicemailMaxSeconds: number
    }
    expect(clamped.queueTimeoutSeconds).toBe(30)
    expect(clamped.voicemailMaxSeconds).toBe(300)
  })
})
