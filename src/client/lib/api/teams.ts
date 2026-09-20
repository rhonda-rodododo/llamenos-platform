import { request, hp } from './client'
import type { TeamResponse, TeamMemberResponse, ContactTeamAssignmentResponse } from '@protocol/schemas'

// ---------------------------------------------------------------------------
// Teams API
// ---------------------------------------------------------------------------

export async function listTeams(): Promise<{ teams: TeamResponse[] }> {
  return request<{ teams: TeamResponse[] }>(hp('/teams'))
}

export async function createTeam(body: {
  id: string
  encryptedName: string
  encryptedDescription?: string
}): Promise<TeamResponse> {
  return request<TeamResponse>(hp('/teams'), { method: 'POST', body: JSON.stringify(body) })
}

export async function getTeam(teamId: string): Promise<TeamResponse> {
  return request<TeamResponse>(hp(`/teams/${teamId}`))
}

export async function updateTeam(teamId: string, body: {
  encryptedName?: string
  encryptedDescription?: string | null
}): Promise<TeamResponse> {
  return request<TeamResponse>(hp(`/teams/${teamId}`), { method: 'PATCH', body: JSON.stringify(body) })
}

export async function deleteTeam(teamId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(hp(`/teams/${teamId}`), { method: 'DELETE' })
}

export async function listTeamMembers(teamId: string): Promise<{ members: TeamMemberResponse[] }> {
  return request<{ members: TeamMemberResponse[] }>(hp(`/teams/${teamId}/members`))
}

export async function addTeamMembers(teamId: string, pubkeys: string[]): Promise<{ ok: true }> {
  return request<{ ok: true }>(hp(`/teams/${teamId}/members`), { method: 'POST', body: JSON.stringify({ pubkeys }) })
}

export async function removeTeamMember(teamId: string, userPubkey: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(hp(`/teams/${teamId}/members/${encodeURIComponent(userPubkey)}`), { method: 'DELETE' })
}

export async function listTeamContacts(teamId: string): Promise<{ assignments: ContactTeamAssignmentResponse[] }> {
  return request<{ assignments: ContactTeamAssignmentResponse[] }>(hp(`/teams/${teamId}/contacts`))
}

export async function assignTeamContacts(teamId: string, contactIds: string[]): Promise<{ ok: true }> {
  return request<{ ok: true }>(hp(`/teams/${teamId}/contacts`), { method: 'POST', body: JSON.stringify({ contactIds }) })
}

export async function unassignTeamContact(teamId: string, contactId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(hp(`/teams/${teamId}/contacts/${contactId}`), { method: 'DELETE' })
}
