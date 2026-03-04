# Epic 242: iOS Help Screen

## Summary

Implement a Help screen for iOS with security overview cards, role-based guides (volunteer/admin), and FAQ sections. This is a static/presentational screen — no API calls needed. Follows the Android HelpScreen pattern but with iOS-native design (expandable `DisclosureGroup` sections, SF Symbols, grouped `List`).

## Context

- **Android has**: HelpScreen with security overview, volunteer guide (5 tips), admin guide (5 tips), FAQ sections (Getting Started, Calls, Notes, Admin)
- **iOS has**: Nothing — no HelpView
- **Complexity**: Low — purely UI, no networking, no crypto, no state management

## Views

### HelpView.swift

A scrollable `List` with grouped sections:

**Section 1: Security Overview**
- Row: "Notes" → "End-to-end encrypted" (lock.fill, green)
- Row: "Reports" → "End-to-end encrypted" (lock.fill, green)
- Row: "Authentication" → "Nostr keypair + WebAuthn" (key.fill, blue)
- Row: "Sessions" → "Encrypted device tokens" (shield.fill, purple)
- Accessibility: `help-security-section`

**Section 2: Volunteer Guide** (DisclosureGroup, expandable)
- "How calls work" — parallel ringing, first pickup, shift-based routing
- "Managing your shift" — clock in/out, break mode, availability
- "Taking notes" — create notes during/after calls, custom fields, E2EE
- "Encryption basics" — your key never leaves the device, admin dual-encryption
- "Staying safe" — lock app when away, PIN protection, panic wipe
- Accessibility: `help-volunteer-guide`

**Section 3: Admin Guide** (DisclosureGroup, expandable, visible only to admins)
- "Managing volunteers" — invite, role assignment, deactivation
- "Shift scheduling" — recurring shifts, ring groups, fallback
- "Audit logs" — tamper-evident chain, all actions logged
- "Spam mitigation" — voice CAPTCHA, rate limiting, ban lists
- "Reports & contacts" — incident reports, caller timeline
- Accessibility: `help-admin-guide`

**Section 4: FAQ** (multiple DisclosureGroups)
- Getting Started (3 Q&A)
- Calls (2 Q&A)
- Notes (2 Q&A)
- Admin (3 Q&A, admin-only)
- Accessibility: `help-faq-section`

**Footer**: App version + "Llamenos - Secure Crisis Response"

### Navigation

Accessible from Dashboard as a quick action or from Settings. Add a `Route.help` case.

## BDD Tests — HelpUITests.swift

```
Scenario: Help screen shows security section
  Given I am authenticated
  When I navigate to the help screen
  Then I should see the security overview section

Scenario: Help screen shows volunteer guide
  Given I am authenticated
  When I navigate to the help screen
  Then I should see the volunteer guide section

Scenario: Admin guide visible for admin users
  Given I am authenticated as admin
  When I navigate to the help screen
  Then I should see the admin guide section

Scenario: FAQ sections are expandable
  Given I am authenticated
  When I navigate to the help screen
  Then I should see FAQ sections
```

## Files to Create

| File | Action |
|------|--------|
| `Sources/Views/Help/HelpView.swift` | Create |
| `Sources/Navigation/Router.swift` | Modify — add `.help` route |
| `Sources/Views/Dashboard/DashboardView.swift` | Modify — add Help quick action |
| `Tests/UI/HelpUITests.swift` | Create |

## Dependencies

- None (static UI)
- AppState.isAdmin for conditional admin guide visibility
