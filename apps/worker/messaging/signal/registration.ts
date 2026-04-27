/**
 * SignalRegistrationService — manages Signal number registration and verification
 * through the signal-cli-rest-api bridge.
 *
 * Registration flow:
 * 1. Admin provides a phone number and bridge URL
 * 2. Service calls the bridge to start registration (SMS or voice verification)
 * 3. Admin enters the verification code
 * 4. Service verifies the code and confirms registration
 * 5. On success, updates the messaging config with the registered number
 */

import type { SignalConfig } from '@shared/types'
import type { SignalAboutResponse, SignalAccountInfo } from './types'
import { createLogger } from '../../lib/logger'

const logger = createLogger('signal-registration')

export type RegistrationStep = 'idle' | 'pending_verification' | 'verified' | 'failed'

export interface RegistrationState {
  step: RegistrationStep
  number?: string
  error?: string
  bridgeUrl?: string
  startedAt?: string
}

export interface StartRegistrationParams {
  bridgeUrl: string
  bridgeApiKey: string
  phoneNumber: string
  useVoice?: boolean    // true = voice call instead of SMS for verification
  captcha?: string      // captcha token if Signal requires it
}

export interface VerifyRegistrationParams {
  bridgeUrl: string
  bridgeApiKey: string
  phoneNumber: string
  verificationCode: string
}

/**
 * Start the Signal registration process by requesting a verification code.
 * The bridge will instruct Signal to send an SMS (or make a voice call).
 */
export async function startRegistration(params: StartRegistrationParams): Promise<RegistrationState> {
  const bridgeUrl = params.bridgeUrl.replace(/\/+$/, '')

  try {
    const response = await fetch(`${bridgeUrl}/v1/register/${encodeURIComponent(params.phoneNumber)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${params.bridgeApiKey}`,
      },
      body: JSON.stringify({
        use_voice: params.useVoice ?? false,
        captcha: params.captcha,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()

      // Check for captcha requirement
      if (response.status === 403 || errorText.toLowerCase().includes('captcha')) {
        return {
          step: 'failed',
          number: params.phoneNumber,
          error: 'Signal requires a captcha. Obtain a captcha token from https://signalcaptchas.org/registration/generate.html and retry.',
          bridgeUrl,
          startedAt: new Date().toISOString(),
        }
      }

      return {
        step: 'failed',
        number: params.phoneNumber,
        error: `Registration failed: HTTP ${response.status} — ${errorText}`,
        bridgeUrl,
        startedAt: new Date().toISOString(),
      }
    }

    logger.info('Signal registration started', { number: params.phoneNumber.slice(-4) })

    return {
      step: 'pending_verification',
      number: params.phoneNumber,
      bridgeUrl,
      startedAt: new Date().toISOString(),
    }
  } catch (err) {
    return {
      step: 'failed',
      number: params.phoneNumber,
      error: `Bridge unreachable: ${err instanceof Error ? err.message : String(err)}`,
      bridgeUrl,
      startedAt: new Date().toISOString(),
    }
  }
}

/**
 * Complete registration by verifying the code sent via SMS/voice.
 */
export async function verifyRegistration(params: VerifyRegistrationParams): Promise<RegistrationState> {
  const bridgeUrl = params.bridgeUrl.replace(/\/+$/, '')

  try {
    const response = await fetch(
      `${bridgeUrl}/v1/register/${encodeURIComponent(params.phoneNumber)}/verify/${encodeURIComponent(params.verificationCode)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${params.bridgeApiKey}`,
        },
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      return {
        step: 'failed',
        number: params.phoneNumber,
        error: `Verification failed: HTTP ${response.status} — ${errorText}`,
        bridgeUrl,
      }
    }

    logger.info('Signal registration verified', { number: params.phoneNumber.slice(-4) })

    return {
      step: 'verified',
      number: params.phoneNumber,
      bridgeUrl,
    }
  } catch (err) {
    return {
      step: 'failed',
      number: params.phoneNumber,
      error: `Bridge unreachable: ${err instanceof Error ? err.message : String(err)}`,
      bridgeUrl,
    }
  }
}

/**
 * Unregister the phone number from Signal via the bridge.
 * Use when decommissioning a number or switching to a different one.
 */
export async function unregisterNumber(config: SignalConfig): Promise<{ success: boolean; error?: string }> {
  const bridgeUrl = config.bridgeUrl.replace(/\/+$/, '')

  try {
    const response = await fetch(
      `${bridgeUrl}/v1/unregister/${encodeURIComponent(config.registeredNumber)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.bridgeApiKey}`,
        },
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `Unregister failed: HTTP ${response.status} — ${errorText}`,
      }
    }

    logger.info('Signal number unregistered', { number: config.registeredNumber.slice(-4) })
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: `Bridge unreachable: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Get detailed account information from the Signal bridge.
 * Returns registration status, linked devices, and profile info.
 */
export async function getAccountInfo(config: SignalConfig): Promise<{
  registered: boolean
  number: string
  uuid?: string
  devices?: Array<{ id: number; name?: string }>
  error?: string
}> {
  const bridgeUrl = config.bridgeUrl.replace(/\/+$/, '')

  try {
    // Check the about endpoint for basic info
    const aboutResponse = await fetch(`${bridgeUrl}/v1/about`, {
      headers: { 'Authorization': `Bearer ${config.bridgeApiKey}` },
    })

    if (!aboutResponse.ok) {
      return {
        registered: false,
        number: config.registeredNumber,
        error: `Bridge returned HTTP ${aboutResponse.status}`,
      }
    }

    const about: SignalAboutResponse = await aboutResponse.json()

    // Check if the specific number is registered
    const accountResponse = await fetch(
      `${bridgeUrl}/v1/accounts/${encodeURIComponent(config.registeredNumber)}`,
      {
        headers: { 'Authorization': `Bearer ${config.bridgeApiKey}` },
      },
    )

    if (!accountResponse.ok) {
      return {
        registered: false,
        number: config.registeredNumber,
        error: accountResponse.status === 404
          ? 'Number is not registered on this bridge'
          : `Account check failed: HTTP ${accountResponse.status}`,
      }
    }

    const accountInfo: Partial<SignalAccountInfo> = await accountResponse.json()

    // Try to get linked devices
    let devices: Array<{ id: number; name?: string }> | undefined
    try {
      const devicesResponse = await fetch(
        `${bridgeUrl}/v1/devices/${encodeURIComponent(config.registeredNumber)}`,
        {
          headers: { 'Authorization': `Bearer ${config.bridgeApiKey}` },
        },
      )
      if (devicesResponse.ok) {
        devices = await devicesResponse.json()
      }
    } catch {
      // Devices endpoint may not exist on older bridge versions
    }

    return {
      registered: true,
      number: config.registeredNumber,
      uuid: accountInfo.uuid,
      devices,
    }
  } catch (err) {
    return {
      registered: false,
      number: config.registeredNumber,
      error: `Bridge unreachable: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Build a SignalConfig from registration state and user-provided parameters.
 * Used after successful registration to save the config to settings.
 */
export function buildSignalConfig(params: {
  bridgeUrl: string
  bridgeApiKey: string
  webhookSecret: string
  registeredNumber: string
  autoResponse?: string
  afterHoursResponse?: string
}): SignalConfig {
  return {
    bridgeUrl: params.bridgeUrl,
    bridgeApiKey: params.bridgeApiKey,
    webhookSecret: params.webhookSecret,
    registeredNumber: params.registeredNumber,
    autoResponse: params.autoResponse,
    afterHoursResponse: params.afterHoursResponse,
  }
}
