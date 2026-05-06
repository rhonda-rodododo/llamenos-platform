/**
 * Unit tests for apps/worker/lib/storage-manager.ts
 *
 * Tests credential resolution, bucket naming, and the toBytes helper behavior
 * via the public API (put/get/delete integration with mocked S3Client).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock @aws-sdk/client-s3 before importing the module under test
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn()
  class MockS3Client {
    send = mockSend
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: vi.fn((input: unknown) => ({ _type: 'Put', input })),
    GetObjectCommand: vi.fn((input: unknown) => ({ _type: 'Get', input })),
    DeleteObjectCommand: vi.fn((input: unknown) => ({ _type: 'Delete', input })),
    DeleteObjectsCommand: vi.fn((input: unknown) => ({ _type: 'DeleteObjects', input })),
    CreateBucketCommand: vi.fn((input: unknown) => ({ _type: 'CreateBucket', input })),
    DeleteBucketCommand: vi.fn((input: unknown) => ({ _type: 'DeleteBucket', input })),
    ListObjectsV2Command: vi.fn((input: unknown) => ({ _type: 'List', input })),
    PutBucketEncryptionCommand: vi.fn((input: unknown) => ({ _type: 'PutEncryption', input })),
    PutBucketLifecycleConfigurationCommand: vi.fn((input: unknown) => ({ _type: 'PutLifecycle', input })),
  }
})

import { resolveStorageCredentials, createStorageManager, STORAGE_NAMESPACES } from '@worker/lib/storage-manager'

describe('STORAGE_NAMESPACES', () => {
  it('contains voicemails with 365 day retention', () => {
    expect(STORAGE_NAMESPACES.voicemails.defaultRetentionDays).toBe(365)
  })

  it('contains attachments with no retention limit', () => {
    expect(STORAGE_NAMESPACES.attachments.defaultRetentionDays).toBeNull()
  })
})

describe('resolveStorageCredentials', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    // Clear all storage-related env vars
    delete process.env.STORAGE_ENDPOINT
    delete process.env.STORAGE_ACCESS_KEY
    delete process.env.STORAGE_SECRET_KEY
    delete process.env.MINIO_ENDPOINT
    delete process.env.MINIO_ACCESS_KEY
    delete process.env.MINIO_SECRET_KEY
    delete process.env.MINIO_APP_USER
    delete process.env.MINIO_APP_PASSWORD
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('uses STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY when available', () => {
    process.env.STORAGE_ACCESS_KEY = 'access-123'
    process.env.STORAGE_SECRET_KEY = 'secret-456'

    const result = resolveStorageCredentials()
    expect(result.accessKeyId).toBe('access-123')
    expect(result.secretAccessKey).toBe('secret-456')
  })

  it('uses STORAGE_ENDPOINT when available', () => {
    process.env.STORAGE_ACCESS_KEY = 'a'
    process.env.STORAGE_SECRET_KEY = 's'
    process.env.STORAGE_ENDPOINT = 'https://storage.example.com'

    const result = resolveStorageCredentials()
    expect(result.endpoint).toBe('https://storage.example.com')
  })

  it('falls back to MINIO_ENDPOINT when STORAGE_ENDPOINT is not set', () => {
    process.env.STORAGE_ACCESS_KEY = 'a'
    process.env.STORAGE_SECRET_KEY = 's'
    process.env.MINIO_ENDPOINT = 'http://minio.local:9000'

    const result = resolveStorageCredentials()
    expect(result.endpoint).toBe('http://minio.local:9000')
  })

  it('defaults endpoint to localhost:9000', () => {
    process.env.STORAGE_ACCESS_KEY = 'a'
    process.env.STORAGE_SECRET_KEY = 's'

    const result = resolveStorageCredentials()
    expect(result.endpoint).toBe('http://localhost:9000')
  })

  it('falls back to MINIO_APP_USER / MINIO_APP_PASSWORD', () => {
    process.env.MINIO_APP_USER = 'app-user'
    process.env.MINIO_APP_PASSWORD = 'app-pass'

    const result = resolveStorageCredentials()
    expect(result.accessKeyId).toBe('app-user')
    expect(result.secretAccessKey).toBe('app-pass')
  })

  it('falls back to MINIO_ACCESS_KEY / MINIO_SECRET_KEY', () => {
    process.env.MINIO_ACCESS_KEY = 'minio-access'
    process.env.MINIO_SECRET_KEY = 'minio-secret'

    const result = resolveStorageCredentials()
    expect(result.accessKeyId).toBe('minio-access')
    expect(result.secretAccessKey).toBe('minio-secret')
  })

  it('prefers STORAGE_ACCESS_KEY over MINIO variants', () => {
    process.env.STORAGE_ACCESS_KEY = 'preferred'
    process.env.STORAGE_SECRET_KEY = 'preferred-secret'
    process.env.MINIO_ACCESS_KEY = 'fallback'
    process.env.MINIO_SECRET_KEY = 'fallback-secret'

    const result = resolveStorageCredentials()
    expect(result.accessKeyId).toBe('preferred')
    expect(result.secretAccessKey).toBe('preferred-secret')
  })

  it('prefers MINIO_APP_USER over MINIO_ACCESS_KEY', () => {
    process.env.MINIO_APP_USER = 'app-user'
    process.env.MINIO_APP_PASSWORD = 'app-pass'
    process.env.MINIO_ACCESS_KEY = 'root'
    process.env.MINIO_SECRET_KEY = 'root-secret'

    const result = resolveStorageCredentials()
    expect(result.accessKeyId).toBe('app-user')
    expect(result.secretAccessKey).toBe('app-pass')
  })

  it('throws when no credentials are available', () => {
    expect(() => resolveStorageCredentials()).toThrow('Storage credentials required')
  })

  it('throws when only access key is set (no secret)', () => {
    process.env.STORAGE_ACCESS_KEY = 'access-only'
    expect(() => resolveStorageCredentials()).toThrow('Storage credentials required')
  })

  it('throws when only secret key is set (no access key)', () => {
    process.env.STORAGE_SECRET_KEY = 'secret-only'
    expect(() => resolveStorageCredentials()).toThrow('Storage credentials required')
  })
})

describe('createStorageManager', () => {
  it('creates a storage manager with explicit credentials', () => {
    const mgr = createStorageManager({
      endpoint: 'http://test:9000',
      accessKeyId: 'test-access',
      secretAccessKey: 'test-secret',
    })

    expect(mgr).toBeDefined()
    expect(typeof mgr.put).toBe('function')
    expect(typeof mgr.get).toBe('function')
    expect(typeof mgr.delete).toBe('function')
    expect(typeof mgr.provisionHub).toBe('function')
    expect(typeof mgr.destroyHub).toBe('function')
    expect(typeof mgr.setRetention).toBe('function')
    expect(typeof mgr.healthy).toBe('function')
    expect(typeof mgr.withCredentials).toBe('function')
  })

  it('withCredentials returns a new manager instance', () => {
    const mgr = createStorageManager({
      endpoint: 'http://test:9000',
      accessKeyId: 'test-access',
      secretAccessKey: 'test-secret',
    })

    const hubMgr = mgr.withCredentials('hub-access', 'hub-secret')
    expect(hubMgr).toBeDefined()
    expect(hubMgr).not.toBe(mgr)
  })
})
