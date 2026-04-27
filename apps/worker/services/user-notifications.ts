/**
 * UserNotificationsService — render and dispatch security alerts via Signal.
 *
 * The app server never sends to the Signal identifier directly.
 * It dispatches via the signal-notifier sidecar using the HMAC hash.
 * The sidecar resolves hash → plaintext and calls signal-cli-rest-api.
 *
 * Retry logic: up to 3 attempts with exponential backoff (200ms × 2^attempt).
 */
import { createLogger } from '../lib/logger'
import type { SignalContactsService } from './signal-contacts'
import type { SecurityPrefsService } from './security-prefs'
import type { AuditService } from './audit'

const log = createLogger('services.user-notifications')

// ---------------------------------------------------------------------------
// Alert types
// ---------------------------------------------------------------------------

export type AlertInput =
  | { type: 'new_device'; city: string; country: string; userAgent: string }
  | { type: 'passkey_added'; credentialLabel: string }
  | { type: 'passkey_removed'; credentialLabel: string }
  | { type: 'pin_changed' }
  | { type: 'recovery_rotated' }
  | { type: 'lockdown_triggered'; tier: 'A' | 'B' | 'C' }
  | { type: 'session_revoked_remote'; city: string; country: string }
  | {
      type: 'digest'
      periodDays: number
      loginCount: number
      alertCount: number
      failedCount: number
    }

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

export function formatDisappearingTimerSeconds(days: number): number {
  return days * 86400
}

export function renderAlertMessage(input: AlertInput): string {
  switch (input.type) {
    case 'new_device':
      return `🔔 New sign-in detected from ${input.city}, ${input.country} (${input.userAgent}). If this wasn't you, revoke the session and rotate your PIN.`
    case 'passkey_added':
      return `🔑 Passkey "${input.credentialLabel}" was added to your account.`
    case 'passkey_removed':
      return `🔑 Passkey "${input.credentialLabel}" was removed from your account.`
    case 'pin_changed':
      return `🔐 Your PIN was changed. If this wasn't you, trigger an emergency lockdown.`
    case 'recovery_rotated':
      return `🔄 Your recovery key was rotated. Save the new key in a safe place.`
    case 'lockdown_triggered':
      return `🚨 Emergency lockdown tier ${input.tier} was triggered on your account.`
    case 'session_revoked_remote':
      return `⛔ A session from ${input.city}, ${input.country} was revoked.`
    case 'digest':
      return `📊 Summary (last ${input.periodDays} days): ${input.loginCount} login(s), ${input.alertCount} alert(s), ${input.failedCount} failed attempt(s).`
  }
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3

async function sendToNotifier(
  notifierUrl: string,
  apiKey: string,
  identifierHash: string,
  message: string,
  disappearingTimerSeconds: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${notifierUrl.replace(/\/+$/, '')}/api/notify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ identifierHash, message, disappearingTimerSeconds }),
    })
    if (!res.ok) {
      return { ok: false, error: `Notifier ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'notifier error' }
  }
}

export interface UserNotificationsConfig {
  notifierUrl: string
  notifierApiKey: string
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class UserNotificationsService {
  constructor(
    private signalContacts: SignalContactsService,
    private prefs: SecurityPrefsService,
    private audit: AuditService,
    private config: UserNotificationsConfig
  ) {}

  async sendAlert(
    userPubkey: string,
    alert: AlertInput
  ): Promise<{ delivered: boolean }> {
    const prefs = await this.prefs.get(userPubkey)

    // Respect user's notification channel preference
    if (prefs.notificationChannel !== 'signal') return { delivered: false }

    // Check digest cadence opt-out
    if (alert.type === 'digest' && prefs.digestCadence === 'off') {
      return { delivered: false }
    }

    // Check per-alert opt-outs
    if (alert.type === 'new_device' && !prefs.alertOnNewDevice) return { delivered: false }
    if (
      (alert.type === 'passkey_added' || alert.type === 'passkey_removed') &&
      !prefs.alertOnPasskeyChange
    ) {
      return { delivered: false }
    }
    if (alert.type === 'pin_changed' && !prefs.alertOnPinChange) return { delivered: false }

    const contact = await this.signalContacts.findByUser(userPubkey)
    if (!contact) return { delivered: false }

    const message = renderAlertMessage(alert)
    const timer = formatDisappearingTimerSeconds(prefs.disappearingTimerDays)

    let lastErr = ''
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const result = await sendToNotifier(
        this.config.notifierUrl,
        this.config.notifierApiKey,
        contact.identifierHash,
        message,
        timer
      )
      if (result.ok) {
        await this.audit.log('signal_alert_sent', userPubkey, { alertType: alert.type })
        return { delivered: true }
      }
      lastErr = result.error ?? 'unknown'
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 200 * 2 ** attempt))
      }
    }

    log.error('Signal alert delivery failed', { userPubkey, lastErr })
    return { delivered: false }
  }

  /**
   * Register the user's plaintext identifier with the sidecar.
   * Called by the API route after the contact is upserted in the main DB.
   */
  async registerWithSidecar(
    identifierHash: string,
    plaintextIdentifier: string,
    identifierType: 'phone' | 'username'
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(
        `${this.config.notifierUrl.replace(/\/+$/, '')}/api/register`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.config.notifierApiKey}`,
          },
          body: JSON.stringify({ identifierHash, plaintextIdentifier, identifierType }),
        }
      )
      if (!res.ok) {
        return { ok: false, error: `Notifier ${res.status}` }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'notifier error' }
    }
  }

  /**
   * Remove the user's plaintext identifier from the sidecar.
   * Called by the API route when a contact is deleted.
   */
  async unregisterFromSidecar(identifierHash: string): Promise<void> {
    try {
      await fetch(
        `${this.config.notifierUrl.replace(/\/+$/, '')}/api/unregister/${encodeURIComponent(identifierHash)}`,
        {
          method: 'DELETE',
          headers: { authorization: `Bearer ${this.config.notifierApiKey}` },
        }
      )
    } catch (err) {
      log.error('Failed to unregister from sidecar', { identifierHash, err })
    }
  }
}
