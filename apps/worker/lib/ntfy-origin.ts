/**
 * UnifiedPush endpoint trust policy (#960).
 *
 * A device registers a UnifiedPush endpoint URL and the server later POSTs wake
 * signals to it. The ntfy Android app defaults to the public https://ntfy.sh, so
 * without a policy a tester who never reconfigures it would route every incoming-call
 * wake through a third party. The payload is HPKE-encrypted, but that third party would
 * still learn *that* a volunteer's device was woken, when, and how often.
 *
 * Policy: an endpoint is trusted only if its parsed origin (scheme + host + port)
 * exactly equals an origin the operator configured. Never a string-prefix check —
 * `https://ntfy.example.com.evil.tld` and `https://ntfy.example.com@evil.tld` both
 * start with the trusted host. URLs carrying userinfo are rejected outright.
 *
 * Configured origins:
 *   NTFY_URL              server-side broker address (may be an internal address, e.g. http://ntfy:80)
 *   NTFY_PUBLIC_URL       device-facing address of the same broker (e.g. https://push.example.org)
 *   NTFY_ALLOWED_ORIGINS  comma-separated extra operator-approved relays
 *
 * Without NTFY_URL the Android push path is disabled — the policy fails closed.
 */

import type { Env } from '../types'

export interface NtfyOriginPolicy {
  /** Origins of the operator's own broker (NTFY_URL + NTFY_PUBLIC_URL). May carry the bearer token. */
  own: readonly string[]
  /** Extra operator-approved relays. Trusted as destinations, but never sent the bearer token. */
  additional: readonly string[]
}

export type NtfyEndpointVerdict = 'own' | 'additional' | 'rejected'

/** Parse an http(s) URL with no userinfo; returns the URL or null. */
function parseHttpUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username !== '' || url.password !== '') return null
  return url
}

/** Normalised origin of an operator-configured URL, or null when unset/invalid. */
export function configuredOrigin(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  return parseHttpUrl(trimmed)?.origin ?? null
}

export function buildNtfyOriginPolicy(config: {
  baseUrl?: string
  publicUrl?: string
  allowedOrigins?: string
}): NtfyOriginPolicy {
  const own = [config.baseUrl, config.publicUrl]
    .map(configuredOrigin)
    .filter((o): o is string => o !== null)
  const additional = (config.allowedOrigins ?? '')
    .split(',')
    .map(configuredOrigin)
    .filter((o): o is string => o !== null && !own.includes(o))
  return { own: [...new Set(own)], additional: [...new Set(additional)] }
}

/**
 * Policy from the worker env. Empty (everything rejected) when NTFY_URL is unset,
 * so an operator who has not configured a broker never falls open.
 */
export function ntfyOriginPolicyFromEnv(
  env: Pick<Env, 'NTFY_URL' | 'NTFY_PUBLIC_URL' | 'NTFY_ALLOWED_ORIGINS'>,
): NtfyOriginPolicy {
  if (!configuredOrigin(env.NTFY_URL)) return { own: [], additional: [] }
  return buildNtfyOriginPolicy({
    baseUrl: env.NTFY_URL,
    publicUrl: env.NTFY_PUBLIC_URL,
    allowedOrigins: env.NTFY_ALLOWED_ORIGINS,
  })
}

export function classifyNtfyEndpoint(endpoint: string, policy: NtfyOriginPolicy): NtfyEndpointVerdict {
  const url = parseHttpUrl(endpoint)
  if (!url) return 'rejected'
  if (policy.own.includes(url.origin)) return 'own'
  if (policy.additional.includes(url.origin)) return 'additional'
  return 'rejected'
}

export function isTrustedNtfyEndpoint(endpoint: string, policy: NtfyOriginPolicy): boolean {
  return classifyNtfyEndpoint(endpoint, policy) !== 'rejected'
}
