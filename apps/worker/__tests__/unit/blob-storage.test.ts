import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBlobStorage } from '@worker/lib/blob-storage'

// ---------------------------------------------------------------------------
// Mock @aws-sdk/client-s3
// ---------------------------------------------------------------------------

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = mockSend
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  class GetObjectCommand {
    constructor(public input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(public input: unknown) {}
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand }
})

function makeStorageWithCreds() {
  return createBlobStorage({
    endpoint: 'http://storage:9000',
    accessKeyId: 'testkey',
    secretAccessKey: 'testsecret',
    bucket: 'test-bucket',
  })
}

beforeEach(() => {
  mockSend.mockReset()
})

afterEach(() => {
  // vi.unstubAllEnvs is not available in bun vitest compat — restore manually
  delete process.env.STORAGE_ACCESS_KEY
  delete process.env.STORAGE_SECRET_KEY
})

// ---------------------------------------------------------------------------
// createBlobStorage — credential checks
// ---------------------------------------------------------------------------

describe('createBlobStorage — credentials', () => {
  it('throws when no credentials provided and env vars are absent', () => {
    const savedKey = process.env.STORAGE_ACCESS_KEY
    const savedSecret = process.env.STORAGE_SECRET_KEY
    delete process.env.STORAGE_ACCESS_KEY
    delete process.env.STORAGE_SECRET_KEY
    try {
      expect(() => createBlobStorage()).toThrow(/credentials required/)
    } finally {
      if (savedKey !== undefined) process.env.STORAGE_ACCESS_KEY = savedKey
      if (savedSecret !== undefined) process.env.STORAGE_SECRET_KEY = savedSecret
    }
  })

  it('reads credentials from STORAGE_* env vars', () => {
    process.env.STORAGE_ACCESS_KEY = 'env-key'
    process.env.STORAGE_SECRET_KEY = 'env-secret'
    // Should not throw
    expect(() => createBlobStorage()).not.toThrow()
  })

  it('prefers explicit opts over env vars', () => {
    // Should not throw
    expect(() => createBlobStorage({
      accessKeyId: 'explicit-key',
      secretAccessKey: 'explicit-secret',
    })).not.toThrow()
  })

  // Bug fix test: MINIO_* legacy vars trigger deprecation warning, STORAGE_* do not
  it('does NOT warn when using STORAGE_* env vars (bug fix: was warning on correct vars)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      createBlobStorage({
        endpoint: 'http://test:9000',
        accessKeyId: 'k',
        secretAccessKey: 's',
      })
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('warns when using legacy MINIO_* env vars', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const savedKey = process.env.MINIO_ACCESS_KEY
    process.env.MINIO_ACCESS_KEY = 'legacy-key'
    try {
      createBlobStorage({
        endpoint: 'http://test:9000',
        accessKeyId: 'k',
        secretAccessKey: 's',
      })
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEPRECATED'))
    } finally {
      warnSpy.mockRestore()
      if (savedKey !== undefined) process.env.MINIO_ACCESS_KEY = savedKey
      else delete process.env.MINIO_ACCESS_KEY
    }
  })
})

// ---------------------------------------------------------------------------
// put
// ---------------------------------------------------------------------------

describe('BlobStorage.put', () => {
  it('sends PutObjectCommand with string body', async () => {
    mockSend.mockResolvedValueOnce({})
    const storage = makeStorageWithCreds()
    await storage.put('my/key', 'hello world')
    expect(mockSend).toHaveBeenCalledOnce()
    const cmd = mockSend.mock.calls[0][0]
    expect(cmd.input).toMatchObject({ Bucket: 'test-bucket', Key: 'my/key', Body: 'hello world' })
  })

  it('sends PutObjectCommand with Uint8Array body', async () => {
    mockSend.mockResolvedValueOnce({})
    const storage = makeStorageWithCreds()
    const bytes = new Uint8Array([1, 2, 3])
    await storage.put('my/key', bytes)
    expect(mockSend).toHaveBeenCalledOnce()
    const cmd = mockSend.mock.calls[0][0]
    expect(cmd.input.Body).toEqual(bytes)
  })

  it('sends PutObjectCommand with ArrayBuffer (converts to Uint8Array)', async () => {
    mockSend.mockResolvedValueOnce({})
    const storage = makeStorageWithCreds()
    const buf = new Uint8Array([10, 20]).buffer
    await storage.put('my/key', buf)
    const cmd = mockSend.mock.calls[0][0]
    expect(cmd.input.Body).toBeInstanceOf(Uint8Array)
    expect(Array.from(cmd.input.Body as Uint8Array)).toEqual([10, 20])
  })

  it('sends PutObjectCommand with ReadableStream body', async () => {
    mockSend.mockResolvedValueOnce({})
    const storage = makeStorageWithCreds()
    const data = new Uint8Array([5, 6, 7])
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data)
        controller.close()
      },
    })
    await storage.put('stream/key', stream)
    const cmd = mockSend.mock.calls[0][0]
    expect(cmd.input.Body).toBeInstanceOf(Uint8Array)
    expect(Array.from(cmd.input.Body as Uint8Array)).toEqual([5, 6, 7])
  })

  it('propagates S3 errors', async () => {
    mockSend.mockRejectedValueOnce(new Error('S3 error'))
    const storage = makeStorageWithCreds()
    await expect(storage.put('key', 'data')).rejects.toThrow('S3 error')
  })
})

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('BlobStorage.get', () => {
  it('returns null when key does not exist (NoSuchKey)', async () => {
    const err = Object.assign(new Error('no such key'), { name: 'NoSuchKey' })
    mockSend.mockRejectedValueOnce(err)
    const storage = makeStorageWithCreds()
    const result = await storage.get('missing/key')
    expect(result).toBeNull()
  })

  it('rethrows non-NoSuchKey errors', async () => {
    const err = Object.assign(new Error('access denied'), { name: 'AccessDenied' })
    mockSend.mockRejectedValueOnce(err)
    const storage = makeStorageWithCreds()
    await expect(storage.get('key')).rejects.toThrow('access denied')
  })

  it('returns null when body is absent', async () => {
    mockSend.mockResolvedValueOnce({ Body: null, ContentLength: 0 })
    const storage = makeStorageWithCreds()
    const result = await storage.get('key')
    expect(result).toBeNull()
  })

  it('returns body as ReadableStream with correct size', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToByteArray: () => Promise.resolve(bytes),
      },
      ContentLength: 3,
    })
    const storage = makeStorageWithCreds()
    const result = await storage.get('key')
    expect(result).not.toBeNull()
    expect(result!.size).toBe(3)
    expect(result!.body).toBeInstanceOf(ReadableStream)
  })

  it('arrayBuffer() resolves to the correct bytes', async () => {
    const bytes = new Uint8Array([10, 20, 30])
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToByteArray: () => Promise.resolve(bytes),
      },
      ContentLength: 3,
    })
    const storage = makeStorageWithCreds()
    const result = await storage.get('key')
    const buf = await result!.arrayBuffer()
    expect(new Uint8Array(buf)).toEqual(bytes)
  })
})

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('BlobStorage.delete', () => {
  it('sends DeleteObjectCommand', async () => {
    mockSend.mockResolvedValueOnce({})
    const storage = makeStorageWithCreds()
    await storage.delete('del/key')
    expect(mockSend).toHaveBeenCalledOnce()
    const cmd = mockSend.mock.calls[0][0]
    expect(cmd.input).toMatchObject({ Bucket: 'test-bucket', Key: 'del/key' })
  })

  it('propagates S3 errors on delete', async () => {
    mockSend.mockRejectedValueOnce(new Error('permission denied'))
    const storage = makeStorageWithCreds()
    await expect(storage.delete('key')).rejects.toThrow('permission denied')
  })
})
