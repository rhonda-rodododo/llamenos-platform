import type {
  OwnedNumber,
  AvailableNumber,
  NumberSearchQuery,
  NumberProvisionRequest,
} from '@protocol/schemas/provider-setup'
import type { TelephonyProviderType } from '@protocol/schemas/settings'
import type { ProviderCapability } from '@protocol/schemas/provider-setup'

/**
 * Webhook URLs to configure on a provider number.
 */
export interface WebhookUrls {
  voiceIncoming: string
  voiceStatus: string
  sms?: string
}

/**
 * Result of testing a provider connection.
 */
export interface ConnectionTestResult {
  connected: boolean
  latencyMs: number
  accountName?: string
  error?: string
  errorType?:
    | 'invalid_credentials'
    | 'network_error'
    | 'rate_limited'
    | 'account_suspended'
    | 'unknown'
}

/**
 * SIP trunk configuration returned by providers that support trunk creation.
 */
export interface SipTrunkConfig {
  sipProvider: string
  sipUsername: string
  sipPassword: string
  trunkSid?: string
  connectionId?: string
}

/**
 * Provider API error — thrown when a provider returns a non-2xx response.
 */
export class ProviderApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message)
    this.name = 'ProviderApiError'
  }
}

/**
 * Capability implementation interface for a telephony provider.
 *
 * Each provider declares which capabilities it supports. Methods for unsupported
 * capabilities may throw if called directly — callers must check `capabilities`
 * via the registry before invoking.
 */
export interface ProviderCapabilityImpl {
  readonly providerType: TelephonyProviderType
  readonly capabilities: ProviderCapability[]

  /** Validate credentials by making a lightweight API call. */
  testConnection(credentials: Record<string, unknown>): Promise<ConnectionTestResult>

  /** List numbers already owned by the account. */
  listOwnedNumbers(credentials: Record<string, unknown>): Promise<OwnedNumber[]>

  /** Search for available numbers to purchase. */
  searchAvailableNumbers(
    credentials: Record<string, unknown>,
    query: NumberSearchQuery,
  ): Promise<AvailableNumber[]>

  /** Purchase/provision a number. */
  provisionNumber(
    credentials: Record<string, unknown>,
    request: NumberProvisionRequest,
  ): Promise<OwnedNumber>

  /** Configure webhooks on an existing number. */
  configureWebhooks(
    credentials: Record<string, unknown>,
    numberId: string,
    urls: WebhookUrls,
  ): Promise<void>

  /** Create a SIP trunk (providers with `sipTrunks` capability). */
  createSipTrunk(
    credentials: Record<string, unknown>,
    domain: string,
  ): Promise<SipTrunkConfig>
}
