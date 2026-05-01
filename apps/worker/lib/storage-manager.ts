/**
 * Hub-aware, namespace-scoped object storage manager.
 * Uses S3-compatible API (RustFS / MinIO) with per-hub bucket isolation.
 *
 * Bucket naming: `{hubId}-{namespace}` (e.g., `hub-abc123-voicemails`)
 *
 * Credential priority:
 *   1. STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY — preferred (provider-agnostic)
 *   2. MINIO_APP_USER / MINIO_APP_PASSWORD — dedicated app IAM user (legacy)
 *   3. MINIO_ACCESS_KEY / MINIO_SECRET_KEY — root credentials (legacy dev fallback)
 *
 * Per-hub IAM isolation:
 *   When a StorageAdminClient is provided and available, provisionHub() creates
 *   a dedicated IAM user + bucket-scoped policy per hub. destroyHub() cleans up.
 *   If the admin client is unavailable, falls back to root credentials (existing behavior).
 */
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { bytesToHex } from '@noble/hashes/utils.js'
import { createLogger } from './logger'
import type { StorageAdminClient } from './storage-admin'
import { buildBucketPolicy } from './storage-admin'

const log = createLogger('lib.storage-manager')

export const STORAGE_NAMESPACES = {
  voicemails: { defaultRetentionDays: 365 },
  attachments: { defaultRetentionDays: null },
} as const

export type StorageNamespace = keyof typeof STORAGE_NAMESPACES

export interface BlobResult {
  body: ReadableStream
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface HubStorageCredentialResult {
  accessKeyId: string
  secretAccessKey: string
  policyName: string
  userName: string
}

export interface StorageManager {
  put(hubId: string, namespace: StorageNamespace, key: string, body: ReadableStream | ArrayBuffer | Uint8Array | string): Promise<void>
  get(hubId: string, namespace: StorageNamespace, key: string): Promise<BlobResult | null>
  delete(hubId: string, namespace: StorageNamespace, key: string): Promise<void>
  provisionHub(hubId: string): Promise<HubStorageCredentialResult | undefined>
  destroyHub(hubId: string, userName?: string): Promise<void>
  setRetention(hubId: string, namespace: StorageNamespace, days: number | null): Promise<void>
  healthy(): Promise<boolean>
  withCredentials(newAccessKeyId: string, newSecretAccessKey: string): StorageManager
}

function bucketName(hubId: string, namespace: StorageNamespace): string {
  return `${hubId}-${namespace}`
}

/**
 * Collect a ReadableStream | ArrayBuffer | Uint8Array | string into bytes for S3 PutObject.
 */
async function toBytes(
  body: ReadableStream | ArrayBuffer | Uint8Array | string
): Promise<Uint8Array | string> {
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (body instanceof Uint8Array) return body
  if (typeof body === 'string') return body

  // ReadableStream — collect into buffer
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/** Generate a cryptographically random hex string of `byteLength` bytes. */
function randomHex(byteLength: number): string {
  const buf = new Uint8Array(byteLength)
  crypto.getRandomValues(buf)
  return bytesToHex(buf)
}

export interface StorageManagerOptions {
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
  region?: string
  /** Optional admin client for per-hub IAM isolation */
  admin?: StorageAdminClient
}

export function resolveStorageCredentials(): {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
} {
  // Endpoint priority
  const endpoint =
    process.env.STORAGE_ENDPOINT || process.env.MINIO_ENDPOINT || 'http://localhost:9000'

  // Access key priority with deprecation warnings
  let accessKeyId = process.env.STORAGE_ACCESS_KEY
  if (!accessKeyId) {
    if (process.env.MINIO_APP_USER) {
      log.warn('MINIO_APP_USER is deprecated, use STORAGE_ACCESS_KEY instead')
      accessKeyId = process.env.MINIO_APP_USER
    } else if (process.env.MINIO_ACCESS_KEY) {
      log.warn('MINIO_ACCESS_KEY is deprecated, use STORAGE_ACCESS_KEY instead')
      accessKeyId = process.env.MINIO_ACCESS_KEY
    }
  }

  // Secret key priority with deprecation warnings
  let secretAccessKey = process.env.STORAGE_SECRET_KEY
  if (!secretAccessKey) {
    if (process.env.MINIO_APP_PASSWORD) {
      log.warn('MINIO_APP_PASSWORD is deprecated, use STORAGE_SECRET_KEY instead')
      secretAccessKey = process.env.MINIO_APP_PASSWORD
    } else if (process.env.MINIO_SECRET_KEY) {
      log.warn('MINIO_SECRET_KEY is deprecated, use STORAGE_SECRET_KEY instead')
      secretAccessKey = process.env.MINIO_SECRET_KEY
    }
  }

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'Storage credentials required: set STORAGE_ACCESS_KEY/STORAGE_SECRET_KEY ' +
        '(or legacy MINIO_APP_USER/MINIO_APP_PASSWORD, MINIO_ACCESS_KEY/MINIO_SECRET_KEY)'
    )
  }

  return { endpoint, accessKeyId, secretAccessKey }
}

export function createStorageManager(opts?: StorageManagerOptions): StorageManager {
  const resolved =
    opts?.accessKeyId && opts?.secretAccessKey
      ? {
          endpoint: opts.endpoint || 'http://localhost:9000',
          accessKeyId: opts.accessKeyId,
          secretAccessKey: opts.secretAccessKey,
        }
      : resolveStorageCredentials()

  const endpoint = opts?.endpoint || resolved.endpoint
  const region = opts?.region || 'us-east-1'
  const admin = opts?.admin

  const client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: resolved.accessKeyId,
      secretAccessKey: resolved.secretAccessKey,
    },
    forcePathStyle: true, // Required for S3-compatible stores (RustFS, MinIO)
  })

  const namespaces = Object.keys(STORAGE_NAMESPACES) as StorageNamespace[]

  function buildManager(s3: S3Client, adminClient?: StorageAdminClient): StorageManager {
    return {
      async put(hubId, namespace, key, body) {
        const bodyBytes = await toBytes(body)
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName(hubId, namespace),
            Key: key,
            Body: bodyBytes,
          })
        )
      },

      async get(hubId, namespace, key): Promise<BlobResult | null> {
        try {
          const result = await s3.send(
            new GetObjectCommand({
              Bucket: bucketName(hubId, namespace),
              Key: key,
            })
          )
          if (!result.Body) return null

          const size = result.ContentLength ?? 0
          const bodyBytes = await result.Body.transformToByteArray()

          return {
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(bodyBytes)
                controller.close()
              },
            }),
            size,
            async arrayBuffer() {
              return bodyBytes.buffer.slice(
                bodyBytes.byteOffset,
                bodyBytes.byteOffset + bodyBytes.byteLength
              ) as ArrayBuffer
            },
          }
        } catch (err: unknown) {
          if ((err as { name?: string }).name === 'NoSuchKey') return null
          if ((err as { name?: string }).name === 'NoSuchBucket') return null
          throw err
        }
      },

      async delete(hubId, namespace, key) {
        try {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: bucketName(hubId, namespace),
              Key: key,
            })
          )
        } catch (err: unknown) {
          // Deleting from a non-existent bucket is not an error
          if ((err as { name?: string }).name === 'NoSuchBucket') return
          throw err
        }
      },

      async provisionHub(hubId): Promise<HubStorageCredentialResult | undefined> {
        // Create buckets
        for (const ns of namespaces) {
          const bucket = bucketName(hubId, ns)

          try {
            await s3.send(new CreateBucketCommand({ Bucket: bucket }))
          } catch (err: unknown) {
            const name = (err as { name?: string }).name
            if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') {
              throw err
            }
          }

          // SSE-S3 defense-in-depth
          if (process.env.STORAGE_SSE_ENABLED === 'true') {
            try {
              await s3.send(
                new PutBucketEncryptionCommand({
                  Bucket: bucket,
                  ServerSideEncryptionConfiguration: {
                    Rules: [
                      {
                        ApplyServerSideEncryptionByDefault: {
                          SSEAlgorithm: 'AES256',
                        },
                      },
                    ],
                  },
                })
              )
            } catch (err) {
              log.warn('SSE-S3 failed — KMS may not be configured', {
                bucket,
                err: (err as Error).message,
              })
            }
          }

          // Lifecycle retention policy
          const retentionDays = STORAGE_NAMESPACES[ns].defaultRetentionDays
          if (retentionDays !== null) {
            await s3.send(
              new PutBucketLifecycleConfigurationCommand({
                Bucket: bucket,
                LifecycleConfiguration: {
                  Rules: [
                    {
                      ID: `${ns}-retention`,
                      Status: 'Enabled',
                      Expiration: { Days: retentionDays },
                      Filter: { Prefix: '' },
                    },
                  ],
                },
              })
            )
          }
        }

        // Create per-hub IAM user + policy if admin client is available
        if (adminClient && (await adminClient.available())) {
          const hubPrefix = hubId.slice(0, 8)
          const accessKeyId = `hub-${hubPrefix}-${randomHex(8)}`
          const secretAccessKey = randomHex(32)
          const userName = accessKeyId
          const policyName = `hub-${hubPrefix}-policy`

          const hubBuckets = namespaces.map((ns) => bucketName(hubId, ns))
          const policy = buildBucketPolicy(hubBuckets)

          await adminClient.createUser(accessKeyId, secretAccessKey)
          await adminClient.createPolicy(policyName, policy)
          await adminClient.attachPolicy(policyName, userName)

          log.info('Created IAM user for hub', { userName, hubId })

          return { accessKeyId, secretAccessKey, policyName, userName }
        }

        return undefined
      },

      async destroyHub(hubId, userName?) {
        // Clean up IAM resources first (if admin client available)
        if (adminClient && (await adminClient.available())) {
          const hubPrefix = hubId.slice(0, 8)
          const policyName = `hub-${hubPrefix}-policy`

          // Delete IAM user if caller provided the userName from DB
          if (userName) {
            await adminClient.deleteUser(userName)
          }
          await adminClient.deletePolicy(policyName)
        }

        // Delete all objects and buckets
        for (const ns of namespaces) {
          const bucket = bucketName(hubId, ns)

          let continuationToken: string | undefined
          do {
            let response: ListObjectsV2CommandOutput
            try {
              response = await s3.send(
                new ListObjectsV2Command({
                  Bucket: bucket,
                  ContinuationToken: continuationToken,
                  MaxKeys: 1000,
                })
              )
            } catch (err: unknown) {
              if ((err as { name?: string }).name === 'NoSuchBucket') break
              throw err
            }

            const objects = response.Contents
            if (objects && objects.length > 0) {
              await s3.send(
                new DeleteObjectsCommand({
                  Bucket: bucket,
                  Delete: {
                    Objects: objects.map((o: { Key?: string }) => ({ Key: o.Key })),
                    Quiet: true,
                  },
                })
              )
            }

            continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
          } while (continuationToken)

          try {
            await s3.send(new DeleteBucketCommand({ Bucket: bucket }))
          } catch (err: unknown) {
            if ((err as { name?: string }).name === 'NoSuchBucket') continue
            throw err
          }
        }
      },

      async setRetention(hubId, namespace, days) {
        const bucket = bucketName(hubId, namespace)
        if (days === null) {
          await s3.send(
            new PutBucketLifecycleConfigurationCommand({
              Bucket: bucket,
              LifecycleConfiguration: { Rules: [] },
            })
          )
        } else {
          await s3.send(
            new PutBucketLifecycleConfigurationCommand({
              Bucket: bucket,
              LifecycleConfiguration: {
                Rules: [
                  {
                    ID: `${namespace}-retention`,
                    Status: 'Enabled',
                    Expiration: { Days: days },
                    Filter: { Prefix: '' },
                  },
                ],
              },
            })
          )
        }
      },

      async healthy(): Promise<boolean> {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000)
          const healthUrl = `${endpoint}/health`
          const response = await fetch(healthUrl, { signal: controller.signal })
          clearTimeout(timeout)
          return response.ok
        } catch {
          return false
        }
      },

      withCredentials(newAccessKeyId: string, newSecretAccessKey: string): StorageManager {
        const hubClient = new S3Client({
          endpoint,
          region,
          credentials: {
            accessKeyId: newAccessKeyId,
            secretAccessKey: newSecretAccessKey,
          },
          forcePathStyle: true,
        })
        // Hub-scoped client does not get admin capabilities
        return buildManager(hubClient)
      },
    }
  }

  return buildManager(client, admin)
}
