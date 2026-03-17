/**
 * Integration tests for MinIO blob storage.
 *
 * Requires a running MinIO instance and these environment variables:
 *   MINIO_ENDPOINT   — e.g., http://localhost:9000
 *   MINIO_ACCESS_KEY — MinIO access key
 *   MINIO_SECRET_KEY — MinIO secret key
 *
 * Tests are skipped if credentials are not set.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createBlobStorage } from '../../../src/platform/bun/blob-storage'
import type { BlobStorage } from '../../../src/platform/types'
import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3'

const hasMinIO = !!(
  process.env.MINIO_ACCESS_KEY &&
  process.env.MINIO_SECRET_KEY
)

describe.skipIf(!hasMinIO)('BlobStorage (MinIO)', () => {
  let blob: BlobStorage
  let testPrefix: string
  let bucket: string

  beforeAll(async () => {
    bucket = `llamenos-test-${Date.now()}`

    // Ensure the test bucket exists
    const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000'
    const client = new S3Client({
      endpoint,
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY!,
        secretAccessKey: process.env.MINIO_SECRET_KEY!,
      },
      forcePathStyle: true,
    })

    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }))
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: bucket }))
    }

    blob = createBlobStorage({ bucket })
  })

  beforeEach(() => {
    testPrefix = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/`
  })

  describe('put/get/delete lifecycle', () => {
    it('puts a string, gets it back, deletes it', async () => {
      const key = `${testPrefix}lifecycle.txt`

      await blob.put(key, 'hello world')

      const result = await blob.get(key)
      expect(result).not.toBeNull()
      expect(result!.size).toBeGreaterThan(0)

      const buf = await result!.arrayBuffer()
      const text = new TextDecoder().decode(buf)
      expect(text).toBe('hello world')

      await blob.delete(key)

      const deleted = await blob.get(key)
      expect(deleted).toBeNull()
    })

    it('overwriting a key replaces the value', async () => {
      const key = `${testPrefix}overwrite.txt`

      await blob.put(key, 'first')
      await blob.put(key, 'second')

      const result = await blob.get(key)
      expect(result).not.toBeNull()
      const text = new TextDecoder().decode(await result!.arrayBuffer())
      expect(text).toBe('second')

      await blob.delete(key)
    })
  })

  describe('content types', () => {
    it('stores and retrieves a Uint8Array', async () => {
      const key = `${testPrefix}uint8.bin`
      const data = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])

      await blob.put(key, data)

      const result = await blob.get(key)
      expect(result).not.toBeNull()

      const retrieved = new Uint8Array(await result!.arrayBuffer())
      expect(retrieved).toEqual(data)

      await blob.delete(key)
    })

    it('stores and retrieves an ArrayBuffer', async () => {
      const key = `${testPrefix}arraybuf.bin`
      const arr = new Uint8Array([10, 20, 30, 40, 50])
      const buf = arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer

      await blob.put(key, buf)

      const result = await blob.get(key)
      expect(result).not.toBeNull()

      const retrieved = new Uint8Array(await result!.arrayBuffer())
      expect(retrieved).toEqual(arr)

      await blob.delete(key)
    })

    it('stores and retrieves a string with unicode', async () => {
      const key = `${testPrefix}unicode.txt`
      const text = 'Hello, Llámenos!'

      await blob.put(key, text)

      const result = await blob.get(key)
      expect(result).not.toBeNull()

      const decoded = new TextDecoder().decode(await result!.arrayBuffer())
      expect(decoded).toBe(text)

      await blob.delete(key)
    })
  })

  describe('missing key', () => {
    it('get() for non-existent key returns null', async () => {
      const result = await blob.get(`${testPrefix}does-not-exist-${Date.now()}`)
      expect(result).toBeNull()
    })

    it('delete() for non-existent key does not throw', async () => {
      await expect(
        blob.delete(`${testPrefix}also-missing-${Date.now()}`)
      ).resolves.toBeUndefined()
    })
  })

  describe('large object', () => {
    it('stores and retrieves a 1MB+ buffer', async () => {
      const key = `${testPrefix}large.bin`
      const size = 1024 * 1024 + 42 // 1MB + 42 bytes
      const data = new Uint8Array(size)
      // Fill with a pattern for verification
      for (let i = 0; i < size; i++) {
        data[i] = i % 256
      }

      await blob.put(key, data)

      const result = await blob.get(key)
      expect(result).not.toBeNull()
      expect(result!.size).toBe(size)

      const retrieved = new Uint8Array(await result!.arrayBuffer())
      expect(retrieved.length).toBe(size)
      // Verify pattern at several offsets
      expect(retrieved[0]).toBe(0)
      expect(retrieved[255]).toBe(255)
      expect(retrieved[256]).toBe(0)
      expect(retrieved[1000]).toBe(1000 % 256)
      expect(retrieved[size - 1]).toBe((size - 1) % 256)

      await blob.delete(key)
    })
  })

  describe('ReadableStream body', () => {
    it('get() returns a readable body that can be consumed', async () => {
      const key = `${testPrefix}stream.txt`
      const content = 'stream test content'

      await blob.put(key, content)

      const result = await blob.get(key)
      expect(result).not.toBeNull()

      // Read via the ReadableStream body
      const reader = result!.body.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      const total = chunks.reduce((s, c) => s + c.length, 0)
      const combined = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.length
      }

      const text = new TextDecoder().decode(combined)
      expect(text).toBe(content)

      await blob.delete(key)
    })
  })
})
