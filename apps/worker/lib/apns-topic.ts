/**
 * Single source of truth for the APNs topic (bundle identifier).
 *
 * Apple rejects every push whose `apns-topic` header does not exactly match
 * the receiving app's bundle identifier with `BadTopic` / `DeviceTokenNotForTopic`.
 * The bundle ID is defined in three places outside the backend's control —
 * `apps/ios/project.yml` (PRODUCT_BUNDLE_IDENTIFIER), `apps/ios/fastlane/Fastfile`
 * (APP_IDENTIFIER), and `apps/desktop/tauri.conf.json` (identifier) — so this
 * module is the backend's single point of truth for it, rather than a literal
 * duplicated across push-dispatch.ts and voip-push.ts (Issue #724).
 *
 * Override via the APNS_BUNDLE_ID env var only for exceptional cases (e.g.
 * validating a differently-signed build) — the default below must otherwise
 * always match the iOS bundle identifier.
 *
 * apps/worker/__tests__/unit/apns-topic.test.ts asserts DEFAULT_APNS_BUNDLE_ID
 * matches PRODUCT_BUNDLE_IDENTIFIER in apps/ios/project.yml so the two cannot
 * silently drift again.
 */
import type { Env } from '../types/infra'

/** Must match PRODUCT_BUNDLE_IDENTIFIER in apps/ios/project.yml. */
export const DEFAULT_APNS_BUNDLE_ID = 'org.llamenos.hotline'

/** Resolve the APNs topic (bundle ID) from env, falling back to the default. */
export function getApnsBundleId(env: Pick<Env, 'APNS_BUNDLE_ID'>): string {
  const override = env.APNS_BUNDLE_ID?.trim()
  return override && override.length > 0 ? override : DEFAULT_APNS_BUNDLE_ID
}

/**
 * Resolve the APNs VoIP topic — always `<bundle id>.voip`, per Apple's PushKit
 * requirement that VoIP pushes use a distinct topic from regular notifications.
 */
export function getApnsVoipTopic(env: Pick<Env, 'APNS_BUNDLE_ID'>): string {
  return `${getApnsBundleId(env)}.voip`
}
