import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveStorageCredentials, STORAGE_NAMESPACES } from '@worker/lib/storage-manager'

describe('resolveStorageCredentials', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Clear all storage-related env vars
    delete process.env.STORAGE_ENDPOINT
    delete process.env.MINIO_ENDPOINT
    delete process.env.STORAGE_ACCESS_KEY
    delete process.env.STORAGE_SECRET_KEY
    delete process.env.MINIO_APP_USER
    delete process.env.MINIO_APP_PASSWORD
    delete process.env.MINIO_ACCESS_KEY
    delete process.env.MINIO_SECRET_KEY
  })

  afterEach(() => {
    // Restore environment
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('STORAGE_') || key.startsWith('MINIO_')) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  it('uses STORAGE_ACCESS_KEY/STORAGE_SECRET_KEY as primary', () => {
    process.env.STORAGE_ACCESS_KEY = 'primary-key'
    process.env.STORAGE_SECRET_KEY = 'primary-secret'

    const result = resolveStorageCredentials()
    expect(result.accessKeyId).toBe('primary-key')
    expect(result.secretAccessKey).toBe('primary-secret')
  })

  it('falls back to MINIO_APP_USER/MINIO_APP_PASSWORD', () => {
    process.env.MINIO_APP_USER = 'app-user'
    process.env.MINIO_APP_PASSWORD = 'app-pass'

    const result = resolveStorageCredentials()
    expect(result.accessKeyId).toBe('app-user')
    expect(result.secretAccessKey).toBe('app-pass')
  })

  it('falls back to MINIO_ACCESS_KEY/MINIO_SECRET_KEY', () => {
    process.env.MINIO_ACCESS_KEY = 'root-key'
    process.env.MINIO_SECRET_KEY = 'root-secret'

    const result = resolveStorageCredentials()
    expect(result.accessKeyId).toBe('root-key')
    expect(result.secretAccessKey).toBe('root-secret')
  })

  it('prefers STORAGE_ over MINIO_ vars', () => {
    process.env.STORAGE_ACCESS_KEY = 'primary-key'
    process.env.STORAGE_SECRET_KEY = 'primary-secret'
    process.env.MINIO_ACCESS_KEY = 'legacy-key'
    process.env.MINIO_SECRET_KEY = 'legacy-secret'

    const result = resolveStorageCredentials()
    expect(result.accessKeyId).toBe('primary-key')
  })

  it('throws when no credentials are configured', () => {
    expect(() => resolveStorageCredentials()).toThrow('Storage credentials required')
  })

  it('throws when only access key is set (no secret)', () => {
    process.env.STORAGE_ACCESS_KEY = 'key-only'

    expect(() => resolveStorageCredentials()).toThrow('Storage credentials required')
  })

  it('throws when only secret key is set (no access key)', () => {
    process.env.STORAGE_SECRET_KEY = 'secret-only'

    expect(() => resolveStorageCredentials()).toThrow('Storage credentials required')
  })

  it('uses STORAGE_ENDPOINT over MINIO_ENDPOINT', () => {
    process.env.STORAGE_ENDPOINT = 'http://rustfs:9000'
    process.env.MINIO_ENDPOINT = 'http://minio:9000'
    process.env.STORAGE_ACCESS_KEY = 'key'
    process.env.STORAGE_SECRET_KEY = 'secret'

    const result = resolveStorageCredentials()
    expect(result.endpoint).toBe('http://rustfs:9000')
  })

  it('falls back to MINIO_ENDPOINT', () => {
    process.env.MINIO_ENDPOINT = 'http://minio:9000'
    process.env.STORAGE_ACCESS_KEY = 'key'
    process.env.STORAGE_SECRET_KEY = 'secret'

    const result = resolveStorageCredentials()
    expect(result.endpoint).toBe('http://minio:9000')
  })

  it('defaults endpoint to localhost:9000', () => {
    process.env.STORAGE_ACCESS_KEY = 'key'
    process.env.STORAGE_SECRET_KEY = 'secret'

    const result = resolveStorageCredentials()
    expect(result.endpoint).toBe('http://localhost:9000')
  })
})

describe('STORAGE_NAMESPACES', () => {
  it('has voicemails with 365-day retention', () => {
    expect(STORAGE_NAMESPACES.voicemails.defaultRetentionDays).toBe(365)
  })

  it('has attachments with no retention (null)', () => {
    expect(STORAGE_NAMESPACES.attachments.defaultRetentionDays).toBeNull()
  })
})
