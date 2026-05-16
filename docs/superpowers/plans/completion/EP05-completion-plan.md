# EP05 — Messaging Channels & Blast System — Completion Plan

## Scope

### Already Done (~70%)
- All backend messaging adapters (SMS, Signal, WhatsApp, Telegram, RCS)
- BlastsService with full CRUD, delivery worker, scheduled poller
- Blast routes (create, read, list, send, schedule, cancel, delete, retry, stats, deliveries)
- Messaging config routes
- A2P registration service
- Channel config registry with dynamic registration (desktop)
- All channel section components: SMS, WhatsApp, Telegram, Signal, RCS (desktop)
- Blasts page: list, create, send, cancel, delete (desktop)
- Delivery status sheet, blast progress bar, subscriber manager, blast settings panel
- BDD: `blast-campaign.feature` — 4 scenarios (3 @wip)

### Remaining Work
- BlastComposer missing media URL field
- BlastComposer missing schedule date/time picker
- WS blast progress events (real-time updates instead of polling)
- 3 @wip BDD scenarios
- iOS: SMS/WhatsApp/Telegram channel config missing (only Signal/RCS exist)
- iOS: full blast CRUD UI incomplete
- Android: SMS/WhatsApp/Telegram channel config missing
- Android: full blast CRUD UI incomplete

## Tasks (ordered by dependency)

### Task 1: BlastComposer — add media URL and schedule picker
- **Platform**: desktop
- **Files**:
  - `src/client/components/BlastComposer.tsx` — add media URL input + schedule picker
  - `src/client/components/blast/media-attachment-field.tsx` (new) — media URL input with validation
  - `src/client/components/blast/schedule-picker.tsx` (new) — inline date/time picker
- **What**: Add a media URL input field to the blast composer. Validates URL format and allowed schemes. Add an inline schedule date/time picker that sets `scheduledAt` on the blast. When schedule is set, the "Send" button changes to "Schedule". Both fields pass through to the existing create/update API endpoints.
- **Spec reference**: Architecture Decision 8 (Media Attachments), Must Enhance table
- **Acceptance**: Media URL stored in blast content; schedule picker sets scheduledAt; UI reflects scheduled state

### Task 2: WebSocket blast progress events
- **Platform**: backend + desktop
- **Files**:
  - `apps/worker/lib/blast-delivery-worker.ts` — emit WS `blast:progress` event after each batch
  - `src/client/routes/blasts.tsx` — subscribe to WS events for live delivery updates
  - `src/client/components/DeliveryStatusSheet.tsx` — update stats from WS events
- **What**: After each batch in the delivery worker, compute updated blast stats and emit a `blast:progress` WebSocket event to all hub subscribers with: `{ type, hubId, blastId, stats: { pending, sent, delivered, failed, optedOut, total }, batch: [{ deliveryId, status, error? }] }`. On the frontend, subscribe to these events in the blast detail view and update delivery stats in real-time. Fall back to 5s polling on WS disconnect.
- **Spec reference**: Architecture Decision 5 (Real-Time Blast Progress via WebSocket)
- **Acceptance**: Delivery stats update live during blast send; fallback polling works on disconnect

### Task 3: Fix @wip BDD scenarios
- **Platform**: backend
- **Files**:
  - `packages/test-specs/features/admin/blast-campaign.feature` — 3 @wip scenarios
  - Related step definitions in `tests/steps/`
- **What**: Fix the 3 @wip scenarios covering blast recipient selection, scheduling, and delivery status. These likely depend on the schedule picker and delivery tracking work. Remove @wip tags once passing.
- **Spec reference**: BDD test plan
- **Acceptance**: All 3 blast campaign scenarios pass; @wip tags removed

### Task 4: iOS — complete channel config views
- **Platform**: iOS
- **Files**:
  - `apps/ios/Sources/Views/Settings/Channels/SMSChannelConfigView.swift` (new)
  - `apps/ios/Sources/Views/Settings/Channels/WhatsAppChannelConfigView.swift` (new)
  - `apps/ios/Sources/Views/Settings/Channels/TelegramChannelConfigView.swift` (new)
  - `apps/ios/Sources/Views/Settings/Channels/A2pRegistrationView.swift` (new)
  - `apps/ios/Sources/Views/Settings/Channels/ConnectionTestButton.swift` (new)
  - `apps/ios/Sources/Views/Settings/Channels/AutoResponseFields.swift` (new)
  - `apps/ios/Sources/Services/MessagingConfigService.swift` (new)
- **What**: Build SMS, WhatsApp, and Telegram channel config views for iOS. SMS: enable/disable toggle, content mode picker, A2P registration management (shared panel), connection test. WhatsApp: integration mode toggle, credential fields (direct mode), connection test. Telegram: bot token, webhook config, connection test. Shared components: ConnectionTestButton (async test with status badge), AutoResponseFields (two text fields), A2pRegistrationView (brand/campaign status + submission). All views gated by `settings:manage-messaging` permission. API service for messaging config CRUD.
- **Spec reference**: Architecture Decision 7 (Mobile full hub admin), iOS New Files
- **Acceptance**: All 5 channel config views work on iOS; A2P management functional; connection tests work

### Task 5: iOS — complete blast CRUD UI
- **Platform**: iOS
- **Files**:
  - `apps/ios/Sources/Views/Blasts/BlastListView.swift` — enhance or create
  - `apps/ios/Sources/Views/Blasts/BlastComposerView.swift` — add media URL, schedule picker
  - `apps/ios/Sources/Views/Blasts/BlastDeliveryDetailView.swift` (new)
  - `apps/ios/Sources/Views/Blasts/BlastDeliveryRow.swift` (new)
  - `apps/ios/Sources/Services/BlastService.swift` (new)
- **What**: Full blast management on iOS: list with status badges, composer (name, text, channel selection, media URL, schedule), delivery detail sheet (status summary, filterable delivery list, per-delivery retry, "Retry All Failed"), real-time WS progress subscription. API service for blast CRUD.
- **Spec reference**: Architecture Decision 7, iOS New Files
- **Acceptance**: Full blast CRUD on iOS; delivery tracking with retry; real-time progress

### Task 6: Android — complete channel config views
- **Platform**: Android
- **Files**:
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/settings/channels/SmsChannelConfigScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/settings/channels/WhatsAppChannelConfigScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/settings/channels/TelegramChannelConfigScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/settings/channels/A2pRegistrationSection.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/settings/channels/ConnectionTestButton.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/settings/channels/AutoResponseFields.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/api/MessagingConfigRepository.kt` (new)
- **What**: Mirror iOS channel config views using Material 3 Compose. Same functionality: SMS (A2P management, content mode), WhatsApp (integration mode, credentials), Telegram (bot token, webhook). Shared composables for connection test, auto-response, A2P. Hilt-injected repository.
- **Spec reference**: Architecture Decision 7, Android New Files
- **Acceptance**: All 5 channel config views work on Android; Material 3 design

### Task 7: Android — complete blast CRUD UI
- **Platform**: Android
- **Files**:
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/blasts/BlastListScreen.kt` — enhance or create
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/blasts/BlastComposerScreen.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/blasts/BlastDeliveryDetailSheet.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/ui/blasts/BlastDeliveryItem.kt` (new)
  - `apps/android/app/src/main/kotlin/org/llamenos/app/api/BlastRepository.kt` (new)
- **What**: Mirror iOS blast UI: list with status badges, composer (name, text, channels, media, schedule), delivery detail bottom sheet (status summary, delivery list, retry actions), WS progress. Hilt-injected ViewModel + Repository.
- **Spec reference**: Architecture Decision 7, Android New Files
- **Acceptance**: Full blast CRUD on Android; delivery tracking; real-time progress

### Task 8: i18n for channels and blasts
- **Platform**: all
- **Files**:
  - `packages/i18n/locales/*.json` — add channel and blast delivery keys
- **What**: Add ~40-50 new keys: `channels.sms.*`, `channels.whatsapp.*`, `channels.telegram.*`, `channels.shared.*`, `channels.a2p.*`, `blasts.delivery.*`, `blasts.composer.*` (media, schedule), `blasts.progress.*`. All 13 locales. Run `bun run i18n:codegen` + `bun run i18n:validate:all`.
- **Spec reference**: i18n section
- **Acceptance**: `bun run i18n:validate:all` passes

### Task 9: E2E tests
- **Platform**: desktop
- **Files**:
  - `tests/channel-config.spec.ts` (new or extend)
  - `tests/blast-delivery.spec.ts` (new or extend)
- **What**: Playwright E2E: channel config CRUD + A2P management; blast composer with media/schedule, delivery sheet, retry. Verify channel enable/disable, connection test mock. Verify blast schedule flow.
- **Spec reference**: BDD / Playwright sections
- **Acceptance**: All Playwright tests pass
