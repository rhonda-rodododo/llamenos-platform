import { describe, it, expect, beforeEach, afterEach, jest } from 'bun:test'
import { buildBucketPolicy, createStorageAdmin } from '@worker/lib/storage-admin'

// ---------------------------------------------------------------------------
// buildBucketPolicy
// ---------------------------------------------------------------------------

describe('buildBucketPolicy', () => {
  it('produces IAM policy with correct version', () => {
    const policy = buildBucketPolicy(['my-bucket'])
    expect(policy.Version).toBe('2012-10-17')
  })

  it('includes object-level actions in first statement', () => {
    const policy = buildBucketPolicy(['my-bucket'])
    const statements = policy.Statement as Array<{ Effect: string; Action: string[]; Resource: string[] }>
    const objectStatement = statements.find(s => s.Action.includes('s3:GetObject'))
    expect(objectStatement).toBeDefined()
    expect(objectStatement!.Action).toContain('s3:PutObject')
    expect(objectStatement!.Action).toContain('s3:DeleteObject')
  })

  it('includes bucket-level actions in second statement', () => {
    const policy = buildBucketPolicy(['my-bucket'])
    const statements = policy.Statement as Array<{ Effect: string; Action: string[]; Resource: string[] }>
    const bucketStatement = statements.find(s => s.Action.includes('s3:ListBucket'))
    expect(bucketStatement).toBeDefined()
    expect(bucketStatement!.Action).toContain('s3:GetBucketLocation')
  })

  it('generates resource ARNs for object-level with wildcard suffix', () => {
    const policy = buildBucketPolicy(['hub-abc-voicemails', 'hub-abc-attachments'])
    const statements = policy.Statement as Array<{ Effect: string; Action: string[]; Resource: string[] }>
    const objectStatement = statements.find(s => s.Action.includes('s3:PutObject'))!
    expect(objectStatement.Resource).toContain('arn:aws:s3:::hub-abc-voicemails/*')
    expect(objectStatement.Resource).toContain('arn:aws:s3:::hub-abc-attachments/*')
  })

  it('generates resource ARNs for bucket-level without wildcard suffix', () => {
    const policy = buildBucketPolicy(['hub-abc-voicemails'])
    const statements = policy.Statement as Array<{ Effect: string; Action: string[]; Resource: string[] }>
    const bucketStatement = statements.find(s => s.Action.includes('s3:ListBucket'))!
    expect(bucketStatement.Resource).toContain('arn:aws:s3:::hub-abc-voicemails')
    // Should NOT have /* suffix on bucket-level statement
    expect(bucketStatement.Resource.every(r => !r.endsWith('/*'))).toBe(true)
  })

  it('handles empty bucket list', () => {
    const policy = buildBucketPolicy([])
    const statements = policy.Statement as Array<{ Resource: string[] }>
    for (const stmt of statements) {
      expect(stmt.Resource).toHaveLength(0)
    }
  })

  it('all statements have Effect: Allow', () => {
    const policy = buildBucketPolicy(['bucket'])
    const statements = policy.Statement as Array<{ Effect: string }>
    for (const stmt of statements) {
      expect(stmt.Effect).toBe('Allow')
    }
  })
})

// ---------------------------------------------------------------------------
// createStorageAdmin — auth headers
// ---------------------------------------------------------------------------

describe('createStorageAdmin — auth headers', () => {
  // We test the behavior of available() by intercepting fetch
  let fetchSpy: ReturnType<typeof jest.fn>
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    fetchSpy = jest.fn()
    originalFetch = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('calls /minio/admin/v3/info for availability check', async () => {
    fetchSpy.mockResolvedValueOnce({ status: 200 })
    const admin = createStorageAdmin({
      endpoint: 'http://storage:9000',
      accessKeyId: 'testkey',
      secretAccessKey: 'testsecret',
    })

    const result = await admin.available()

    expect(result).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://storage:9000/minio/admin/v3/info',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('returns true when admin API returns 403 (auth issue but API exists)', async () => {
    fetchSpy.mockResolvedValueOnce({ status: 403 })
    const admin = createStorageAdmin({
      endpoint: 'http://storage:9000',
      accessKeyId: 'k',
      secretAccessKey: 's',
    })
    expect(await admin.available()).toBe(true)
  })

  it('returns false when admin API is unreachable', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const admin = createStorageAdmin({
      endpoint: 'http://storage:9000',
      accessKeyId: 'k',
      secretAccessKey: 's',
    })
    expect(await admin.available()).toBe(false)
  })

  it('caches availability after first check', async () => {
    fetchSpy.mockResolvedValue({ status: 200 })
    const admin = createStorageAdmin({
      endpoint: 'http://storage:9000',
      accessKeyId: 'k',
      secretAccessKey: 's',
    })
    await admin.available()
    await admin.available()
    // Should only have made one fetch call
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('sends Authorization header in Bearer format', async () => {
    fetchSpy.mockResolvedValueOnce({ status: 200 })
    const admin = createStorageAdmin({
      endpoint: 'http://storage:9000',
      accessKeyId: 'mykey',
      secretAccessKey: 'mysecret',
    })
    await admin.available()
    const callHeaders = fetchSpy.mock.calls[0][1].headers as Record<string, string>
    expect(callHeaders['Authorization']).toMatch(/^Bearer mykey:/)
  })

  it('throws when createUser fails with non-409 error', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('server error') })
    const admin = createStorageAdmin({
      endpoint: 'http://storage:9000',
      accessKeyId: 'k',
      secretAccessKey: 's',
    })
    await expect(admin.createUser('user1', 'secret1')).rejects.toThrow('Failed to create IAM user')
  })

  it('does not throw when createUser returns 409 (already exists)', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 409, text: () => Promise.resolve('conflict') })
    const admin = createStorageAdmin({
      endpoint: 'http://storage:9000',
      accessKeyId: 'k',
      secretAccessKey: 's',
    })
    await expect(admin.createUser('user1', 'secret1')).resolves.toBeUndefined()
  })

  it('silently ignores 404 when deleting a non-existent user', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 404 })
    const admin = createStorageAdmin({
      endpoint: 'http://storage:9000',
      accessKeyId: 'k',
      secretAccessKey: 's',
    })
    await expect(admin.deleteUser('nonexistent')).resolves.toBeUndefined()
  })

  it('throws when attachPolicy fails', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('err') })
    const admin = createStorageAdmin({
      endpoint: 'http://storage:9000',
      accessKeyId: 'k',
      secretAccessKey: 's',
    })
    await expect(admin.attachPolicy('mypolicy', 'myuser')).rejects.toThrow('Failed to attach policy')
  })
})
