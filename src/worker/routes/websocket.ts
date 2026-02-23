import { Hono } from 'hono'
import type { AppEnv, Volunteer } from '../types'
import { getDOs, getScopedDOs } from '../lib/do-access'
import type { Role } from '../../shared/permissions'
import { resolvePermissions, permissionGranted } from '../../shared/permissions'

const websocket = new Hono<AppEnv>()

websocket.get('/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 400)
  }

  // Auth uses global identity DO (users are global)
  const globalDos = getDOs(c.env)
  const protocols = c.req.header('Sec-WebSocket-Protocol') || ''
  const parts = protocols.split(',').map(p => p.trim())
  const authB64 = parts.find(p => p !== 'llamenos-auth' && p !== '')
  if (!authB64) return c.json({ error: 'Unauthorized' }, 401)

  let wsPubkey: string | null = null

  // Try session token first (for WebAuthn sessions)
  if (authB64.startsWith('session-')) {
    const sessionToken = authB64.slice(8)
    const sessionRes = await globalDos.identity.fetch(new Request(`http://do/sessions/validate/${sessionToken}`))
    if (sessionRes.ok) {
      const session = await sessionRes.json() as { pubkey: string }
      wsPubkey = session.pubkey
    }
  }

  // Fall back to Schnorr auth
  if (!wsPubkey) {
    try {
      const b64 = authB64.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - authB64.length % 4) % 4)
      const auth = JSON.parse(atob(b64)) as { pubkey: string; timestamp: number; token: string }
      const { verifyAuthToken } = await import('../lib/auth')
      if (await verifyAuthToken(auth)) {
        wsPubkey = auth.pubkey
      }
    } catch {
      // Invalid auth format
    }
  }

  if (!wsPubkey) return c.json({ error: 'Unauthorized' }, 401)
  const volRes = await globalDos.identity.fetch(new Request(`http://do/volunteer/${wsPubkey}`))
  if (!volRes.ok) return c.json({ error: 'Unknown user' }, 401)
  const vol = await volRes.json() as Volunteer

  // Resolve permissions to determine access level for presence data
  const rolesRes = await globalDos.settings.fetch(new Request('http://do/settings/roles'))
  const allRoles: Role[] = rolesRes.ok ? ((await rolesRes.json()) as { roles: Role[] }).roles : []
  const permissions = resolvePermissions(vol.roles, allRoles)
  // Tag: 'admin' if user can see full presence data, otherwise 'volunteer'
  const accessLevel = permissionGranted(permissions, 'calls:read-presence') ? 'admin' : 'volunteer'

  // Hub-scoped WebSocket: route to the hub's CallRouterDO if hub param is present
  const url = new URL(c.req.url)
  const hubId = url.searchParams.get('hub') || undefined
  const dos = getScopedDOs(c.env, hubId)

  // Forward to CallRouter DO with pubkey and access level (clean URL, no auth in query)
  const wsUrl = new URL(c.req.url)
  wsUrl.pathname = '/ws'
  wsUrl.search = ''
  wsUrl.searchParams.set('pubkey', wsPubkey)
  wsUrl.searchParams.set('role', accessLevel)
  return dos.calls.fetch(new Request(wsUrl.toString(), c.req.raw))
})

export default websocket
