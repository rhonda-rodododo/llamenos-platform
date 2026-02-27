# Epic 126: Mobile Contacts Page

## Summary

Add the Contacts page to the mobile app — an admin-only screen showing a unified timeline of all caller interactions (notes, conversations, reports). This mirrors the desktop's contacts page (Epic 123) with mobile-native patterns.

**Prerequisites**: Epic 125 (types & API alignment must be done first for `ContactSummary`, `listContacts`, `getContactTimeline`).

## Current State

- The mobile app has no contacts screen at all
- The tab navigator has 5 tabs (Dashboard, Notes, Conversations, Shifts, Settings) — no Contacts tab
- Admin screens live under `app/admin/` as a stack navigator (Volunteers, Bans, Audit, Settings)
- The `contacts:view` permission exists in the permission catalog but is not used anywhere in mobile
- Types and API endpoints will be added in Epic 125

## Design Decision: Admin Stack vs. Tab

The contacts page is admin-only (requires `contacts:view` permission). On desktop, it's a sidebar nav link. On mobile, two options:

**Option A: Add to Admin stack** (recommended)
- `app/admin/contacts.tsx` — accessible from Settings → Admin section
- Consistent with existing admin pages (Volunteers, Bans, Audit)
- No tab bar clutter for volunteers who can't use it

**Option B: Add as conditional tab**
- Like Conversations tab with `href: canViewContacts ? undefined : null`
- More discoverable for admins but adds noise

**Decision**: Option A — Admin stack. Add a "Contacts" row in the admin section of the settings screen, linking to `app/admin/contacts.tsx`.

## Implementation Plan

### Phase 1: Contacts List Screen

**New file: `app/admin/contacts.tsx`**

```typescript
import { useState, useCallback } from 'react'
import { View, Text, FlatList, RefreshControl, Pressable } from 'react-native'
import { Stack, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useColorScheme } from 'nativewind'
import { ContactRow } from '@/components/ContactRow'
import { ListSkeleton } from '@/components/Skeleton'
import { colors } from '@/lib/theme'
import { haptic } from '@/lib/haptics'
import * as apiClient from '@/lib/api-client'

const PAGE_SIZE = 50

export default function ContactsScreen() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  // ... TanStack Query for listContacts({ page, limit: PAGE_SIZE })
  // FlatList with ContactRow items
  // Pull-to-refresh
  // Pagination via onEndReached
  // Empty state when no contacts
}
```

### Phase 2: ContactRow Component

**New file: `src/components/ContactRow.tsx`**

Each row shows:
- Masked phone number (`***-XXXX`) or truncated hash
- Last seen date
- Badge counts: notes (StickyNote icon), conversations (MessageSquare), reports (FileText)
- Chevron right indicating navigation

```typescript
interface ContactRowProps {
  contact: ContactSummary
  onPress: (hash: string) => void
}

export function ContactRow({ contact, onPress }: ContactRowProps) {
  return (
    <Pressable
      className="flex-row items-center gap-3 border-b border-border bg-card px-4 py-3"
      onPress={() => onPress(contact.contactHash)}
      testID="contact-row"
    >
      {/* Contact icon + phone mask */}
      <View className="flex-1">
        <Text className="font-medium text-foreground">
          {contact.last4 ? `***-${contact.last4}` : contact.contactHash.slice(0, 12) + '...'}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {t('contacts.lastSeen')}: {new Date(contact.lastSeen).toLocaleDateString()}
        </Text>
      </View>
      {/* Badge counts */}
      <View className="flex-row gap-1.5">
        {contact.noteCount > 0 && <Badge icon="sticky-note" count={contact.noteCount} />}
        {contact.conversationCount > 0 && <Badge icon="message" count={contact.conversationCount} />}
        {contact.reportCount > 0 && <Badge icon="file" count={contact.reportCount} />}
      </View>
    </Pressable>
  )
}
```

### Phase 3: Contact Timeline Detail

**New file: `app/admin/contact/[hash].tsx`**

When a contact is tapped, navigate to a detail screen showing the unified timeline:

```
app/admin/contact/[hash].tsx
  Stack.Screen title = "***-XXXX" or "Contact"
  ScrollView:
    ├── Metadata card (first seen, last seen)
    ├── Notes card (if notes.length > 0)
    │   └── For each note: date, call/conversation badge, decrypted text
    ├── Conversations card (if conversations.length > 0)
    │   └── For each: channel badge, status, message count, last message
    └── Empty state (if both empty)
```

Note decryption follows the same V2/V1 pattern as `NoteCard`:
```typescript
// Admin decryption: find own envelope in adminEnvelopes
const envelope = note.adminEnvelopes?.find(e => e.pubkey === publicKey) ?? note.adminEnvelopes?.[0]
if (envelope) {
  const payload = decryptNoteV2(note.encryptedContent, envelope, sk)
  // ...
}
```

Conversation items are metadata-only (channel type badge, status, message count, last message timestamp) — no message content decryption on the timeline view, matching the desktop behavior.

### Phase 4: Admin Navigation

**File: `app/(tabs)/settings.tsx`**

Add a "Contacts" row to the admin section:
```typescript
// In the admin section (after Volunteers, Bans, Audit)
<Pressable
  className="flex-row items-center gap-3 px-4 py-3"
  onPress={() => router.push('/admin/contacts')}
  testID="admin-contacts-link"
>
  <Text className="flex-1 text-foreground">{t('contacts.title', 'Contacts')}</Text>
  <ChevronRight />
</Pressable>
```

This row should only render when `usePermission('contacts:view')` returns true.

**File: `app/admin/_layout.tsx`**

Add the contacts routes to the admin stack:
```typescript
<Stack.Screen name="contacts" options={{ title: t('contacts.title', 'Contacts') }} />
<Stack.Screen name="contact/[hash]" options={{ title: t('contacts.contact', 'Contact') }} />
```

## Files Changed

| File | Action |
|------|--------|
| `app/admin/contacts.tsx` | NEW — contacts list screen |
| `app/admin/contact/[hash].tsx` | NEW — contact timeline detail |
| `src/components/ContactRow.tsx` | NEW — contact list row component |
| `app/admin/_layout.tsx` | Add contacts + contact/[hash] routes |
| `app/(tabs)/settings.tsx` | Add admin Contacts nav link |

## Security Considerations

- Contacts page is admin-only — `contacts:view` permission is checked both:
  - Client-side: settings screen only shows the link for admins
  - Server-side: `GET /api/contacts` returns 403 for non-admin users
- Contact hashes are HMAC-derived — the actual phone numbers are never sent to the client
- `last4` is the only PII exposed, and only for contacts who had conversations (not call-only contacts)
- Note decryption uses admin envelopes — volunteers cannot decrypt notes they didn't author

## Testing

- Detox tests in Epic 128
- Manual: Settings → Contacts → verify list renders → tap contact → verify timeline → verify decrypted notes
- Verify volunteer users don't see the Contacts link in settings
