import { request } from './client'

// --- Migration Status (Epic 286) ---

export async function getMigrationStatus() {
  return request<{
    namespaces: Array<{
      namespace: string
      currentVersion: number
      latestVersion: number
      pending: number
      history: Array<{
        version: number
        name: string
        status: 'applied' | 'pending'
        appliedAt?: string
      }>
      lastRun: string | null
      error?: string
    }>
  }>('/settings/migrations')
}
