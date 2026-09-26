/**
 * Demo identities: the shared demo account list, keyed to the real Ed25519 pubkeys
 * of their seeds.
 *
 * `DEMO_ACCOUNTS` (packages/shared) and the `DEMO_SEEDS` keys still carry the
 * legacy pre-Ed25519 pubkeys, which are NOT the public keys of those seeds. The
 * client signs in by importing the seed, so the identity that actually
 * authenticates is `ed25519(seed)`. Server-side user rows, hub membership and
 * envelopes must be addressed to that key — deriving it here keeps demo login
 * working regardless of what literal the shared list carries (once the shared
 * list is corrected the two coincide and this is a no-op).
 */
import { ed25519PubkeyFromSeed } from '@llamenos/crypto/ffi'
import { bytesToHex, hexToBytes } from '@shared/encoding'
import { DEMO_ACCOUNTS, type DemoAccount } from '@shared/demo-accounts'
import { DEMO_SEEDS } from './demo-seeds'

export interface DemoIdentity extends DemoAccount {
  /** Ed25519 signing seed the client imports to sign in as this account. */
  seedHex: string
  /** Handle the shared list / `/config/demo/credentials` uses for this account (may be the legacy key). */
  listedPubkey: string
}

let identities: DemoIdentity[] | null = null

/** The demo accounts addressed by their real signing pubkeys. */
export function demoIdentities(): DemoIdentity[] {
  identities ??= DEMO_ACCOUNTS.map((account) => {
    const seedHex = DEMO_SEEDS[account.pubkey]
    if (!seedHex) throw new Error(`No demo seed for account "${account.name}"`)
    return {
      ...account,
      pubkey: bytesToHex(ed25519PubkeyFromSeed(hexToBytes(seedHex))),
      seedHex,
      listedPubkey: account.pubkey,
    }
  })
  return identities
}

/** Look up a demo identity by display name. Throws if it is not part of the demo cast. */
export function demoIdentityByName(name: string): DemoIdentity {
  const found = demoIdentities().find(i => i.name === name)
  if (!found) throw new Error(`Demo account "${name}" missing from DEMO_ACCOUNTS`)
  return found
}
