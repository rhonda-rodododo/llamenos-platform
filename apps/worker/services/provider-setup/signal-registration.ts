/**
 * SignalRegistrationService — state machine for registering a phone number
 * with a signal-cli-rest-api bridge.
 *
 * State machine:
 *   idle -> pending    (SMS code sent / voice call initiated)
 *   pending -> verifying (admin is entering voice verification code)
 *   pending -> complete  (bridge auto-confirmed SMS verification)
 *   pending -> failed    (10-minute timeout)
 *   verifying -> complete (code validated)
 *   verifying -> failed  (wrong code 3×, or timeout)
 *
 * Phone numbers are PII — encrypted before storage, masked in non-admin API responses.
 * Bridge URLs are SSRF-validated before any outbound HTTP call is made.
 */

import { eq, and } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import type { Database } from '../../db'
import { signalRegistrations } from '../../db/schema'
import { encryptCredentials, decryptCredentials } from './crypto'
import { validateExternalUrl } from '../../lib/ssrf-guard'

// ── Types ─────────────────────────────────────────────────────────────────

export type SignalRegistrationStatus =
  | 'idle'
  | 'pending'
  | 'verifying'
  | 'complete'
  | 'failed'

export interface SignalRegistration {
  id: string
  hubId: string
  bridgeUrl: string | null
  /** Masked phone number (last 4 digits only) — never the raw value. */
  phoneNumberMasked: string
  method: 'sms' | 'voice'
  status: SignalRegistrationStatus
  attempts: number
  error: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface StartRegistrationParams {
  bridgeUrl: string
  phoneNumber: string
  method: 'sms' | 'voice'
  hubId: string
}

export interface VerifyCodeParams {
  registrationId: string
  code: string
}

/** Valid state transitions. */
const VALID_TRANSITIONS: Record<SignalRegistrationStatus, SignalRegistrationStatus[]> = {
  idle: ['pending'],
  pending: ['verifying', 'complete', 'failed'],
  verifying: ['complete', 'failed'],
  complete: [],
  failed: [],
}

const REGISTRATION_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_VERIFY_ATTEMPTS = 3

// ── Service ───────────────────────────────────────────────────────────────

export class SignalRegistrationService {
  constructor(
    private readonly db: Database,
    private readonly hmacSecret: string,
  ) {}

  /**
   * Start a Signal bridge registration.
   *
   * Validates the bridge URL for SSRF, encrypts the phone number, persists
   * the record, then calls the bridge to initiate SMS or voice verification.
   */
  async startRegistration(params: StartRegistrationParams): Promise<SignalRegistration> {
    const ssrfError = validateExternalUrl(params.bridgeUrl, 'Bridge URL')
    if (ssrfError) {
      throw new SignalRegistrationError(ssrfError, 400)
    }

    const encryptedPhone = encryptCredentials({ phoneNumber: params.phoneNumber }, this.hmacSecret)
    const id = randomBytes(16).toString('hex')
    const expiresAt = new Date(Date.now() + REGISTRATION_TTL_MS)
    const bridgeUrl = params.bridgeUrl.replace(/\/+$/, '')

    await this.db.insert(signalRegistrations).values({
      id,
      hubId: params.hubId,
      bridgeUrl,
      phoneNumber: encryptedPhone,
      method: params.method,
      status: 'pending',
      attempts: 0,
      expiresAt,
    })

    // Call bridge to initiate verification
    await this.callBridgeRegister(bridgeUrl, params.phoneNumber, params.method === 'voice')

    const row = await this.loadRow(id)
    return this.toPublic(row)
  }

  /**
   * Poll the bridge for registration status and update the DB accordingly.
   *
   * For SMS registrations, the bridge confirms automatically when Signal
   * delivers the verification SMS. For voice, the admin must call verifyCode.
   */
  async checkStatus(registrationId: string): Promise<SignalRegistration> {
    const row = await this.loadRow(registrationId)
    this.enforceNotExpired(row)

    if (row.status === 'complete' || row.status === 'failed') {
      return this.toPublic(row)
    }

    const bridgeUrl = row.bridgeUrl
    if (!bridgeUrl) {
      return this.toPublic(row)
    }

    const phone = this.decryptPhone(row.phoneNumber)

    try {
      const res = await fetch(
        `${bridgeUrl}/v1/accounts/${encodeURIComponent(phone)}`,
        { headers: { 'Content-Type': 'application/json' } },
      )

      if (res.ok) {
        // Bridge confirmed the account exists — registration complete
        if (row.status === 'pending' && row.method === 'sms') {
          await this.transition(row, 'complete')
        }
      }
    } catch {
      // Transient error — do not change status
    }

    const updated = await this.loadRow(registrationId)
    return this.toPublic(updated)
  }

  /**
   * Submit a voice verification code (voice flow only).
   *
   * Enforces a 3-attempt limit. On the third wrong code the registration
   * moves to 'failed' and cannot be retried without a new startRegistration.
   */
  async verifyCode(params: VerifyCodeParams): Promise<SignalRegistration> {
    const row = await this.loadRow(params.registrationId)
    this.enforceNotExpired(row)

    if (row.status !== 'pending' && row.status !== 'verifying') {
      throw new SignalRegistrationError(
        `Cannot verify code in state "${row.status}"`,
        409,
      )
    }

    const bridgeUrl = row.bridgeUrl
    if (!bridgeUrl) {
      throw new SignalRegistrationError('Registration has no bridge URL', 400)
    }

    // Transition to verifying if still in pending
    if (row.status === 'pending') {
      await this.transition(row, 'verifying')
    }

    const phone = this.decryptPhone(row.phoneNumber)

    try {
      const res = await fetch(
        `${bridgeUrl}/v1/register/${encodeURIComponent(phone)}/verify/${encodeURIComponent(params.code)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      )

      if (res.ok) {
        await this.db
          .update(signalRegistrations)
          .set({ status: 'complete', updatedAt: new Date() })
          .where(eq(signalRegistrations.id, params.registrationId))
      } else {
        const newAttempts = (row.attempts ?? 0) + 1
        const nextStatus: SignalRegistrationStatus =
          newAttempts >= MAX_VERIFY_ATTEMPTS ? 'failed' : 'verifying'
        const errorText = await res.text()

        await this.db
          .update(signalRegistrations)
          .set({
            status: nextStatus,
            attempts: newAttempts,
            error: nextStatus === 'failed'
              ? `Verification failed after ${MAX_VERIFY_ATTEMPTS} attempts: ${errorText}`
              : `Verification code rejected (attempt ${newAttempts}/${MAX_VERIFY_ATTEMPTS})`,
            updatedAt: new Date(),
          })
          .where(eq(signalRegistrations.id, params.registrationId))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new SignalRegistrationError(`Bridge unreachable: ${message}`, 502)
    }

    const updated = await this.loadRow(params.registrationId)
    return this.toPublic(updated)
  }

  /**
   * Unregister the phone number from the Signal bridge and delete the DB record.
   */
  async unregister(registrationId: string): Promise<void> {
    const row = await this.loadRow(registrationId)
    const bridgeUrl = row.bridgeUrl

    if (bridgeUrl) {
      const phone = this.decryptPhone(row.phoneNumber)
      try {
        await fetch(
          `${bridgeUrl}/v1/accounts/${encodeURIComponent(phone)}`,
          { method: 'DELETE', headers: { 'Content-Type': 'application/json' } },
        )
      } catch {
        // Non-fatal — delete DB record regardless
      }
    }

    await this.db
      .delete(signalRegistrations)
      .where(eq(signalRegistrations.id, registrationId))
  }

  /**
   * Get account information from the bridge for a registration.
   */
  async getAccountInfo(registrationId: string): Promise<{
    registered: boolean
    phoneNumberMasked: string
    uuid?: string
    error?: string
  }> {
    const row = await this.loadRow(registrationId)
    const bridgeUrl = row.bridgeUrl
    const phone = this.decryptPhone(row.phoneNumber)

    if (!bridgeUrl) {
      return { registered: false, phoneNumberMasked: maskPhone(phone), error: 'No bridge URL configured' }
    }

    try {
      const res = await fetch(
        `${bridgeUrl}/v1/accounts/${encodeURIComponent(phone)}`,
        { headers: { 'Content-Type': 'application/json' } },
      )

      if (!res.ok) {
        return {
          registered: false,
          phoneNumberMasked: maskPhone(phone),
          error: res.status === 404 ? 'Number is not registered on this bridge' : `HTTP ${res.status}`,
        }
      }

      const data = await res.json() as { uuid?: string }
      return {
        registered: true,
        phoneNumberMasked: maskPhone(phone),
        uuid: data.uuid,
      }
    } catch (err) {
      return {
        registered: false,
        phoneNumberMasked: maskPhone(phone),
        error: `Bridge unreachable: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  /**
   * Get the current registration for a hub, if any.
   */
  async getRegistrationForHub(hubId: string): Promise<SignalRegistration | null> {
    const [row] = await this.db
      .select()
      .from(signalRegistrations)
      .where(eq(signalRegistrations.hubId, hubId))
      .limit(1)

    if (!row) return null
    return this.toPublic(row)
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async loadRow(id: string) {
    const [row] = await this.db
      .select()
      .from(signalRegistrations)
      .where(eq(signalRegistrations.id, id))
    if (!row) throw new SignalRegistrationError('Registration not found', 404)
    return row
  }

  private enforceNotExpired(row: typeof signalRegistrations.$inferSelect): void {
    if (row.status === 'complete' || row.status === 'failed') return
    if (row.expiresAt && new Date() > row.expiresAt) {
      void this.db
        .update(signalRegistrations)
        .set({ status: 'failed', error: 'Registration expired', updatedAt: new Date() })
        .where(eq(signalRegistrations.id, row.id))
      throw new SignalRegistrationError('Registration has expired', 410)
    }
  }

  private async transition(
    row: typeof signalRegistrations.$inferSelect,
    next: SignalRegistrationStatus,
  ): Promise<void> {
    const current = row.status as SignalRegistrationStatus
    const allowed = VALID_TRANSITIONS[current]
    if (!allowed.includes(next)) {
      throw new SignalRegistrationError(
        `Invalid state transition: ${current} -> ${next}`,
        409,
      )
    }
    await this.db
      .update(signalRegistrations)
      .set({ status: next, updatedAt: new Date() })
      .where(and(
        eq(signalRegistrations.id, row.id),
        eq(signalRegistrations.status, current),
      ))
  }

  private async callBridgeRegister(
    bridgeUrl: string,
    phoneNumber: string,
    useVoice: boolean,
  ): Promise<void> {
    try {
      const res = await fetch(
        `${bridgeUrl}/v1/register/${encodeURIComponent(phoneNumber)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ use_voice: useVoice }),
        },
      )
      if (!res.ok) {
        const errorText = await res.text()
        throw new SignalRegistrationError(
          `Bridge registration failed: HTTP ${res.status} — ${errorText}`,
          502,
        )
      }
    } catch (err) {
      if (err instanceof SignalRegistrationError) throw err
      throw new SignalRegistrationError(
        `Bridge unreachable: ${err instanceof Error ? err.message : String(err)}`,
        502,
      )
    }
  }

  private decryptPhone(encryptedPhone: string): string {
    const creds = decryptCredentials(encryptedPhone, this.hmacSecret)
    return String(creds.phoneNumber)
  }

  private toPublic(row: typeof signalRegistrations.$inferSelect): SignalRegistration {
    const phone = this.decryptPhone(row.phoneNumber)
    return {
      id: row.id,
      hubId: row.hubId,
      bridgeUrl: row.bridgeUrl,
      phoneNumberMasked: maskPhone(phone),
      method: row.method as 'sms' | 'voice',
      status: row.status as SignalRegistrationStatus,
      attempts: row.attempts ?? 0,
      error: row.error,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}

// ── Error class ───────────────────────────────────────────────────────────

export class SignalRegistrationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'SignalRegistrationError'
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****'
  return `****${phone.slice(-4)}`
}
