import { DEMO_ACCOUNTS } from '@shared/demo-accounts'

/**
 * Demo account seed values — loaded dynamically to keep secrets out of
 * the main bundle. The seed data is in a separate chunk that is only
 * fetched when demo mode is active.
 */
let demoSeeds: Record<string, string> | null = null

async function loadSeeds(): Promise<Record<string, string>> {
  if (!demoSeeds) {
    const mod = await import('./demo-seed-data')
    demoSeeds = mod.DEMO_SEEDS
  }
  return demoSeeds
}

export async function getDemoSeed(pubkey: string): Promise<string | undefined> {
  const seeds = await loadSeeds()
  return seeds[pubkey]
}

export async function getDemoAccountsWithSeed() {
  const seeds = await loadSeeds()
  return DEMO_ACCOUNTS.filter(a => !a.roleIds.includes('role-volunteer') || a.name !== 'Fatima Al-Rashid').map(a => ({
    ...a,
    seedHex: seeds[a.pubkey]!,
    deviceKey: seeds[a.pubkey]!,
  }))
}
