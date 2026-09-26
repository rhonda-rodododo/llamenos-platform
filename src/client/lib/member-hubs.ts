import { useEffect, useMemo, useState } from 'react'
import { listHubs } from './api'
import { useConfig } from './config'

/** Membership changes rarely; a slow refresh picks up added/removed hubs without a relaunch. */
const REFRESH_INTERVAL_MS = 5 * 60_000

// Several components mount this hook at once (layout, dashboard, conversations);
// share one in-flight request between them.
let inflight: Promise<string[]> | null = null

function fetchMemberHubIds(): Promise<string[]> {
  inflight ??= listHubs()
    .then(({ hubs }) => hubs.map(h => h.id))
    .finally(() => { inflight = null })
  return inflight
}

/**
 * IDs of every hub the authenticated user is a member of (sorted, stable identity
 * while the set is unchanged).
 *
 * This is deliberately NOT `useConfig().hubs`: that is the public instance hub
 * list from `/config`, served before authentication. Membership comes from the
 * authenticated `GET /hubs`, which the server filters by the user's hub roles.
 *
 * The active hub is always included — it is by definition one the user can browse,
 * and it keeps single-hub behaviour intact while membership is loading or if the
 * membership request fails.
 *
 * Multi-hub axiom: incoming calls and conversation events must be received for
 * every hub in this list, whichever hub is active in the UI.
 */
export function useMemberHubIds(): string[] {
  const { currentHubId } = useConfig()
  const [fetched, setFetched] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    const load = () => {
      fetchMemberHubIds()
        .then(ids => { if (mounted) setFetched(prev => (prev.join(',') === ids.join(',') ? prev : ids)) })
        .catch(() => { console.error('[hubs] Failed to load hub memberships') })
    }
    load()
    const interval = setInterval(load, REFRESH_INTERVAL_MS)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  const key = [...new Set(currentHubId ? [...fetched, currentHubId] : fetched)].sort().join(',')
  // Re-derive the array only when the set changes so effects keyed on it don't churn.
  return useMemo(() => (key ? key.split(',') : []), [key])
}
