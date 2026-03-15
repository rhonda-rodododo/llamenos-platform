# Epic 318: Contact Entity & E2EE Profiles

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 315 (Entity Schema Engine), Epic 316 (Blind Index Infrastructure)
**Blocks**: Epic 319, 322, 326, 328, 331
**Branch**: `desktop`

## Summary

Build the `ContactDirectoryDO` — a new per-hub Durable Object that stores E2EE contact profiles with configurable identifiers (phone, Signal username, name/nickname), blind indexes for lookup and deduplication, and the ability to link contacts to cases. This replaces the current flat `contactHash` aggregation with a first-class Contact entity where a person can have multiple identifiers, a rich encrypted profile, and relationships to other contacts. The contact profile is encrypted in two tiers: a summary (visible to all with `contacts:view`) and PII (visible only to those with `contacts:view-pii`). ~20 files created/modified.

## Problem Statement

Currently, contacts in Llamenos are just `contactHash` values — HMAC hashes of phone numbers. There is no way to:
- Store a person's name, demographics, or multiple contact methods
- Track the same person across different phone numbers (cell, jail phone, attorney's number)
- Build a searchable contact directory
- Associate a support contact with the people they represent
- View a person's full history across cases, calls, messages, and notes

The `GET /contacts` endpoint aggregates data from notes and conversations by contactHash, but there is no persistent Contact record. For case management, contacts are the central entity — everything revolves around people.

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: ContactDirectoryDO

**File**: `apps/worker/durable-objects/contact-directory-do.ts` (new)

New Durable Object class for per-hub contact storage:

```typescript
import { DurableObject } from 'cloudflare:workers'
import { DORouter } from '../lib/do-router'

export class ContactDirectoryDO extends DurableObject {
  private router: DORouter

  constructor(state: DurableObjectState, env: Env) {
    super(state, env)
    this.router = new DORouter()
    this.setupRoutes()
  }

  private setupRoutes() {
    // --- Contact CRUD ---

    // List contacts (paginated, with blind index filters)
    this.router.get('/contacts', async (req) => {
      const url = new URL(req.url)
      const page = parseInt(url.searchParams.get('page') ?? '1')
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100)
      const filters = parseBlindIndexFilters(url.searchParams)

      const allKeys = await this.ctx.storage.list({ prefix: 'contact:', limit: 1000 })
      let contacts: Contact[] = []
      for (const [, value] of allKeys) {
        const contact = value as Contact
        if (filters.size > 0 && !matchesBlindIndexFilters(contact.blindIndexes ?? {}, filters)) {
          continue
        }
        contacts.push(contact)
      }

      // Sort by lastInteractionAt descending
      contacts.sort((a, b) => (b.lastInteractionAt ?? b.createdAt).localeCompare(a.lastInteractionAt ?? a.createdAt))

      const start = (page - 1) * limit
      const paged = contacts.slice(start, start + limit)

      return json({
        contacts: paged,
        total: contacts.length,
        page,
        limit,
        hasMore: start + limit < contacts.length,
      })
    })

    // Get single contact
    this.router.get('/contacts/:id', async (req) => {
      const { id } = req.params
      const contact = await this.ctx.storage.get(`contact:${id}`)
      if (!contact) return json({ error: 'Contact not found' }, { status: 404 })
      return json(contact)
    })

    // Create contact
    this.router.post('/contacts', async (req) => {
      const body = await req.json() as CreateContactBody
      const id = crypto.randomUUID()
      const now = new Date().toISOString()

      const contact: Contact = {
        id,
        hubId: body.hubId,
        identifierHashes: body.identifierHashes,
        nameHash: body.nameHash,
        trigramTokens: body.trigramTokens,
        encryptedSummary: body.encryptedSummary,
        summaryEnvelopes: body.summaryEnvelopes,
        encryptedPII: body.encryptedPII,
        piiEnvelopes: body.piiEnvelopes,
        contactTypeHash: body.contactTypeHash,
        tagHashes: body.tagHashes ?? [],
        statusHash: body.statusHash,
        blindIndexes: body.blindIndexes ?? {},
        createdAt: now,
        updatedAt: now,
        lastInteractionAt: now,
        caseCount: 0,
        noteCount: 0,
        interactionCount: 0,
      }

      await this.ctx.storage.put(`contact:${id}`, contact)

      // Build reverse indexes
      for (const hash of body.identifierHashes) {
        await this.ctx.storage.put(`idx:id:${hash}`, id)
      }
      if (body.nameHash) {
        await this.ctx.storage.put(`idx:name:${body.nameHash}`, id)
      }
      for (const token of body.trigramTokens ?? []) {
        await this.ctx.storage.put(`idx:trigram:${token}:${id}`, true)
      }
      for (const tagHash of body.tagHashes ?? []) {
        await this.ctx.storage.put(`idx:tag:${tagHash}:${id}`, true)
      }

      return json(contact, { status: 201 })
    })

    // Update contact
    this.router.patch('/contacts/:id', async (req) => {
      const { id } = req.params
      const existing = await this.ctx.storage.get(`contact:${id}`) as Contact | undefined
      if (!existing) return json({ error: 'Contact not found' }, { status: 404 })

      const body = await req.json() as Partial<CreateContactBody>
      const updated: Contact = {
        ...existing,
        ...body,
        id,
        updatedAt: new Date().toISOString(),
      }

      // Update identifier indexes if changed
      if (body.identifierHashes) {
        // Remove old indexes
        for (const hash of existing.identifierHashes) {
          await this.ctx.storage.delete(`idx:id:${hash}`)
        }
        // Add new indexes
        for (const hash of body.identifierHashes) {
          await this.ctx.storage.put(`idx:id:${hash}`, id)
        }
      }

      // Update trigram indexes if changed
      if (body.trigramTokens) {
        // Remove old trigram indexes (scan for this contact)
        const oldTrigrams = await this.ctx.storage.list({ prefix: `idx:trigram:` })
        for (const [key] of oldTrigrams) {
          if (key.endsWith(`:${id}`)) await this.ctx.storage.delete(key)
        }
        // Add new trigram indexes
        for (const token of body.trigramTokens) {
          await this.ctx.storage.put(`idx:trigram:${token}:${id}`, true)
        }
      }

      await this.ctx.storage.put(`contact:${id}`, updated)
      return json(updated)
    })

    // Delete contact
    this.router.delete('/contacts/:id', async (req) => {
      const { id } = req.params
      const existing = await this.ctx.storage.get(`contact:${id}`) as Contact | undefined
      if (!existing) return json({ error: 'Contact not found' }, { status: 404 })

      // Remove indexes
      for (const hash of existing.identifierHashes) {
        await this.ctx.storage.delete(`idx:id:${hash}`)
      }

      // Remove trigram indexes
      const trigrams = await this.ctx.storage.list({ prefix: `idx:trigram:` })
      for (const [key] of trigrams) {
        if (key.endsWith(`:${id}`)) await this.ctx.storage.delete(key)
      }

      await this.ctx.storage.delete(`contact:${id}`)
      return json({ deleted: true })
    })

    // Lookup by identifier hash (phone number, Signal username, etc.)
    this.router.get('/contacts/lookup/:identifierHash', async (req) => {
      const { identifierHash } = req.params
      const contactId = await this.ctx.storage.get(`idx:id:${identifierHash}`)
      if (!contactId) return json({ contact: null })
      const contact = await this.ctx.storage.get(`contact:${contactId}`)
      return json({ contact })
    })

    // Search by trigram tokens
    this.router.get('/contacts/search', async (req) => {
      const url = new URL(req.url)
      const tokens = url.searchParams.get('tokens')?.split(',') ?? []
      if (tokens.length === 0) return json({ contacts: [] })

      // Find contact IDs matching ALL tokens (AND)
      const matchSets: Set<string>[] = []
      for (const token of tokens) {
        const keys = await this.ctx.storage.list({ prefix: `idx:trigram:${token}:` })
        const ids = new Set<string>()
        for (const [key] of keys) {
          ids.add(key.split(':').pop()!)
        }
        matchSets.push(ids)
      }

      // Intersect all sets
      let resultIds = matchSets[0] ?? new Set()
      for (let i = 1; i < matchSets.length; i++) {
        resultIds = new Set([...resultIds].filter(id => matchSets[i].has(id)))
      }

      // Fetch contacts
      const contacts: Contact[] = []
      for (const id of resultIds) {
        const contact = await this.ctx.storage.get(`contact:${id}`)
        if (contact) contacts.push(contact as Contact)
      }

      return json({ contacts })
    })

    // Increment interaction count (called when notes/calls/messages link to contact)
    this.router.post('/contacts/:id/interaction', async (req) => {
      const { id } = req.params
      const contact = await this.ctx.storage.get(`contact:${id}`) as Contact | undefined
      if (!contact) return json({ error: 'Not found' }, { status: 404 })

      contact.interactionCount++
      contact.lastInteractionAt = new Date().toISOString()
      await this.ctx.storage.put(`contact:${id}`, contact)
      return json({ interactionCount: contact.interactionCount })
    })
  }

  async fetch(request: Request): Promise<Response> {
    return this.router.handle(request)
  }
}
```

#### Task 2: Contact Data Types

**File**: `apps/worker/schemas/contacts.ts` (new)

```typescript
import { z } from 'zod'
import { recipientEnvelopeSchema, paginationSchema } from './common'

export const contactSchema = z.object({
  id: z.uuid(),
  hubId: z.string(),
  identifierHashes: z.array(z.string()),
  nameHash: z.string().optional(),
  trigramTokens: z.array(z.string()).optional(),
  encryptedSummary: z.string(),
  summaryEnvelopes: z.array(recipientEnvelopeSchema),
  encryptedPII: z.string().optional(),
  piiEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  contactTypeHash: z.string().optional(),
  tagHashes: z.array(z.string()),
  statusHash: z.string().optional(),
  blindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastInteractionAt: z.string(),
  caseCount: z.number(),
  noteCount: z.number(),
  interactionCount: z.number(),
})

export type Contact = z.infer<typeof contactSchema>

export const createContactBodySchema = z.object({
  hubId: z.string(),
  identifierHashes: z.array(z.string()).min(1),
  nameHash: z.string().optional(),
  trigramTokens: z.array(z.string()).optional(),
  encryptedSummary: z.string().min(1),
  summaryEnvelopes: z.array(recipientEnvelopeSchema).min(1),
  encryptedPII: z.string().optional(),
  piiEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  contactTypeHash: z.string().optional(),
  tagHashes: z.array(z.string()).optional(),
  statusHash: z.string().optional(),
  blindIndexes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
})

export type CreateContactBody = z.infer<typeof createContactBodySchema>

export const updateContactBodySchema = createContactBodySchema.partial()

export const listContactsQuerySchema = paginationSchema.extend({
  contactTypeHash: z.string().optional(),
  statusHash: z.string().optional(),
  nameToken: z.string().optional(),
})

// Encrypted payloads (client-side only)
export const contactSummarySchema = z.object({
  displayName: z.string(),
  contactType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
})

export const contactPIISchema = z.object({
  legalName: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  identifiers: z.array(z.object({
    type: z.enum(['phone', 'signal', 'email', 'nickname', 'legal_name', 'custom']),
    value: z.string(),
    label: z.string().optional(),
    isPrimary: z.boolean().default(false),
  })),
  demographics: z.object({
    pronouns: z.string().optional(),
    language: z.string().optional(),
    age: z.number().optional(),
    race: z.string().optional(),
    gender: z.string().optional(),
    nationality: z.string().optional(),
  }).optional(),
  emergencyContacts: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string().optional(),
    signal: z.string().optional(),
  })).optional(),
  notes: z.string().optional(),
  communicationPreferences: z.object({
    preferredChannel: z.enum(['signal', 'sms', 'whatsapp', 'phone', 'email']).optional(),
    preferredLanguage: z.string().optional(),
    doNotContact: z.boolean().optional(),
  }).optional(),
})
```

#### Task 3: Wrangler Binding

**File**: `apps/worker/wrangler.jsonc`

```jsonc
// Add to durable_objects.bindings:
{ "name": "CONTACT_DIRECTORY", "class_name": "ContactDirectoryDO" }

// Add to migrations:
// CaseDO (Epic 319) shares this migration — both DOs deploy together
{ "tag": "v6", "new_classes": ["ContactDirectoryDO", "CaseDO"] }
```

#### Task 4: DO Access Extension

**File**: `apps/worker/lib/do-access.ts`

```typescript
// Add CONTACT_DIRECTORY to getDOs() and getScopedDOs():
contactDirectory: env.CONTACT_DIRECTORY.get(
  env.CONTACT_DIRECTORY.idFromName(hubId ?? 'global-contacts')
),
```

#### Task 5: Contact API Routes

**File**: `apps/worker/routes/contacts-v2.ts` (new — the existing contacts.ts is the legacy aggregation)

```typescript
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission, checkPermission } from '../middleware/permission-guard'
import { validator } from 'hono-openapi'
import { createContactBodySchema, updateContactBodySchema, listContactsQuerySchema } from '../schemas/contacts'
import { audit } from '../services/audit'

const contactsV2 = new Hono<AppEnv>()

// List contacts
contactsV2.get('/',
  requirePermission('contacts:view'),
  validator('query', listContactsQuerySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const query = c.req.valid('query')
    const qs = new URLSearchParams()
    qs.set('page', String(query.page))
    qs.set('limit', String(query.limit))
    if (query.contactTypeHash) qs.set('contactTypeHash', query.contactTypeHash)
    if (query.statusHash) qs.set('statusHash', query.statusHash)

    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts?${qs}`))
    return new Response(res.body, res)
  },
)

// Lookup by identifier hash
contactsV2.get('/lookup/:identifierHash',
  requirePermission('contacts:view'),
  async (c) => {
    const hash = c.req.param('identifierHash')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/lookup/${hash}`))
    return new Response(res.body, res)
  },
)

// Search by name trigrams
contactsV2.get('/search',
  requirePermission('contacts:view'),
  async (c) => {
    const tokens = c.req.query('tokens')
    if (!tokens) return c.json({ contacts: [] })
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/search?tokens=${tokens}`))
    return new Response(res.body, res)
  },
)

// Create contact
contactsV2.post('/',
  requirePermission('contacts:create'),
  validator('json', createContactBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.contactDirectory.fetch(new Request('http://do/contacts', {
      method: 'POST',
      body: JSON.stringify({ ...body, hubId: c.get('hubId') }),
    }))
    if (!res.ok) return new Response(res.body, res)
    const contact = await res.json()
    await audit(dos.records, 'contactCreated', c.get('pubkey'), { contactId: (contact as { id: string }).id })
    return c.json(contact, 201)
  },
)

// Update contact
contactsV2.patch('/:id',
  requirePermission('contacts:edit'),
  validator('json', updateContactBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }))
    if (!res.ok) return new Response(res.body, res)
    await audit(dos.records, 'contactUpdated', c.get('pubkey'), { contactId: id })
    return new Response(res.body, res)
  },
)

// Delete contact
contactsV2.delete('/:id',
  requirePermission('contacts:delete'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/${id}`, {
      method: 'DELETE',
    }))
    if (!res.ok) return new Response(res.body, res)
    await audit(dos.records, 'contactDeleted', c.get('pubkey'), { contactId: id })
    return new Response(res.body, res)
  },
)

// Get single contact
contactsV2.get('/:id',
  requirePermission('contacts:view'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.contactDirectory.fetch(new Request(`http://do/contacts/${id}`))
    return new Response(res.body, res)
  },
)

export default contactsV2
```

#### Task 6: Mount Routes

**File**: `apps/worker/app.ts`

```typescript
import contactsV2 from './routes/contacts-v2'
// Mount under /api/directory to avoid conflict with existing /api/contacts
app.route('/api/directory', contactsV2)
```

#### Task 7: BDD Feature File

**File**: `packages/test-specs/features/core/contacts.feature`

```gherkin
@backend
Feature: Contact Directory
  Manage contacts with E2EE profiles, configurable identifiers,
  and blind index search capabilities.

  Background:
    Given a registered admin "admin1"
    And case management is enabled

  @contacts
  Scenario: Create a contact with encrypted profile
    When admin "admin1" creates a contact with:
      | displayName   | Carlos Martinez     |
      | identifiers   | phone:+15551234567  |
      | contactType   | caller              |
    Then the contact should exist with a generated UUID
    And the contact should have an encrypted summary
    And the contact should have identifier hash indexes

  @contacts
  Scenario: Create contact with multiple identifiers
    When admin "admin1" creates a contact with identifiers:
      | type    | value           |
      | phone   | +15551234567    |
      | signal  | carlos.m        |
      | phone   | +15559876543    |
    Then the contact should have 3 identifier hashes
    And looking up by any identifier hash should return the same contact

  @contacts
  Scenario: Search contacts by name (trigram)
    Given contacts exist:
      | displayName       |
      | Carlos Martinez   |
      | Maria Garcia      |
      | Carmen Lopez      |
    When admin "admin1" searches for name "car"
    Then the results should include "Carlos Martinez"
    And the results should include "Carmen Lopez"
    And the results should not include "Maria Garcia"

  @contacts
  Scenario: Lookup contact by phone hash
    Given a contact "Carlos Martinez" with phone "+15551234567"
    When admin "admin1" looks up by phone hash for "+15551234567"
    Then the result should be "Carlos Martinez"

  @contacts
  Scenario: Update contact profile
    Given a contact "Carlos Martinez" exists
    When admin "admin1" updates the contact with new encrypted profile
    Then the contact's updatedAt should be updated
    And the contact should have the new encrypted summary

  @contacts
  Scenario: Contact PII tier restricted to admins
    Given a contact "Carlos Martinez" with PII tier data
    And a registered volunteer "vol1"
    When volunteer "vol1" fetches the contact
    Then the response should include encryptedSummary
    But the volunteer should NOT have PII envelope keys

  @contacts
  Scenario: Delete contact
    Given a contact "test_contact" exists
    When admin "admin1" deletes the contact
    Then the contact should not exist
    And identifier hash lookups should return null

  @contacts @permissions
  Scenario: Volunteer can view but not create contacts
    Given a registered volunteer "vol1" with permission "contacts:view"
    When volunteer "vol1" tries to create a contact
    Then the response status should be 403
```

#### Task 8: i18n Strings

**File**: `packages/i18n/locales/en.json`

```json
{
  "contacts": {
    "directory": "Contact Directory",
    "createContact": "New Contact",
    "editContact": "Edit Contact",
    "deleteContact": "Delete Contact",
    "deleteConfirm": "Delete this contact? This cannot be undone.",
    "searchPlaceholder": "Search contacts by name...",
    "noContacts": "No contacts yet. Create one or they'll be added automatically from calls.",
    "identifiers": "Contact Methods",
    "addIdentifier": "Add Contact Method",
    "phone": "Phone",
    "signal": "Signal",
    "email": "Email",
    "nickname": "Nickname",
    "displayName": "Display Name",
    "legalName": "Legal Name",
    "contactType": "Contact Type",
    "demographics": "Demographics",
    "emergencyContacts": "Emergency Contacts",
    "communicationPreferences": "Communication Preferences",
    "cases": "Cases",
    "interactions": "Interactions",
    "lastInteraction": "Last interaction",
    "noCases": "No cases linked to this contact"
  }
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/durable-objects/contact-directory-do.ts` | ContactDirectoryDO with full CRUD + indexes |
| `apps/worker/schemas/contacts.ts` | Zod schemas for contact data types |
| `apps/worker/routes/contacts-v2.ts` | API routes for contact directory |
| `packages/test-specs/features/core/contacts.feature` | BDD scenarios |
| `tests/steps/backend/contacts.steps.ts` | Backend step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/wrangler.jsonc` | Add CONTACT_DIRECTORY binding + v6 migration |
| `apps/worker/lib/do-access.ts` | Add contactDirectory to getDOs/getScopedDOs |
| `apps/worker/app.ts` | Mount contacts-v2 routes at /api/directory |
| `packages/i18n/locales/en.json` | Add contacts i18n section |
| `packages/i18n/locales/*.json` | Propagate to all 13 locales |
| `packages/protocol/tools/schema-registry.ts` | Register contact schemas |

## Testing

### Backend BDD
- `bun run test:backend:bdd` — 8 scenarios in `contacts.feature`

## Acceptance Criteria & Test Scenarios

- [ ] Contacts can be created with encrypted profiles and identifier hashes
  -> `packages/test-specs/features/core/contacts.feature: "Create a contact with encrypted profile"`
- [ ] Contacts support multiple identifiers with reverse lookup
  -> `packages/test-specs/features/core/contacts.feature: "Create contact with multiple identifiers"`
- [ ] Name search works via trigram blind indexes
  -> `packages/test-specs/features/core/contacts.feature: "Search contacts by name"`
- [ ] Lookup by phone hash returns the correct contact
  -> `packages/test-specs/features/core/contacts.feature: "Lookup contact by phone hash"`
- [ ] Contact profiles can be updated
  -> `packages/test-specs/features/core/contacts.feature: "Update contact profile"`
- [ ] PII tier is restricted to admin envelope holders
  -> `packages/test-specs/features/core/contacts.feature: "Contact PII tier restricted to admins"`
- [ ] Contacts can be deleted with index cleanup
  -> `packages/test-specs/features/core/contacts.feature: "Delete contact"`
- [ ] Permission enforcement for contact operations
  -> `packages/test-specs/features/core/contacts.feature: "Volunteer can view but not create contacts"`
- [ ] All platform BDD suites pass (`bun run test:all`)
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/contacts.feature` | New | 8 scenarios for contact operations |
| `tests/steps/backend/contacts.steps.ts` | New | Backend step definitions |

## Risk Assessment

- **Medium risk**: New DO (Task 1) — first new DO in the CMS system. Must carefully follow existing patterns (DORouter, storage prefix conventions, getScopedDOs integration). The ContactDirectoryDO is per-hub via `idFromName(hubId)`.
- **Low risk**: Schemas (Task 2) — standard Zod definitions
- **Low risk**: Routes (Task 5) — follows existing report/conversation patterns
- **Medium risk**: Trigram search (Task 1, search handler) — performance with 1000+ contacts each having multiple trigram index entries. Mitigated by limiting trigram length and using `storage.list()` prefix scans.

## Execution

- Tasks 1-2 are the core (DO + schemas)
- Tasks 3-4 are infrastructure (wrangler + DO access)
- Task 5 depends on 1-4 (routes)
- **Phase 1**: DO → Schemas → Wrangler → DO access → Routes → Mount → i18n → BDD → gate
- **Phase 2**: No desktop UI in this epic (contact directory UI is Epic 331)
- **Phase 3**: `bun run test:all`
