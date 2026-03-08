/**
 * Storage monitor utility for Durable Object storage.
 *
 * CF DO storage has a 128 KiB per-value limit. This utility tracks
 * key sizes and warns when values approach that limit, helping prevent
 * silent data loss from oversized values.
 *
 * Also provides helpers for monitoring total key counts and
 * identifying hot keys that may need sharding.
 */

/** Maximum value size in bytes for a single DO storage key (128 KiB) */
export const DO_STORAGE_VALUE_LIMIT = 128 * 1024

/** Warn when a value exceeds this fraction of the limit */
const WARN_THRESHOLD = 0.75

export interface StorageKeyMetrics {
  key: string
  estimatedSize: number
  percentOfLimit: number
  overThreshold: boolean
}

export interface StorageReport {
  totalKeys: number
  hotKeys: StorageKeyMetrics[]
  warnings: string[]
}

/**
 * Estimate the serialized size of a value in bytes.
 * DO storage uses V8 serialization, but JSON.stringify gives a reasonable lower bound.
 */
export function estimateValueSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return 0
  }
}

/**
 * Check a single key's value against the storage limit.
 * Returns metrics including estimated size and whether it's over the warning threshold.
 */
export function checkKeySize(key: string, value: unknown): StorageKeyMetrics {
  const estimatedSize = estimateValueSize(value)
  const percentOfLimit = estimatedSize / DO_STORAGE_VALUE_LIMIT
  return {
    key,
    estimatedSize,
    percentOfLimit,
    overThreshold: percentOfLimit >= WARN_THRESHOLD,
  }
}

/**
 * Scan all keys with a given prefix and report their sizes.
 * Useful for periodic health checks.
 */
export async function scanStorageHealth(
  storage: { list(opts?: { prefix?: string }): Promise<Map<string, unknown>> },
  prefix?: string,
): Promise<StorageReport> {
  const entries = await storage.list(prefix ? { prefix } : undefined)
  const hotKeys: StorageKeyMetrics[] = []
  const warnings: string[] = []

  for (const [key, value] of entries) {
    const metrics = checkKeySize(key, value)
    if (metrics.overThreshold) {
      hotKeys.push(metrics)
      warnings.push(
        `[storage-monitor] Key "${key}" is at ${(metrics.percentOfLimit * 100).toFixed(1)}% ` +
        `of limit (${formatBytes(metrics.estimatedSize)} / ${formatBytes(DO_STORAGE_VALUE_LIMIT)})`
      )
    }
  }

  // Sort hot keys by size descending
  hotKeys.sort((a, b) => b.estimatedSize - a.estimatedSize)

  return {
    totalKeys: entries.size,
    hotKeys,
    warnings,
  }
}

/**
 * Log warnings for any storage values approaching the limit.
 * Call this periodically (e.g., in alarm handlers) or after large writes.
 */
export function logStorageWarnings(report: StorageReport): void {
  for (const warning of report.warnings) {
    console.warn(warning)
  }
  if (report.hotKeys.length > 0) {
    console.warn(
      `[storage-monitor] ${report.hotKeys.length} key(s) above ${(WARN_THRESHOLD * 100).toFixed(0)}% ` +
      `of ${formatBytes(DO_STORAGE_VALUE_LIMIT)} limit`
    )
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}
