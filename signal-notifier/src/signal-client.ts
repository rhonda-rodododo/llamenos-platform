export interface BridgeConfig {
  bridgeUrl: string
  bridgeApiKey: string
  registeredNumber: string
}

/**
 * Send a Signal message via signal-cli-rest-api.
 *
 * Docs: https://github.com/bbernhard/signal-cli-rest-api
 * Endpoint: POST /v2/send
 */
export async function sendSignalMessage(
  cfg: BridgeConfig,
  recipient: string,
  message: string,
  disappearingTimerSeconds: number | null
): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = {
    number: cfg.registeredNumber,
    recipients: [recipient],
    message,
  }
  if (disappearingTimerSeconds !== null) {
    body.message_timer = disappearingTimerSeconds
  }
  try {
    const res = await fetch(`${cfg.bridgeUrl.replace(/\/+$/, '')}/v2/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cfg.bridgeApiKey ? { authorization: `Bearer ${cfg.bridgeApiKey}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `Bridge ${res.status}: ${text}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'bridge error' }
  }
}
