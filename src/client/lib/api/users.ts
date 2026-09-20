import { request, hp } from './client'
import type { User } from '@protocol/schemas'

export type { User }

/** @deprecated Use roles array + permissions */
export type UserRole = 'volunteer' | 'admin' | 'reporter'

// --- Users (admin only) ---

export async function listUsers() {
  return request<{ users: User[] }>(hp('/users'))
}

export async function createUser(data: { name: string; phone: string; roleIds: string[]; pubkey: string }) {
  return request<User>(hp('/users'), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateUser(pubkey: string, data: Partial<{
  name: string
  phone: string
  roles: string[]
  active: boolean
  supportedMessagingChannels: string[]
  messagingEnabled: boolean
}>) {
  return request<User>(hp(`/users/${pubkey}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteUser(pubkey: string) {
  return request<{ ok: true }>(hp(`/users/${pubkey}`), { method: 'DELETE' })
}
