/**
 * SframeModeDispatcher — Tier 5 voice E2EE guard.
 *
 * Calls that enter Stasis from the `[volunteers-sframe]` dialplan context
 * pass `sframe` as a Stasis application argument. Those calls are marked as
 * SFrame-mode and recording is banned: the sip-bridge will NEVER call
 * recordBridge or recordChannel on an SFrame call.
 *
 * PSTN calls (no `sframe` arg) retain normal recording semantics.
 */

export interface CallMode {
  mode: 'sframe' | 'pstn'
}

/**
 * Parse Stasis app arguments into a CallMode.
 *
 * Asterisk 18+ delivers `Stasis(llamenos,sframe)` as `event.args = ['sframe']`.
 * Outbound volunteer legs have `appArgs: 'dialed,<parentCallSid>,<pubkey>'`
 * — no `sframe` token, so they default to `pstn`. The bridge propagates mode
 * from the caller leg to the bridge recording guard.
 */
export function parseStasisArgs(args: string[]): CallMode {
  if (args.some((a) => a.toLowerCase() === 'sframe')) return { mode: 'sframe' }
  return { mode: 'pstn' }
}

export class SframeModeDispatcher {
  /**
   * Throws if `cm.mode === 'sframe'`. Callers must invoke this BEFORE any
   * recording side effect — never after.
   */
  assertRecordingAllowed(cm: CallMode): void {
    if (cm.mode === 'sframe') {
      throw new Error('recording banned on sframe mode (Tier 5 — SFrame)')
    }
  }
}
