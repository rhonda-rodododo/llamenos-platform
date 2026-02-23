import type { Migration } from './types'

/**
 * Migration registry — append new migrations here.
 *
 * Rules:
 * - Always increment the version number
 * - Never modify or reorder existing migrations
 * - Migrations must be idempotent (safe to re-run)
 * - Use storage.get() / storage.put() / storage.delete() / storage.list()
 *
 * Example:
 * {
 *   version: 1,
 *   name: 'rename-settings-keys',
 *   run: async (storage) => {
 *     const old = await storage.get('old-key')
 *     if (old !== undefined) {
 *       await storage.put('new-key', old)
 *       await storage.delete('old-key')
 *     }
 *   },
 * },
 */
export const migrations: Migration[] = [
  // Migrations will be added here as needed
]
