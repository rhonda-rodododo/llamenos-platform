import { execFileSync } from 'node:child_process'

/**
 * §5.9 of the design spec: "ping when blocked, plus a twice-daily digest" —
 * blocked-pings plus a digest, not a notification per event. `notify` is the
 * one delivery primitive both use.
 *
 * A sink is best-effort by construction: it returns (or resolves) normally
 * on success and throws/rejects on failure. `notify` never lets a sink's
 * failure propagate — a notification is not part of the dispatch pass, and a
 * flaky webhook or a missing CLI tool must never turn into a halted or
 * retried pass. There is deliberately no retry here either: a retry loop
 * inside the one thing that tells a human what happened is exactly the kind
 * of complexity this layer must not have.
 */
export type NotifySink = (subject: string, body: string) => Promise<void> | void

export interface NotifyResult {
  attempted: number
  succeeded: number
  errors: string[]
  /** True whenever every attempted sink succeeded — and also when there were
   *  no sinks to attempt at all. No sink configured is not a failure: it
   *  means the digest is printed to stdout/the log and that is the delivery,
   *  which is exactly what a fresh checkout with no notification wired up
   *  should do. */
  ok: boolean
}

/**
 * Posts `{subject, body}` as JSON to a webhook URL (Slack incoming-webhooks,
 * a generic HTTP endpoint, etc.). No credentials are wired in here — the URL
 * itself, including any embedded token, comes from the environment.
 */
export function webhookSink(url: string): NotifySink {
  return async (subject, body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject, body }),
    })
    if (!res.ok) throw new Error(`webhook sink: HTTP ${res.status}`)
  }
}

/**
 * Runs an arbitrary local command with `subject` and `body` as argv, e.g. a
 * `notify-send` wrapper or a small script that hands off to SMS/email. Kept
 * generic and pluggable rather than baking in one notification provider.
 */
export function commandSink(command: string): NotifySink {
  return (subject, body) => {
    execFileSync(command, [subject, body], { stdio: 'ignore' })
  }
}

/**
 * Reads sink configuration from the environment so this module never
 * hardcodes real credentials. Both are optional and independent — either,
 * both, or neither may be configured.
 */
export function sinksFromEnv(env: NodeJS.ProcessEnv = process.env): NotifySink[] {
  const sinks: NotifySink[] = []
  const webhookUrl = env['FLEET_NOTIFY_WEBHOOK_URL']
  if (webhookUrl) sinks.push(webhookSink(webhookUrl))
  const command = env['FLEET_NOTIFY_COMMAND']
  if (command) sinks.push(commandSink(command))
  return sinks
}

/**
 * Best-effort fan-out to every configured sink. Never throws: each sink is
 * wrapped in its own try/catch, and an empty sink list is a normal, "ok"
 * outcome — the digest was still printed, which is the fallback delivery.
 */
export async function notify(subject: string, body: string, sinks: NotifySink[] = sinksFromEnv()): Promise<NotifyResult> {
  let succeeded = 0
  const errors: string[] = []
  for (const sink of sinks) {
    try {
      await sink(subject, body)
      succeeded++
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return { attempted: sinks.length, succeeded, errors, ok: errors.length === 0 }
}
