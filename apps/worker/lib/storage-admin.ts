/**
 * RustFS/MinIO admin IAM client — manages per-hub users and bucket-scoped policies.
 *
 * Uses direct HTTP calls to the MinIO-compatible admin API at /minio/admin/v3/.
 * Auth: root credentials sent via the standard MinIO admin auth header.
 *
 * If the admin API is unavailable (older RustFS version, network issue), the client
 * degrades gracefully: `available()` returns false. Callers should check before invoking.
 */
import { createHmac } from 'node:crypto'
import { createLogger } from './logger'

const log = createLogger('lib.storage-admin')

export interface StorageAdminClient {
  /** Whether the admin API is reachable */
  available(): Promise<boolean>
  /** Create a new IAM user with the given credentials */
  createUser(accessKey: string, secretKey: string): Promise<void>
  /** Delete an IAM user (idempotent — ignores already-deleted) */
  deleteUser(accessKey: string): Promise<void>
  /** Create a named IAM policy from a policy document */
  createPolicy(name: string, policy: Record<string, unknown>): Promise<void>
  /** Delete a named IAM policy (idempotent) */
  deletePolicy(name: string): Promise<void>
  /** Attach a policy to a user */
  attachPolicy(policyName: string, userName: string): Promise<void>
}

/**
 * Build a bucket-scoped S3 policy document allowing GetObject, PutObject,
 * DeleteObject, and ListBucket on a set of bucket names.
 */
export function buildBucketPolicy(bucketNames: string[]): Record<string, unknown> {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        Resource: bucketNames.map((b) => `arn:aws:s3:::${b}/*`),
      },
      {
        Effect: 'Allow',
        Action: ['s3:ListBucket', 's3:GetBucketLocation'],
        Resource: bucketNames.map((b) => `arn:aws:s3:::${b}`),
      },
    ],
  }
}

/**
 * Create an admin API client for RustFS/MinIO IAM operations.
 * Uses HTTP calls to the /minio/admin/v3/ endpoints with bearer auth.
 */
export function createStorageAdmin(opts: {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
}): StorageAdminClient {
  const { endpoint, accessKeyId, secretAccessKey } = opts

  /**
   * MinIO admin API auth: generate a bearer token by signing the access key
   * with the secret key using HMAC-SHA256.
   */
  function authHeaders(): Record<string, string> {
    const token = createHmac('sha256', secretAccessKey).update(accessKeyId).digest('hex')
    return {
      Authorization: `Bearer ${accessKeyId}:${token}`,
      'Content-Type': 'application/json',
    }
  }

  async function adminFetch(path: string, method: string, body?: string): Promise<Response> {
    const url = `${endpoint}/minio/admin/v3${path}`
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body,
      signal: AbortSignal.timeout(10000),
    })
    return res
  }

  let cachedAvailability: boolean | null = null

  return {
    async available(): Promise<boolean> {
      if (cachedAvailability !== null) return cachedAvailability
      try {
        // Probe the admin info endpoint
        const res = await adminFetch('/info', 'GET')
        // 200 = works, 403 = auth issue but API exists
        cachedAvailability = res.status === 200 || res.status === 403
      } catch {
        cachedAvailability = false
      }
      return cachedAvailability
    },

    async createUser(accessKey: string, userSecretKey: string): Promise<void> {
      const res = await adminFetch(
        `/add-user?accessKey=${encodeURIComponent(accessKey)}`,
        'PUT',
        JSON.stringify({ secretKey: userSecretKey, status: 'enabled' })
      )
      if (!res.ok && res.status !== 409) {
        throw new Error(`Failed to create IAM user ${accessKey}: ${res.status} ${await res.text()}`)
      }
    },

    async deleteUser(accessKey: string): Promise<void> {
      try {
        const res = await adminFetch(
          `/remove-user?accessKey=${encodeURIComponent(accessKey)}`,
          'DELETE'
        )
        if (!res.ok && res.status !== 404) {
          log.warn('Failed to delete user', { accessKey, status: res.status })
        }
      } catch {
        // Idempotent — user may already be gone
      }
    },

    async createPolicy(name: string, policy: Record<string, unknown>): Promise<void> {
      const res = await adminFetch(
        `/add-canned-policy?name=${encodeURIComponent(name)}`,
        'PUT',
        JSON.stringify(policy)
      )
      if (!res.ok && res.status !== 409) {
        throw new Error(`Failed to create policy ${name}: ${res.status} ${await res.text()}`)
      }
    },

    async deletePolicy(name: string): Promise<void> {
      try {
        const res = await adminFetch(
          `/remove-canned-policy?name=${encodeURIComponent(name)}`,
          'DELETE'
        )
        if (!res.ok && res.status !== 404) {
          log.warn('Failed to delete policy', { policyName: name, status: res.status })
        }
      } catch {
        // Idempotent
      }
    },

    async attachPolicy(policyName: string, userName: string): Promise<void> {
      const res = await adminFetch(
        `/set-user-or-group-policy?userOrGroup=${encodeURIComponent(userName)}&isGroup=false&policyName=${encodeURIComponent(policyName)}`,
        'PUT'
      )
      if (!res.ok) {
        throw new Error(
          `Failed to attach policy ${policyName} to ${userName}: ${res.status} ${await res.text()}`
        )
      }
    },
  }
}
