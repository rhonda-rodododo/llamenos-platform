import type { TelephonyProviderType } from '@protocol/schemas/settings'
import type { ProviderCapabilityImpl } from './types'

const PROVIDER_REGISTRY = new Map<TelephonyProviderType, ProviderCapabilityImpl>()

/**
 * Register a provider implementation in the global capability registry.
 */
export function registerProvider(impl: ProviderCapabilityImpl): void {
  PROVIDER_REGISTRY.set(impl.providerType, impl)
}

/**
 * Retrieve a registered provider implementation by type.
 */
export function getProviderCapability(
  providerType: TelephonyProviderType,
): ProviderCapabilityImpl | undefined {
  return PROVIDER_REGISTRY.get(providerType)
}

/**
 * Check whether a provider has been registered.
 */
export function hasProvider(providerType: TelephonyProviderType): boolean {
  return PROVIDER_REGISTRY.has(providerType)
}

/**
 * Check whether a registered provider supports a given capability.
 */
export function hasCapability(
  providerType: TelephonyProviderType,
  capability: string,
): boolean {
  const impl = PROVIDER_REGISTRY.get(providerType)
  if (!impl) return false
  return impl.capabilities.includes(capability as Parameters<ProviderCapabilityImpl['capabilities']['includes']>[0])
}

/**
 * Get all registered provider types.
 */
export function getRegisteredProviders(): TelephonyProviderType[] {
  return Array.from(PROVIDER_REGISTRY.keys())
}
