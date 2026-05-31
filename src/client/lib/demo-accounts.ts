import { DEMO_ACCOUNTS } from '@shared/demo-accounts'

/**
 * Demo account seed values — fetched from the server at login time.
 * Seeds are NOT bundled in the client. The server returns them only when
 * DEMO_MODE=true via GET /api/config/demo/credentials.
 */
let demoSeeds: Record<string, string> | null = null

async function loadSeeds(): Promise<Record<string, string>> {
  if (!demoSeeds) {
    const res = await fetch('/api/config/demo/credentials')
    if (!res.ok) return {}
    const data = await res.json() as { credentials: Array<{ pubkey: string; seedHex: string }> }
    demoSeeds = Object.fromEntries(data.credentials.map(c => [c.pubkey, c.seedHex]))
  }
  return demoSeeds
}

export async function getDemoSeed(pubkey: string): Promise<string | undefined> {
  const seeds = await loadSeeds()
  return seeds[pubkey]
}

export async function getDemoAccountsWithSeed() {
  const seeds = await loadSeeds()
  return DEMO_ACCOUNTS.filter(a => a.pubkey in seeds).map(a => ({
    ...a,
    seedHex: seeds[a.pubkey] as string,
    deviceKey: seeds[a.pubkey] as string,
  }))
}
