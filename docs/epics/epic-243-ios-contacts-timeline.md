# Epic 243: iOS Contacts & Timeline

## Summary

Implement the Contacts feature for iOS — an admin-only screen showing all callers (hashed identifiers) with interaction counts, plus a per-contact timeline aggregating calls, conversations, notes, and reports. Privacy-first: only admins see contacts, identifiers are HMAC-hashed, only admins see last-4 digits.

## Context

- **Android has**: ContactsScreen (paginated list + search) + ContactTimelineScreen (chronological event list with type icons)
- **iOS has**: Nothing — no contacts model, no views
- **API**: `GET /api/contacts?page=1&limit=50&search=`, `GET /api/contacts/:hash/timeline?limit=100`
- **Admin-only**: Contacts are only visible to users with `contacts:view` permission

## Data Models

### Contact.swift (new file in Sources/Models/)

```swift
struct ContactSummary: Identifiable, Decodable {
    var id: String { contactHash }
    let contactHash: String
    let last4: String?              // only for admins
    let firstSeen: String
    let lastSeen: String
    let callCount: Int
    let conversationCount: Int
    let noteCount: Int
    let reportCount: Int

    var displayIdentifier: String {
        if let last4 { return "***\(last4)" }
        return String(contactHash.prefix(8)) + "..."
    }
}

struct ContactTimelineEvent: Identifiable, Decodable {
    let id: String
    let type: String                // "call", "conversation", "note", "report"
    let timestamp: String
    let summary: String?
    let status: String?
    let duration: Int?              // seconds, for calls

    var eventType: ContactEventType { ContactEventType(rawValue: type) ?? .call }
}

enum ContactEventType: String {
    case call, conversation, note, report

    var icon: String { /* phone.fill, message.fill, doc.text.fill, exclamationmark.triangle.fill */ }
    var color: Color { /* blue, green, purple, orange */ }
    var displayName: String { /* localized */ }
}
```

## Views

### ContactsView.swift — List Screen

Admin-only. Accessible from Dashboard quick action or Admin panel.

- **Searchable list**: `.searchable(text: $viewModel.searchQuery)`
- **Contact rows**: Display identifier, interaction count badges (phone + chat + doc icons with counts), first/last seen dates
- **Pagination**: Load more when scrolling near bottom
- **Empty state**: "No Contacts" with explanation
- **Accessibility**: `contacts-list`, `contacts-empty-state`, `contacts-loading`, `contact-row-{hash}`

### ContactTimelineView.swift — Timeline Screen

Pushed from ContactsView row tap:

- **Header**: Contact identifier, total interactions summary
- **Timeline list**: Reverse chronological, grouped by date
  - Event cards with: type icon (color-coded), type name, status badge, summary (2-line), timestamp, duration (for calls)
- **Empty state**: "No interactions recorded"
- **Accessibility**: `contact-timeline`, `timeline-event-{id}`, `timeline-empty-state`

## ViewModel

### ContactsViewModel.swift

```swift
@Observable
final class ContactsViewModel {
    private let apiService: APIService

    var contacts: [ContactSummary] = []
    var total: Int = 0
    var currentPage: Int = 1
    var searchQuery: String = ""
    var isLoading = false
    var hasMore: Bool { contacts.count < total }

    func loadContacts(page: Int = 1) async { /* GET /api/contacts */ }
    func loadMore() async { /* increment page, append results */ }
    func search() async { /* reset page, load with query */ }
}
```

### ContactTimelineViewModel.swift

```swift
@Observable
final class ContactTimelineViewModel {
    private let apiService: APIService
    let contactHash: String

    var events: [ContactTimelineEvent] = []
    var total: Int = 0
    var isLoading = false

    func loadTimeline() async { /* GET /api/contacts/:hash/timeline */ }
}
```

## Navigation

Add `.contacts` and `.contactTimeline(hash: String)` to Route enum. Accessible from:
- Dashboard → Quick Actions → "Contacts" (admin only)
- Admin panel could also link to it

## BDD Tests — ContactsUITests.swift

```
Scenario: Contacts list shows for admin
  Given I am authenticated as admin with API
  When I navigate to contacts
  Then I should see the contacts list or empty state

Scenario: Contact timeline shows interaction history
  Given I am authenticated as admin with API
  And a contact exists with interactions
  When I tap on a contact
  Then I should see the contact timeline

Scenario: Contacts not accessible to volunteers
  Given I am authenticated as volunteer
  Then I should not see the contacts quick action
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `Sources/Models/Contact.swift` | Create |
| `Sources/ViewModels/ContactsViewModel.swift` | Create |
| `Sources/ViewModels/ContactTimelineViewModel.swift` | Create |
| `Sources/Views/Contacts/ContactsView.swift` | Create |
| `Sources/Views/Contacts/ContactTimelineView.swift` | Create |
| `Sources/Navigation/Router.swift` | Modify — add contact routes |
| `Sources/Views/Dashboard/DashboardView.swift` | Modify — add contacts quick action (admin) |
| `Tests/UI/ContactsUITests.swift` | Create |

## Dependencies

- Epic 240 (Docker test infra) for live API tests
- Admin role check in AppState
