# Epic 245: iOS Blasts (Broadcast Messaging)

## Summary

Implement the Blasts feature for iOS — an admin-only screen for sending broadcast messages to subscribers via SMS/WhatsApp/Signal. Admins compose a message, select target channels/tags/languages, and send or schedule delivery. The BlastDO handles async delivery with per-recipient status tracking.

## Context

- **Android has**: BlastsScreen (list of sent/scheduled blasts) + CreateBlastDialog (message + volunteer selection + schedule option)
- **iOS has**: Nothing — no Blast model, no views
- **API**: `GET/POST /api/blasts`, `POST /api/blasts/:id/send`, `POST /api/blasts/:id/schedule`, `GET /api/blasts/subscribers`
- **Admin-only feature**: Only admins can create and manage blasts

## Data Models

### Blast.swift (new file in Sources/Models/)

```swift
struct Blast: Identifiable, Decodable {
    let id: String
    let name: String
    let content: [String: [String: String]]  // { "en": { "sms": "...", "signal": "..." } }
    let targetChannels: [String]
    let targetTags: [String]
    let targetLanguages: [String]
    let status: String                        // "draft", "sent", "scheduled", "cancelled"
    let createdAt: String
    let sentAt: String?
    let scheduledAt: String?

    var statusEnum: BlastStatus { BlastStatus(rawValue: status) ?? .draft }
    var messagePreview: String { /* extract first language/channel text */ }
}

enum BlastStatus: String, CaseIterable {
    case draft, sent, scheduled, cancelled
    var icon: String { /* pencil, paperplane.fill, clock.fill, xmark.circle.fill */ }
    var color: Color { /* gray, blue, orange, red */ }
}

struct BlastSubscriberStats: Decodable {
    let total: Int
    let active: Int
    let paused: Int
    let unsubscribed: Int
}
```

## Views

### BlastsView.swift — List Screen

Admin-only. Accessible from Dashboard quick action.

- **Subscriber stats card**: Total, active, paused counts
- **Blast list**: Cards with message preview (2-line), status badge, channel chips, recipient count, timestamp
- **Create button**: FAB or toolbar plus icon → presents CreateBlastView sheet
- **Empty state**: "No Blasts" with "Create First Blast" button
- **Accessibility**: `blasts-list`, `blasts-empty-state`, `create-blast-button`, `blast-row-{id}`

### CreateBlastView.swift — Create Sheet

Form for composing a new blast:
- **Name**: TextField (required)
- **Message**: TextEditor for default content (required)
- **Target channels**: Multi-select chips (SMS, WhatsApp, Signal)
- **Target tags**: Optional tag filter
- **Target languages**: Language picker (from available languages)
- **Actions**: "Send Now" button, "Schedule" button (with date picker)
- **Subscriber preview**: Shows estimated recipient count
- **Accessibility**: `blast-name-input`, `blast-message-input`, `blast-send-button`, `blast-schedule-button`

## ViewModel

### BlastsViewModel.swift

```swift
@Observable
final class BlastsViewModel {
    private let apiService: APIService

    var blasts: [Blast] = []
    var subscriberStats: BlastSubscriberStats?
    var isLoading = false
    var isSending = false
    var errorMessage: String?

    func loadBlasts() async { /* GET /api/blasts */ }
    func loadSubscriberStats() async { /* GET /api/blasts/subscribers/stats */ }
    func createBlast(name: String, message: String, channels: [String]) async -> String? { /* POST, return id */ }
    func sendBlast(id: String) async { /* POST /api/blasts/:id/send */ }
    func scheduleBlast(id: String, at: Date) async { /* POST /api/blasts/:id/schedule */ }
}
```

## Navigation

Add `.blasts` to Route enum. Accessible from Dashboard quick actions (admin only).

## BDD Tests — BlastsUITests.swift

```
Scenario: Blasts list shows for admin
  Given I am authenticated as admin with API
  When I navigate to blasts
  Then I should see the blasts list or empty state

Scenario: Create and send a blast
  Given I am authenticated as admin with API
  When I navigate to create blast
  And I fill in blast name "Test Blast"
  And I fill in blast message "Hello volunteers"
  And I select SMS channel
  And I tap send
  Then I should see "Test Blast" in the blasts list

Scenario: Blasts not accessible to volunteers
  Given I am authenticated as volunteer
  Then I should not see the blasts quick action
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `Sources/Models/Blast.swift` | Create |
| `Sources/ViewModels/BlastsViewModel.swift` | Create |
| `Sources/Views/Blasts/BlastsView.swift` | Create |
| `Sources/Views/Blasts/CreateBlastView.swift` | Create |
| `Sources/Navigation/Router.swift` | Modify — add `.blasts` route |
| `Sources/Views/Dashboard/DashboardView.swift` | Modify — add blasts quick action (admin) |
| `Tests/UI/BlastsUITests.swift` | Create |

## Dependencies

- Epic 240 (Docker test infra) for live API tests
- Admin role required
- BlastDO backend routes (already implemented)
