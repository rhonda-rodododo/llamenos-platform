import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildBucketPolicy, createStorageAdmin } from '@worker/lib/storage-admin'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('buildBucketPolicy', () => {
  it('generates correct S3 policy for single bucket', () => {
    const policy = buildBucketPolicy(['hub-abc-voicemails'])
    const stmts = policy.Statement as Array<{ Action: string[]; Resource: string[] }>

    expect(policy.Version).toBe('2012-10-17')
    expect(stmts).toHaveLength(2)

    // Object actions
    expect(stmts[0].Resource).toEqual(['arn:aws:s3:::hub-abc-voicemails/*'])

    // Bucket actions
    expect(stmts[1].Resource).toEqual(['arn:aws:s3:::hub-abc-voicemails'])
  })

  it('generates policy for multiple buckets', () => {
    const policy = buildBucketPolicy(['hub-abc-voicemails', 'hub-abc-attachments'])
    const stmts = policy.Statement as Array<{ Action: string[]; Resource: string[] }>

    expect(stmts[0].Resource).toHaveLength(2)
    expect(stmts[0].Resource).toContain('arn:aws:s3:::hub-abc-voicemails/*')
    expect(stmts[0].Resource).toContain('arn:aws:s3:::hub-abc-attachments/*')
  })

  it('includes correct S3 actions', () => {
    const policy = buildBucketPolicy(['test-bucket'])
    const stmts = policy.Statement as Array<{ Action: string[]; Resource: string[] }>

    expect(stmts[0].Action).toContain('s3:GetObject')
    expect(stmts[0].Action).toContain('s3:PutObject')
    expect(stmts[0].Action).toContain('s3:DeleteObject')

    expect(stmts[1].Action).toContain('s3:ListBucket')
    expect(stmts[1].Action).toContain('s3:GetBucketLocation')
  })

  it('handles empty bucket list', () => {
    const policy = buildBucketPolicy([])
    const stmts = policy.Statement as Array<{ Action: string[]; Resource: string[] }>
    expect(stmts[0].Resource).toEqual([])
  })
})

describe('createStorageAdmin', () => {
  let admin: ReturnType<typeof createStorageAdmin>

  beforeEach(() => {
    mockFetch.mockReset()
    admin = createStorageAdmin({
      endpoint: 'http://storage:9000',
      accessKeyId: 'admin-key',
      secretAccessKey: 'admin-secret',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('available()', () => {
    it('returns true when admin info endpoint returns 200', async () => {
      mockFetch.mockResolvedValueOnce({ status: 200 })

      const result = await admin.available()
      expect(result).toBe(true)
      expect(mockFetch.mock.calls[0][0]).toBe('http://storage:9000/admin/v3/info')
    })

    it('returns true when admin info endpoint returns 403 (API exists but auth issue)', async () => {
      mockFetch.mockResolvedValueOnce({ status: 403 })

      const result = await admin.available()
      expect(result).toBe(true)
    })

    it('returns false when admin API is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const result = await admin.available()
      expect(result).toBe(false)
    })

    it('returns false on non-200/403 status', async () => {
      mockFetch.mockResolvedValueOnce({ status: 404 })

      const result = await admin.available()
      expect(result).toBe(false)
    })

    it('caches availability check result', async () => {
      mockFetch.mockResolvedValueOnce({ status: 200 })

      await admin.available()
      const result2 = await admin.available()

      // Should only call fetch once (cached)
      expect(mockFetch).toHaveBeenCalledOnce()
      expect(result2).toBe(true)
    })
  })

  describe('createUser()', () => {
    it('sends PUT with access key and secret', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await admin.createUser('hub-user-abc', 'user-secret-xyz')

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://storage:9000/admin/v3/add-user?accessKey=hub-user-abc')
      expect(opts.method).toBe('PUT')
      const body = JSON.parse(opts.body)
      expect(body.secretKey).toBe('user-secret-xyz')
      expect(body.status).toBe('enabled')
    })

    it('ignores 409 conflict (user already exists)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 409, text: async () => 'Conflict' })

      // Should not throw
      await admin.createUser('existing-user', 'secret')
    })

    it('throws on other error statuses', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal error' })

      await expect(admin.createUser('bad-user', 'secret')).rejects.toThrow(
        'Failed to create IAM user bad-user: 500',
      )
    })

    it('includes Authorization header with HMAC token', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await admin.createUser('test', 'secret')

      const authHeader = mockFetch.mock.calls[0][1].headers.Authorization as string
      expect(authHeader).toMatch(/^Bearer admin-key:/)
    })
  })

  describe('deleteUser()', () => {
    it('sends DELETE with access key', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await admin.deleteUser('hub-user-del')

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://storage:9000/admin/v3/remove-user?accessKey=hub-user-del')
      expect(opts.method).toBe('DELETE')
    })

    it('is idempotent — ignores 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      // Should not throw
      await admin.deleteUser('already-gone')
    })

    it('is idempotent — ignores fetch errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network down'))

      // Should not throw
      await admin.deleteUser('unreachable-user')
    })
  })

  describe('createPolicy()', () => {
    it('sends PUT with policy document', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      const policy = buildBucketPolicy(['test-bucket'])
      await admin.createPolicy('test-policy', policy)

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://storage:9000/admin/v3/add-canned-policy?name=test-policy')
      expect(opts.method).toBe('PUT')
      const body = JSON.parse(opts.body)
      expect(body.Version).toBe('2012-10-17')
    })

    it('ignores 409 conflict', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 409, text: async () => 'Conflict' })

      await admin.createPolicy('existing-policy', {})
    })
  })

  describe('deletePolicy()', () => {
    it('sends DELETE for policy name', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await admin.deletePolicy('hub-policy')

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://storage:9000/admin/v3/remove-canned-policy?name=hub-policy')
      expect(opts.method).toBe('DELETE')
    })

    it('is idempotent — ignores 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      await admin.deletePolicy('gone-policy')
    })
  })

  describe('attachPolicy()', () => {
    it('sends PUT with policy and user params', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await admin.attachPolicy('my-policy', 'my-user')

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toContain('set-user-or-group-policy')
      expect(url).toContain('userOrGroup=my-user')
      expect(url).toContain('isGroup=false')
      expect(url).toContain('policyName=my-policy')
      expect(opts.method).toBe('PUT')
    })

    it('throws on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'Access denied' })

      await expect(admin.attachPolicy('locked-policy', 'user')).rejects.toThrow(
        'Failed to attach policy locked-policy to user',
      )
    })
  })

  describe('URL encoding', () => {
    it('encodes special characters in access key', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await admin.createUser('user+with/special=chars', 'secret')

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(encodeURIComponent('user+with/special=chars'))
    })

    it('encodes special characters in policy name', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })

      await admin.createPolicy('policy/with spaces', {})

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain(encodeURIComponent('policy/with spaces'))
    })
  })
})
