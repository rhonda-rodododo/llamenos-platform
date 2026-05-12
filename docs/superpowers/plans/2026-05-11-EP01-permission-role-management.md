# EP01: Permission System & Role Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the PBAC system — pure permission-based nav gating, encrypted role management (platform + hub), scope-aware permission picker, template role import, React Query, and read-only mobile role viewers.

**Architecture:** PR 283's admin shell provides the nav config, section registry, and routing. This plan adds the permission catalog entries, removes `requiredRole`, builds the role editor UI with shared components (PermissionPicker, RoleList, RoleEditor), adds per-admin HPKE envelope encryption for platform roles, and delivers mobile read-only viewers. All role names/descriptions are E2EE — hub roles via hub key, platform roles via per-admin HPKE envelopes.

**Tech Stack:** TypeScript (React, TanStack Query), Rust (packages/crypto HPKE), Hono (backend routes), Drizzle ORM (PostgreSQL), SwiftUI (iOS), Kotlin/Compose (Android), Zod (schemas), packages/protocol codegen.

**Prerequisite:** PR 283 (admin sidebar port) must be merged before starting. Rebase onto main after merge.

---

## Phase 1: Permission Catalog & Crypto Labels

### Task 1: Add system permissions and PERMISSION_GROUP_LABELS

**Files:**
- Modify: `packages/shared/permissions.ts`
- Test: `packages/shared/__tests__/permissions.test.ts` (create if needed)

- [ ] **Step 1: Write test for new permissions**

Check for existing test file first:
```bash
ls packages/shared/__tests__/ 2>/dev/null || echo "no test dir"
```

Create `packages/shared/__tests__/permissions.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test'
import {
  PERMISSION_CATALOG,
  PERMISSION_GROUP_LABELS,
  Permission,
  permissionGranted,
  getPermissionsByDomain,
  isValidPermission,
} from '../permissions'

describe('new system:view-* permissions', () => {
  const newPerms = [
    'system:view-platform',
    'system:view-bans',
    'system:view-audit',
    'system:view-analytics',
    'system:view-health',
  ] as const

  test.each(newPerms)('%s exists in PERMISSION_CATALOG', (perm) => {
    expect(perm in PERMISSION_CATALOG).toBe(true)
  })

  test.each(newPerms)('%s is a valid permission', (perm) => {
    expect(isValidPermission(perm)).toBe(true)
  })

  test('super-admin wildcard grants all new permissions', () => {
    for (const perm of newPerms) {
      expect(permissionGranted(['*'], perm)).toBe(true)
    }
  })

  test('system:* wildcard grants all new permissions', () => {
    for (const perm of newPerms) {
      expect(permissionGranted(['system:*'], perm)).toBe(true)
    }
  })
})

describe('PERMISSION_GROUP_LABELS', () => {
  test('every domain in catalog has a label', () => {
    const domains = Object.keys(getPermissionsByDomain())
    for (const domain of domains) {
      expect(PERMISSION_GROUP_LABELS[domain]).toBeDefined()
      expect(typeof PERMISSION_GROUP_LABELS[domain]).toBe('string')
    }
  })

  test('no label exists for a non-existent domain', () => {
    const domains = new Set(Object.keys(getPermissionsByDomain()))
    for (const labelDomain of Object.keys(PERMISSION_GROUP_LABELS)) {
      expect(domains.has(labelDomain)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/shared/__tests__/permissions.test.ts`
Expected: FAIL — `PERMISSION_GROUP_LABELS` not exported, new permissions not in catalog.

- [ ] **Step 3: Add new permissions to PERMISSION_CATALOG**

In `packages/shared/permissions.ts`, add to the `system` section of `PERMISSION_CATALOG` (near the existing `system:manage-roles`, `system:manage-hubs`, etc.):

```typescript
  // System (existing)
  'system:manage-roles': 'Create, edit, and delete roles',
  'system:view-roles': 'View role definitions',
  'system:manage-hubs': 'Create and manage hubs',
  'system:manage-instance': 'Manage instance-level settings',
  // System (new — platform nav gating)
  'system:view-platform': 'View platform settings',
  'system:view-bans': 'View platform-wide ban list',
  'system:view-audit': 'View platform-wide audit log',
  'system:view-analytics': 'View platform-wide analytics',
  'system:view-health': 'View platform health status',
```

- [ ] **Step 4: Add PERMISSION_GROUP_LABELS**

Below the `PERMISSION_CATALOG` export and `Permission` type, add:

```typescript
/** Human-readable labels for permission domains, used in the permission picker UI. */
export const PERMISSION_GROUP_LABELS: Record<string, string> = {
  audit: 'Audit',
  bans: 'Bans',
  blasts: 'Blasts',
  calls: 'Calls',
  cases: 'Cases',
  contacts: 'Contacts',
  conversations: 'Conversations',
  events: 'Events',
  evidence: 'Evidence',
  files: 'Files',
  firehose: 'Firehose',
  hubs: 'Hubs',
  invites: 'Invites',
  messaging: 'Messaging',
  metrics: 'Metrics',
  notes: 'Notes',
  reports: 'Reports',
  settings: 'Settings',
  shifts: 'Shifts',
  system: 'System',
  telephony: 'Telephony',
  users: 'Users',
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test packages/shared/__tests__/permissions.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/permissions.ts packages/shared/__tests__/permissions.test.ts
git commit -m "feat(permissions): add system:view-* permissions and PERMISSION_GROUP_LABELS"
```

---

### Task 2: Add crypto domain separation labels

**Files:**
- Modify: `packages/protocol/crypto-labels.json`
- Run: codegen

- [ ] **Step 1: Add three new labels to crypto-labels.json**

Add these entries to the `"labels"` object in `packages/protocol/crypto-labels.json`:

```json
    "LABEL_PLATFORM_ROLE_NAME_ENCRYPT": "llamenos:platform-role-name-encrypt",
    "LABEL_PLATFORM_ROLE_DESC_ENCRYPT": "llamenos:platform-role-desc-encrypt",
    "LABEL_HUB_ROLE_ENCRYPT": "llamenos:hub-role-encrypt",
```

- [ ] **Step 2: Run codegen to generate TS/Swift/Kotlin constants**

Run: `bun run codegen`
Expected: Generates updated constants in `packages/protocol/generated/` for all platforms.

- [ ] **Step 3: Verify the new labels appear in generated TypeScript**

Run: `grep -r 'PLATFORM_ROLE_NAME_ENCRYPT' packages/protocol/generated/`
Expected: Label constant appears in generated output.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/crypto-labels.json
git commit -m "feat(crypto): add domain separation labels for role encryption"
```

---

## Phase 2: Nav Config Migration

### Task 3: Remove requiredRole from nav config

**Prerequisite:** PR 283 merged. These files come from PR 283.

**Files:**
- Modify: `src/client/components/admin-shell/admin-nav-config.types.ts`
- Modify: `src/client/components/admin-shell/admin-nav-config.ts`
- Modify: `src/client/components/admin-shell/admin-nav-visibility.ts`
- Modify: `src/client/components/admin-shell/__tests__/admin-nav-visibility.test.ts`

- [ ] **Step 1: Update nav visibility tests to be permission-only**

In `admin-nav-visibility.test.ts`, replace any test cases that check `requiredRole` behavior. The key change: platform items should be visible based on permissions alone, not role membership.

Update tests so that:
- A user with `system:manage-hubs` permission (but NOT `role-super-admin`) CAN see the `hubs` nav item.
- A user with `system:view-platform` permission CAN see `platform-settings`.
- A user with NO `system:*` permissions CANNOT see platform items.
- Remove any tests that assert role-gated visibility.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/client/components/admin-shell/__tests__/admin-nav-visibility.test.ts`
Expected: FAIL — visibility logic still checks `requiredRole`.

- [ ] **Step 3: Remove requiredRole from AdminNavItem type**

In `admin-nav-config.types.ts`, delete the `requiredRole` field:

```typescript
export interface AdminNavItem {
  slug: string
  labelKey: string
  requiredPermissions: string[]
  // requiredRole REMOVED
  testid: string
}
```

- [ ] **Step 4: Update platform nav items in admin-nav-config.ts**

Replace `requiredRole: 'role-super-admin'` on each platform item with `requiredPermissions`:

```typescript
// Platform group items — all use permissions now
{ slug: 'hubs', labelKey: 'items.hubs', requiredPermissions: ['system:manage-hubs'], testid: 'nav-hubs' },
{ slug: 'platform-roles', labelKey: 'items.platformRoles', requiredPermissions: ['system:manage-roles'], testid: 'nav-platform-roles' },
{ slug: 'platform-bans', labelKey: 'items.platformBans', requiredPermissions: ['system:view-bans'], testid: 'nav-platform-bans' },
{ slug: 'platform-audit', labelKey: 'items.platformAudit', requiredPermissions: ['system:view-audit'], testid: 'nav-platform-audit' },
{ slug: 'platform-analytics', labelKey: 'items.platformAnalytics', requiredPermissions: ['system:view-analytics'], testid: 'nav-platform-analytics' },
{ slug: 'platform-health', labelKey: 'items.platformHealth', requiredPermissions: ['system:view-health'], testid: 'nav-platform-health' },
{ slug: 'platform-settings', labelKey: 'items.platformSettings', requiredPermissions: ['system:view-platform'], testid: 'nav-platform-settings' },
{ slug: 'gdpr-erasure', labelKey: 'items.gdprErasure', requiredPermissions: ['gdpr:admin'], testid: 'nav-gdpr-erasure' },
```

- [ ] **Step 5: Simplify canSeeItem() in admin-nav-visibility.ts**

Remove the `requiredRole` check branch. The function should only check `requiredPermissions`:

```typescript
export function canSeeItem(item: AdminNavItem, auth: NavAuthContext): boolean {
  if (item.requiredPermissions.length === 0) return true
  return item.requiredPermissions.every((perm) => auth.hasPermission(perm))
}
```

- [ ] **Step 6: Simplify canSeeGroup() in admin-nav-visibility.ts**

Remove any special-casing for platform scope. Groups are visible if ANY item within them is visible:

```typescript
export function canSeeGroup(group: AdminNavGroup, auth: NavAuthContext): boolean {
  return group.items.some((item) => canSeeItem(item, auth))
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun test src/client/components/admin-shell/__tests__/admin-nav-visibility.test.ts`
Expected: All tests PASS.

- [ ] **Step 8: Run typecheck**

Run: `bun run typecheck`
Expected: No type errors (any references to `requiredRole` in other files will surface here).

- [ ] **Step 9: Commit**

```bash
git add src/client/components/admin-shell/
git commit -m "feat(nav): remove requiredRole, migrate to pure permission-based nav gating"
```

---

## Phase 3: Backend — DB Schema & Envelope Storage

### Task 4: Add platformRoleEnvelopes table and migration

**Files:**
- Modify: `apps/worker/db/schema/settings.ts`
- Create: migration via `bunx drizzle-kit generate`

- [ ] **Step 1: Add envelope table to schema**

In `apps/worker/db/schema/settings.ts`, after the `roles` table definition, add:

```typescript
export const platformRoleEnvelopes = pgTable('platform_role_envelopes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  adminPubkey: text('admin_pubkey').notNull(),
  encryptedName: text('encrypted_name').notNull(),
  encryptedDescription: text('encrypted_description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  roleAdminUnique: unique().on(table.roleId, table.adminPubkey),
}))
```

- [ ] **Step 2: Add encryptedName/encryptedDescription columns to roles table if missing**

Check whether the `roles` table already has `encryptedName` and `encryptedDescription` columns. If not (v2 currently stores plaintext `name` and `description`), the hub role encryption will need these. For now, hub roles will continue to use `name`/`description` columns — hub key encryption of these fields will be stored in `encryptedName`/`encryptedDescription`:

```typescript
// Add to roles table definition
  encryptedName: text('encrypted_name'),
  encryptedDescription: text('encrypted_description'),
```

- [ ] **Step 3: Export the new table**

Ensure `platformRoleEnvelopes` is exported from the schema barrel file (check `apps/worker/db/schema/index.ts` or equivalent).

- [ ] **Step 4: Generate migration**

Run: `bunx drizzle-kit generate`
Expected: A new migration file is created in `apps/worker/db/migrations/`.

- [ ] **Step 5: Apply migration locally**

Run: `bunx drizzle-kit push` (or restart dev server which auto-migrates)
Expected: Tables updated in local PostgreSQL.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/db/
git commit -m "feat(db): add platformRoleEnvelopes table and encrypted role name columns"
```

---

### Task 5: Update Zod schemas for envelope fields

**Files:**
- Modify: `packages/protocol/schemas/settings.ts`

- [ ] **Step 1: Add envelope schema**

In `packages/protocol/schemas/settings.ts`, add:

```typescript
export const roleEnvelopeSchema = z.object({
  adminPubkey: z.string(),
  encryptedName: z.string(),
  encryptedDescription: z.string(),
})

export type RoleEnvelope = z.infer<typeof roleEnvelopeSchema>
```

- [ ] **Step 2: Update createRoleSchema to accept envelopes**

```typescript
export const createRoleSchema = z.looseObject({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  permissions: z.array(z.string()),
  description: z.string().min(1).max(500),
  // Hub role encryption (hub key — single ciphertext)
  encryptedName: z.string().optional(),
  encryptedDescription: z.string().optional(),
  // Platform role encryption (per-admin HPKE envelopes)
  envelopes: z.array(roleEnvelopeSchema).optional(),
})
```

- [ ] **Step 3: Update roleResponseSchema to include envelopes**

```typescript
export const roleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  permissions: z.array(z.string()),
  isDefault: z.boolean(),
  isSystem: z.boolean(),
  description: z.string(),
  encryptedName: z.string().nullable().optional(),
  encryptedDescription: z.string().nullable().optional(),
  envelopes: z.array(roleEnvelopeSchema).optional(),
  assignedUserCount: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
```

- [ ] **Step 4: Add envelope upload schema**

```typescript
export const addRoleEnvelopesSchema = z.object({
  envelopes: z.array(roleEnvelopeSchema).min(1),
})
```

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/schemas/settings.ts
git commit -m "feat(protocol): add role envelope schemas for encrypted role names"
```

---

### Task 6: Update backend role routes for envelopes and user counts

**Files:**
- Modify: `apps/worker/routes/settings.ts`
- Modify: `apps/worker/services/settings.ts`

- [ ] **Step 1: Write BDD test for envelope-based role creation**

Create a BDD scenario in the appropriate feature file (check `tests/bdd/features/` for existing role tests):

```gherkin
Scenario: Create a platform role with HPKE envelopes
  Given I am authenticated as a super-admin
  When I create a role with envelopes:
    | name         | slug        | permissions       |
    | Test Role    | test-role   | system:view-audit |
  And I include envelopes for admin pubkeys
  Then the response status is 201
  And the role has envelopes for each admin pubkey
  And the role name is not stored in plaintext

Scenario: List roles includes assigned user count
  Given I am authenticated as a super-admin
  And a role "test-role" exists with 3 assigned users
  When I list roles
  Then each role includes "assignedUserCount"
  And "test-role" has assignedUserCount 3
```

- [ ] **Step 2: Update POST /settings/roles to handle envelopes**

In `apps/worker/routes/settings.ts`, update the role creation handler:
- Accept `id`, `envelopes`, `encryptedName`, `encryptedDescription` from request body
- If `envelopes` array is provided: store envelopes in `platformRoleEnvelopes` table, store empty string for `name`/`description` in roles table
- If `encryptedName`/`encryptedDescription` provided (hub roles): store in roles table columns

- [ ] **Step 3: Update GET /settings/roles to return envelopes and user counts**

In the role list handler:
- Join with `platformRoleEnvelopes` to include envelopes per role (filter to requesting admin's pubkey for efficiency)
- Join with user-role assignments to compute `assignedUserCount` per role
- Return envelopes array on platform roles, encrypted fields on hub roles

- [ ] **Step 4: Add POST /settings/roles/:id/envelopes endpoint**

New endpoint for re-wrapping envelopes when a new super-admin is added:

```typescript
settings.post('/roles/:id/envelopes',
  requirePermission('system:manage-roles'),
  validator('json', addRoleEnvelopesSchema),
  async (c) => {
    const { id } = c.req.param()
    const { envelopes } = c.req.valid('json')
    // Upsert envelopes for the role (one per adminPubkey)
    for (const env of envelopes) {
      await db.insert(platformRoleEnvelopes)
        .values({ roleId: id, ...env })
        .onConflictDoUpdate({
          target: [platformRoleEnvelopes.roleId, platformRoleEnvelopes.adminPubkey],
          set: { encryptedName: env.encryptedName, encryptedDescription: env.encryptedDescription, updatedAt: new Date() },
        })
    }
    return c.json({ ok: true })
  }
)
```

- [ ] **Step 5: Add GET /users/:id/effective-permissions endpoint**

```typescript
settings.get('/users/:id/effective-permissions',
  requirePermission('users:read'),
  async (c) => {
    const { id } = c.req.param()
    const user = await services.users.getById(id)
    if (!user) return c.json({ error: 'Not found' }, 404)
    const allRoles = await services.settings.getRoles()
    const permissions = resolveHubPermissions(
      user.roles,
      user.hubRoles ?? [],
      allRoles,
      c.get('hubId') ?? '',
    )
    return c.json({ userId: id, permissions })
  }
)
```

- [ ] **Step 6: Run BDD tests**

Run: `bun run test:backend:bdd`
Expected: New scenarios pass.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/routes/settings.ts apps/worker/services/settings.ts
git commit -m "feat(api): envelope storage for platform roles, effective-permissions endpoint, user counts"
```

---

## Phase 4: Desktop — Shared UI Components

### Task 7: React Query hooks for roles

**Files:**
- Create: `src/client/lib/queries/roles.ts`

- [ ] **Step 1: Create role query hooks**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listRoles, createRole, updateRole, deleteRole, getPermissionsCatalog } from '@/lib/api'
import type { RoleDefinition } from '@protocol/schemas/settings'

export const roleKeys = {
  all: ['roles'] as const,
  list: (scope?: 'hub' | 'platform') => [...roleKeys.all, 'list', scope] as const,
  permissions: () => ['permissions-catalog'] as const,
}

export function useRoles(scope?: 'hub' | 'platform') {
  return useQuery({
    queryKey: roleKeys.list(scope),
    queryFn: async () => {
      const { roles } = await listRoles()
      // TODO(Task 10/11): client-side decryption of encrypted names
      return roles
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function usePermissionsCatalog() {
  return useQuery({
    queryKey: roleKeys.permissions(),
    queryFn: () => getPermissionsCatalog(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all })
    },
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateRole>[1] }) =>
      updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all })
    },
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all })
    },
  })
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/client/lib/queries/roles.ts
git commit -m "feat(client): React Query hooks for role management"
```

---

### Task 8: PermissionPicker component (scope-aware)

**Files:**
- Create: `src/client/components/admin-settings/permission-picker.tsx`

This is the core shared component. It renders permissions grouped by domain with:
- Radio buttons for scope permissions (none/own/assigned/all)
- Checkboxes for tier and action permissions
- Collapsible domain sections with indeterminate checkbox and count badge
- `PERMISSION_GROUP_LABELS` for domain headers

- [ ] **Step 1: Create the PermissionPicker component**

```typescript
import { useState, useMemo } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PERMISSION_GROUP_LABELS } from '@shared/permissions'

interface PermissionPickerProps {
  /** All available permissions grouped by domain from the catalog API */
  catalog: Record<string, { key: string; label: string }[]>
  /** Currently selected permissions */
  selected: string[]
  /** Called when selection changes */
  onChange: (permissions: string[]) => void
  /** Permissions to exclude from display (e.g., system:* for hub roles) */
  excludeDomains?: string[]
}

interface ParsedPermission {
  key: string
  label: string
  domain: string
  action: string
  type: 'scope' | 'tier' | 'action'
  scopeLevel?: 'own' | 'assigned' | 'all'
  scopePrefix?: string // e.g., 'contacts:read' for 'contacts:read-own'
}

const SCOPE_LEVELS = ['own', 'assigned', 'all'] as const
const SCOPE_SUFFIXES = ['-own', '-assigned', '-all']

function parsePermission(key: string, label: string): ParsedPermission {
  const [domain, action] = key.split(':')
  const parsed: ParsedPermission = { key, label, domain, action, type: 'action' }

  for (const level of SCOPE_LEVELS) {
    if (action.endsWith(`-${level}`)) {
      parsed.type = 'scope'
      parsed.scopeLevel = level
      parsed.scopePrefix = `${domain}:${action.replace(`-${level}`, '')}`
      break
    }
  }

  if (action.startsWith('envelope-')) {
    parsed.type = 'tier'
  }

  return parsed
}

export function PermissionPicker({ catalog, selected, onChange, excludeDomains = [] }: PermissionPickerProps) {
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())

  const domains = useMemo(() => {
    const result: Record<string, ParsedPermission[]> = {}
    for (const [domain, perms] of Object.entries(catalog)) {
      if (excludeDomains.includes(domain)) continue
      result[domain] = perms.map((p) => parsePermission(p.key, p.label))
    }
    return result
  }, [catalog, excludeDomains])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  function toggleDomain(domain: string) {
    setExpandedDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  function toggleDomainAll(domain: string, perms: ParsedPermission[]) {
    const domainKeys = perms.map((p) => p.key)
    const allSelected = domainKeys.every((k) => selectedSet.has(k))

    if (allSelected) {
      // Deselect all
      onChange(selected.filter((s) => !domainKeys.includes(s)))
    } else {
      // Select all — for scope perms, only select -all level
      const toAdd: string[] = []
      const scopePrefixesSeen = new Set<string>()

      for (const p of perms) {
        if (p.type === 'scope' && p.scopePrefix) {
          if (!scopePrefixesSeen.has(p.scopePrefix)) {
            scopePrefixesSeen.add(p.scopePrefix)
            toAdd.push(`${p.scopePrefix}-all`)
          }
        } else {
          toAdd.push(p.key)
        }
      }

      const withoutDomain = selected.filter((s) => !domainKeys.includes(s))
      onChange([...withoutDomain, ...toAdd])
    }
  }

  function setScopeLevel(scopePrefix: string, domain: string, level: string | null) {
    const domainPerms = domains[domain] ?? []
    const scopeKeys = domainPerms
      .filter((p) => p.scopePrefix === scopePrefix)
      .map((p) => p.key)
    const withoutScope = selected.filter((s) => !scopeKeys.includes(s))
    if (level) {
      onChange([...withoutScope, `${scopePrefix}-${level}`])
    } else {
      onChange(withoutScope)
    }
  }

  function togglePermission(key: string) {
    if (selectedSet.has(key)) {
      onChange(selected.filter((s) => s !== key))
    } else {
      onChange([...selected, key])
    }
  }

  function getDomainState(perms: ParsedPermission[]): 'all' | 'some' | 'none' {
    const count = perms.filter((p) => selectedSet.has(p.key)).length
    if (count === 0) return 'none'
    if (count === perms.length) return 'all'
    return 'some'
  }

  const sortedDomains = Object.keys(domains).sort()

  return (
    <div className="space-y-1">
      {sortedDomains.map((domain) => {
        const perms = domains[domain]
        const state = getDomainState(perms)
        const selectedCount = perms.filter((p) => selectedSet.has(p.key)).length
        const isExpanded = expandedDomains.has(domain)

        // Group scope perms by prefix
        const scopeGroups = new Map<string, ParsedPermission[]>()
        const tierPerms: ParsedPermission[] = []
        const actionPerms: ParsedPermission[] = []

        for (const p of perms) {
          if (p.type === 'scope' && p.scopePrefix) {
            const existing = scopeGroups.get(p.scopePrefix) ?? []
            existing.push(p)
            scopeGroups.set(p.scopePrefix, existing)
          } else if (p.type === 'tier') {
            tierPerms.push(p)
          } else {
            actionPerms.push(p)
          }
        }

        return (
          <div key={domain} className="border rounded-md">
            <div className="flex items-center gap-2 p-2 hover:bg-muted/50">
              <Checkbox
                checked={state === 'all' ? true : state === 'some' ? 'indeterminate' : false}
                onCheckedChange={() => toggleDomainAll(domain, perms)}
                aria-label={`Toggle all ${domain} permissions`}
              />
              <button
                type="button"
                className="flex items-center gap-1 flex-1 text-left text-sm font-medium"
                onClick={() => toggleDomain(domain)}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {PERMISSION_GROUP_LABELS[domain] ?? domain}
                <span className="text-muted-foreground text-xs ml-auto">
                  {selectedCount}/{perms.length}
                </span>
              </button>
            </div>

            {isExpanded && (
              <div className="px-4 pb-3 space-y-3">
                {/* Scope permissions — radio buttons */}
                {[...scopeGroups.entries()].map(([prefix, scopePerms]) => {
                  const actionName = prefix.split(':')[1]
                  const currentLevel = scopePerms.find((p) => selectedSet.has(p.key))?.scopeLevel ?? null

                  return (
                    <div key={prefix} className="space-y-1">
                      <Label className="text-xs text-muted-foreground capitalize">{actionName} scope</Label>
                      <RadioGroup
                        value={currentLevel ?? 'none'}
                        onValueChange={(val) => setScopeLevel(prefix, domain, val === 'none' ? null : val)}
                        className="flex gap-3"
                      >
                        <div className="flex items-center gap-1">
                          <RadioGroupItem value="none" id={`${prefix}-none`} />
                          <Label htmlFor={`${prefix}-none`} className="text-xs">None</Label>
                        </div>
                        {SCOPE_LEVELS.map((level) => {
                          const perm = scopePerms.find((p) => p.scopeLevel === level)
                          if (!perm) return null
                          return (
                            <div key={level} className="flex items-center gap-1">
                              <RadioGroupItem value={level} id={`${prefix}-${level}`} />
                              <Label htmlFor={`${prefix}-${level}`} className="text-xs capitalize">{level}</Label>
                            </div>
                          )
                        })}
                      </RadioGroup>
                    </div>
                  )
                })}

                {/* Tier permissions — checkboxes */}
                {tierPerms.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Data access tiers</Label>
                    {tierPerms.map((p) => (
                      <div key={p.key} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedSet.has(p.key)}
                          onCheckedChange={() => togglePermission(p.key)}
                          id={p.key}
                        />
                        <Label htmlFor={p.key} className="text-xs">{p.label}</Label>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action permissions — checkboxes */}
                {actionPerms.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Actions</Label>
                    {actionPerms.map((p) => (
                      <div key={p.key} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedSet.has(p.key)}
                          onCheckedChange={() => togglePermission(p.key)}
                          id={p.key}
                        />
                        <Label htmlFor={p.key} className="text-xs">{p.label}</Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/client/components/admin-settings/permission-picker.tsx
git commit -m "feat(ui): scope-aware PermissionPicker component with radio/checkbox/domain UX"
```

---

### Task 9: Shared RoleList and RoleEditor components

**Files:**
- Create: `src/client/components/admin-settings/role-list.tsx`
- Create: `src/client/components/admin-settings/role-editor.tsx`

- [ ] **Step 1: Create RoleList component**

```typescript
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Lock, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RoleDefinition } from '@protocol/schemas/settings'
import { useTranslation } from 'react-i18next'

interface RoleListProps {
  roles: RoleDefinition[]
  editingId: string | null
  onEdit: (role: RoleDefinition) => void
  onDelete: (role: RoleDefinition) => void
}

export function RoleList({ roles, editingId, onEdit, onDelete }: RoleListProps) {
  const { t } = useTranslation()

  const sorted = [...roles].sort((a, b) => {
    if (a.isSystem && !b.isSystem) return -1
    if (!a.isSystem && b.isSystem) return 1
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-2">
      {sorted.map((role) => (
        <div
          key={role.id}
          className={cn(
            'flex items-center justify-between p-3 rounded-md border',
            editingId === role.id && 'border-primary/30 bg-primary/5',
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="truncate">
              <span className="font-medium text-sm">{role.name}</span>
              {role.description && (
                <p className="text-xs text-muted-foreground truncate">{role.description}</p>
              )}
            </div>
            {role.isSystem && (
              <Badge variant="outline" className="gap-1 shrink-0">
                <Lock className="h-3 w-3" /> {t('roles.system')}
              </Badge>
            )}
            {role.isDefault && !role.isSystem && (
              <Badge variant="secondary" className="shrink-0">{t('roles.default')}</Badge>
            )}
            <Badge variant="outline" className="shrink-0 text-xs">
              {role.permissions.length === 1 && role.permissions[0] === '*'
                ? t('roles.allPermissions')
                : t('roles.permissionCount', { count: role.permissions.length })}
            </Badge>
            {role.assignedUserCount !== undefined && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {t('roles.assignedUsers', { count: role.assignedUserCount })}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!role.isSystem && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(role)}
                  disabled={editingId !== null}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(role)}
                  disabled={editingId !== null || role.isDefault}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create RoleEditor component**

```typescript
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PermissionPicker } from './permission-picker'
import { Save, X, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface RoleFormData {
  name: string
  slug: string
  description: string
  permissions: string[]
}

interface RoleEditorProps {
  /** null for create mode, role data for edit mode */
  initial: RoleFormData | null
  catalog: Record<string, { key: string; label: string }[]>
  /** Domains to exclude from the permission picker (e.g., ['system'] for hub roles) */
  excludeDomains?: string[]
  saving: boolean
  onSave: (data: RoleFormData) => void
  onCancel: () => void
  /** If true, show slug field (create mode). If false, hide it (edit mode). */
  showSlug?: boolean
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function RoleEditor({
  initial,
  catalog,
  excludeDomains,
  saving,
  onSave,
  onCancel,
  showSlug = true,
}: RoleEditorProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<RoleFormData>(
    initial ?? { name: '', slug: '', description: '', permissions: [] },
  )
  const [autoSlug, setAutoSlug] = useState(!initial)

  function handleNameChange(name: string) {
    setForm((prev) => ({
      ...prev,
      name,
      slug: autoSlug ? slugify(name) : prev.slug,
    }))
  }

  return (
    <div className="space-y-4 border rounded-md p-4 bg-muted/20">
      <div className="grid gap-3">
        <div>
          <Label htmlFor="role-name">{t('roles.name')}</Label>
          <Input
            id="role-name"
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            maxLength={100}
            placeholder={t('roles.namePlaceholder')}
          />
        </div>

        {showSlug && (
          <div>
            <Label htmlFor="role-slug">{t('roles.slug')}</Label>
            <Input
              id="role-slug"
              value={form.slug}
              onChange={(e) => {
                setAutoSlug(false)
                setForm((prev) => ({ ...prev, slug: e.target.value }))
              }}
              maxLength={100}
              pattern="[a-z0-9-]+"
              placeholder="auto-generated-from-name"
            />
          </div>
        )}

        <div>
          <Label htmlFor="role-desc">{t('roles.description')}</Label>
          <Textarea
            id="role-desc"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            maxLength={500}
            rows={2}
            placeholder={t('roles.descriptionPlaceholder')}
          />
        </div>
      </div>

      <div>
        <Label>{t('roles.permissions')}</Label>
        <div className="mt-2 max-h-[400px] overflow-y-auto">
          <PermissionPicker
            catalog={catalog}
            selected={form.permissions}
            onChange={(permissions) => setForm((prev) => ({ ...prev, permissions }))}
            excludeDomains={excludeDomains}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => onSave(form)} disabled={saving || !form.name.trim() || !form.slug.trim()}>
          {initial ? <Save className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          {initial ? t('common.save') : t('roles.create')}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-1" />
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}

export type { RoleFormData }
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/admin-settings/role-list.tsx src/client/components/admin-settings/role-editor.tsx
git commit -m "feat(ui): shared RoleList and RoleEditor components"
```

---

## Phase 5: Desktop — Section Implementations

### Task 10: HubRolesSection with scope-aware picker and template import

**Files:**
- Modify: `src/client/components/admin-sections/hub-roles-section.tsx`

- [ ] **Step 1: Rewrite HubRolesSection using shared components and React Query**

Replace the existing delegation to `RolesSection` with a proper implementation using the shared components. The component should:

1. Use `useRoles('hub')` and `usePermissionsCatalog()` hooks
2. Use `useCreateRole()`, `useUpdateRole()`, `useDeleteRole()` mutations
3. Render `RoleList` for display and `RoleEditor` for create/edit
4. Exclude `system` domain from the permission picker (hub roles don't get system permissions)
5. Encrypt role name/description with hub key before create/update (via `platform.ts` IPC)
6. Decrypt role names on render (via hub key from `useHubKey()` or similar)
7. Add "Import from template" button that opens a dialog showing available templates with their suggested roles

Key encryption flow for hub role create:
```typescript
import { encryptField, decryptField } from '@/lib/platform'

// On create:
const roleId = crypto.randomUUID()
const encryptedName = await encryptField(name, hubKey, roleId, 'name', 'LABEL_HUB_ROLE_ENCRYPT')
const encryptedDescription = await encryptField(description, hubKey, roleId, 'description', 'LABEL_HUB_ROLE_ENCRYPT')
createRole.mutate({ id: roleId, slug, permissions, name: '', description: '', encryptedName, encryptedDescription })
```

Key decryption flow for display:
```typescript
// In useRoles hook or component:
const decryptedRoles = await Promise.all(roles.map(async (role) => {
  if (role.encryptedName) {
    role.name = await decryptField(role.encryptedName, hubKey, role.id, 'name', 'LABEL_HUB_ROLE_ENCRYPT')
    role.description = await decryptField(role.encryptedDescription, hubKey, role.id, 'description', 'LABEL_HUB_ROLE_ENCRYPT')
  }
  return role
}))
```

- [ ] **Step 2: Add template import dialog**

Create an "Import from template" button that:
1. Fetches available templates (reuse template catalog from settings)
2. Shows a dialog with template names and their `suggestedRoles`
3. For each suggested role, shows name, description, and permission count
4. Checkboxes to select which roles to import
5. On confirm: creates each role individually via `useCreateRole()` with hub key encryption
6. Skips roles whose slug already exists (check client-side against current roles list)

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/admin-sections/hub-roles-section.tsx
git commit -m "feat(ui): enhanced HubRolesSection with scope-aware picker and template import"
```

---

### Task 11: PlatformRolesSection with per-admin HPKE envelopes

**Files:**
- Modify: `src/client/components/admin-sections/platform-roles-section.tsx`

- [ ] **Step 1: Implement PlatformRolesSection replacing the stub**

Replace the "Coming Soon" stub with a full implementation using shared components. Key differences from HubRolesSection:

1. Uses `useRoles('platform')` — only shows roles with no hubId
2. All permissions available in picker (no domain exclusions)
3. Encryption uses per-admin HPKE envelopes instead of hub key

Key encryption flow for platform role create:
```typescript
import { hpkeSeal } from '@/lib/platform'
import { useAdminPubkeys } from '@/lib/queries/admin' // fetch all super-admin X25519 pubkeys

// On create:
const roleId = crypto.randomUUID()
const adminPubkeys = await fetchAdminPubkeys() // GET endpoint returning super-admin pubkeys

const envelopes = await Promise.all(adminPubkeys.map(async (pubkey) => ({
  adminPubkey: pubkey,
  encryptedName: await hpkeSeal(name, pubkey, 'LABEL_PLATFORM_ROLE_NAME_ENCRYPT', `${roleId}:name`),
  encryptedDescription: await hpkeSeal(description, pubkey, 'LABEL_PLATFORM_ROLE_DESC_ENCRYPT', `${roleId}:description`),
})))

createRole.mutate({ id: roleId, slug, permissions, name: '', description: '', envelopes })
```

Key decryption flow:
```typescript
// Platform roles come back with envelopes array
// Find the envelope for the current admin's pubkey, decrypt with own device key
const myEnvelope = role.envelopes?.find((e) => e.adminPubkey === myPubkey)
if (myEnvelope) {
  role.name = await hpkeOpen(myEnvelope.encryptedName, 'LABEL_PLATFORM_ROLE_NAME_ENCRYPT', `${role.id}:name`)
  role.description = await hpkeOpen(myEnvelope.encryptedDescription, 'LABEL_PLATFORM_ROLE_DESC_ENCRYPT', `${role.id}:description`)
}
```

2. No template import button (platform roles are not template-driven)
3. Gated by `system:manage-roles` permission

- [ ] **Step 2: Register in section registry**

Update the section registry (from PR 283) to map `'platform-roles'` to `PlatformRolesSection` instead of the stub. Find the registry file (likely `src/client/components/admin-shell/section-registry.ts` or similar) and update the import.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/client/components/admin-sections/platform-roles-section.tsx src/client/components/admin-shell/
git commit -m "feat(ui): PlatformRolesSection with per-admin HPKE envelope encryption"
```

---

### Task 12: Clean up old RolesSection

**Files:**
- Modify: `src/client/components/admin-settings/roles-section.tsx`
- Modify: `src/client/routes/admin/settings.tsx` (if still referenced)

- [ ] **Step 1: Determine if RolesSection is still used**

Check if `roles-section.tsx` is imported anywhere besides the hub-roles-section:

```bash
grep -r 'roles-section' src/client/ --include='*.tsx' --include='*.ts'
```

- [ ] **Step 2: Remove or redirect**

If `RolesSection` is only used by `hub-roles-section.tsx` (which we rewrote in Task 10), delete it. If it's referenced from `admin/settings.tsx`, remove that reference too — roles are now accessed via the admin sidebar sections.

- [ ] **Step 3: Run typecheck and tests**

Run: `bun run typecheck && bun run test`
Expected: No errors, no test regressions.

- [ ] **Step 4: Commit**

```bash
git add src/client/
git commit -m "refactor: remove old RolesSection, roles now in admin sidebar sections"
```

---

## Phase 6: Mobile — Read-Only Role Viewers

### Task 13: iOS SwiftUI role list view

**Files:**
- Create: `apps/ios/Sources/Views/Admin/RoleListView.swift`

- [ ] **Step 1: Create RoleListView**

```swift
import SwiftUI

struct RoleListView: View {
    @State private var roles: [RoleDefinition] = []
    @State private var loading = true
    @State private var expandedRoleId: String?
    
    var body: some View {
        List {
            if loading {
                ProgressView()
            } else {
                ForEach(roles, id: \.id) { role in
                    RoleRow(
                        role: role,
                        isExpanded: expandedRoleId == role.id,
                        onTap: {
                            withAnimation {
                                expandedRoleId = expandedRoleId == role.id ? nil : role.id
                            }
                        }
                    )
                }
            }
        }
        .navigationTitle(String(localized: "adminNav.items.hubRoles"))
        .task { await loadRoles() }
    }
    
    private func loadRoles() async {
        do {
            let response = try await APIClient.shared.get("/settings/roles")
            let decoded = try JSONDecoder().decode(RoleListResponse.self, from: response)
            // Decrypt encrypted role names with hub key via CryptoService
            var decrypted: [RoleDefinition] = []
            for var role in decoded.roles {
                if let encrypted = role.encryptedName {
                    role.name = try await CryptoService.shared.decryptField(
                        ciphertext: encrypted,
                        label: CryptoLabels.LABEL_HUB_ROLE_ENCRYPT,
                        aad: "\(role.id):name"
                    )
                }
                if let encrypted = role.encryptedDescription {
                    role.description = try await CryptoService.shared.decryptField(
                        ciphertext: encrypted,
                        label: CryptoLabels.LABEL_HUB_ROLE_ENCRYPT,
                        aad: "\(role.id):description"
                    )
                }
                decrypted.append(role)
            }
            self.roles = decrypted
        } catch {
            // Handle error — show alert or log
        }
        loading = false
    }
}

struct RoleRow: View {
    let role: RoleDefinition
    let isExpanded: Bool
    let onTap: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onTap) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            Text(role.name)
                                .font(.headline)
                            if role.isSystem {
                                Label("System", systemImage: "lock.fill")
                                    .font(.caption2)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(.secondary.opacity(0.2))
                                    .clipShape(Capsule())
                            }
                            if role.isDefault && !role.isSystem {
                                Text("Default")
                                    .font(.caption2)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(.blue.opacity(0.1))
                                    .clipShape(Capsule())
                            }
                        }
                        Text(role.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(role.permissions.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
            
            if isExpanded {
                PermissionListView(permissions: role.permissions)
                    .padding(.leading, 8)
            }
        }
        .accessibilityIdentifier("role-\(role.slug)")
    }
}

struct PermissionListView: View {
    let permissions: [String]
    
    private var grouped: [(String, [String])] {
        Dictionary(grouping: permissions) { perm in
            perm.split(separator: ":").first.map(String.init) ?? "other"
        }
        .sorted { $0.key < $1.key }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(grouped, id: \.0) { domain, perms in
                VStack(alignment: .leading, spacing: 2) {
                    Text(domain.capitalized)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)
                    ForEach(perms, id: \.self) { perm in
                        Text(perm)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Wire into admin navigation**

Add `RoleListView` to the iOS admin sidebar navigation (check `apps/ios/Sources/Views/Admin/` for existing admin nav patterns from PR 283).

- [ ] **Step 3: Build and test**

Run: `bun run ios:build && bun run ios:test`
Expected: Builds and existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/ios/
git commit -m "feat(ios): read-only role list view with permission expansion"
```

---

### Task 14: Android Compose role list view

**Files:**
- Create: `apps/android/app/src/main/kotlin/org/llamenos/app/ui/admin/RoleListScreen.kt`

- [ ] **Step 1: Create RoleListScreen**

```kotlin
package org.llamenos.app.ui.admin

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Lock
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import org.llamenos.app.api.RoleDefinition

@Composable
fun RoleListScreen(
    roles: List<RoleDefinition>,
    loading: Boolean,
    modifier: Modifier = Modifier,
) {
    var expandedRoleId by remember { mutableStateOf<String?>(null) }

    if (loading) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(roles, key = { it.id }) { role ->
            RoleCard(
                role = role,
                isExpanded = expandedRoleId == role.id,
                onToggle = {
                    expandedRoleId = if (expandedRoleId == role.id) null else role.id
                },
            )
        }
    }
}

@Composable
private fun RoleCard(
    role: RoleDefinition,
    isExpanded: Boolean,
    onToggle: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("role-${role.slug}"),
    ) {
        Column(
            modifier = Modifier
                .clickable(onClick = onToggle)
                .padding(16.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(role.name, style = MaterialTheme.typography.titleSmall)
                        if (role.isSystem) {
                            Icon(Icons.Default.Lock, contentDescription = "System", modifier = Modifier.size(14.dp))
                            AssistChip(
                                onClick = {},
                                label = { Text("System", style = MaterialTheme.typography.labelSmall) },
                            )
                        }
                        if (role.isDefault && !role.isSystem) {
                            AssistChip(
                                onClick = {},
                                label = { Text("Default", style = MaterialTheme.typography.labelSmall) },
                            )
                        }
                    }
                    if (role.description.isNotBlank()) {
                        Text(
                            role.description,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text(
                    "${role.permissions.size} permissions",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Icon(
                    if (isExpanded) Icons.Default.ExpandMore else Icons.Default.ChevronRight,
                    contentDescription = if (isExpanded) "Collapse" else "Expand",
                )
            }

            AnimatedVisibility(visible = isExpanded) {
                Column(
                    modifier = Modifier.padding(top = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    val grouped = role.permissions.groupBy { it.substringBefore(":") }.toSortedMap()
                    grouped.forEach { (domain, perms) ->
                        Column {
                            Text(
                                domain.replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            perms.forEach { perm ->
                                Text(
                                    perm,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(start = 8.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Wire into Android admin sidebar**

Register `RoleListScreen` in the admin sidebar host (check `apps/android/app/src/main/kotlin/org/llamenos/app/ui/admin/` for the sidebar routing from PR 283).

- [ ] **Step 3: Build and test**

Run: `bun run test:android`
Expected: Builds and existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/android/
git commit -m "feat(android): read-only role list view with Material 3 permission expansion"
```

---

## Phase 7: i18n Strings

### Task 15: Add i18n strings for role management

**Files:**
- Modify: `packages/i18n/locales/en.json` (and other locales for keys only)

- [ ] **Step 1: Add role management strings to en.json**

Add under a `roles` namespace:

```json
{
  "roles": {
    "system": "System",
    "default": "Default",
    "allPermissions": "All permissions",
    "permissionCount": "{{count}} permissions",
    "permissionCount_one": "1 permission",
    "assignedUsers": "{{count}} users",
    "assignedUsers_one": "1 user",
    "name": "Role name",
    "namePlaceholder": "e.g. Intake Coordinator",
    "slug": "Slug",
    "description": "Description",
    "descriptionPlaceholder": "Brief description of this role's purpose",
    "permissions": "Permissions",
    "create": "Create role",
    "importFromTemplate": "Import from template",
    "importDialog": {
      "title": "Import roles from template",
      "description": "Select roles to import from the template. Existing roles with the same slug will be skipped.",
      "import": "Import selected",
      "noTemplates": "No templates available"
    },
    "deleteConfirm": {
      "title": "Delete role",
      "description": "Are you sure you want to delete \"{{name}}\"? Users assigned this role will lose its permissions."
    }
  }
}
```

- [ ] **Step 2: Run i18n codegen**

Run: `bun run i18n:codegen`
Expected: Generates iOS `.strings` and Android `strings.xml`.

- [ ] **Step 3: Validate i18n completeness**

Run: `bun run i18n:validate:all`
Expected: No validation errors for the new keys.

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/
git commit -m "feat(i18n): add role management strings across all locales"
```

---

## Phase 8: Integration Testing

### Task 16: Desktop E2E tests for role management

**Files:**
- Create: `tests/e2e/roles.spec.ts` (or add to existing admin E2E suite)

- [ ] **Step 1: Write Playwright E2E tests**

Test scenarios:
1. Navigate to hub-roles section via admin sidebar
2. Create a new role with name, slug, description, and specific permissions
3. Verify the role appears in the list with correct permission count
4. Edit the role — change permissions using the scope-aware picker
5. Delete a custom role
6. Verify system roles cannot be edited or deleted
7. Navigate to platform-roles section (requires super-admin)
8. Create a platform role (envelopes handled by IPC mock)

Ensure the Tauri IPC mock layer (`tests/mocks/`) supports the HPKE seal/open operations needed for role encryption.

- [ ] **Step 2: Run E2E tests**

Run: `bun run test`
Expected: All role E2E tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/
git commit -m "test: E2E tests for hub and platform role management"
```

---

### Task 17: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `bun run typecheck`
Expected: No errors.

- [ ] **Step 2: Run all desktop tests**

Run: `bun run test`
Expected: All tests pass.

- [ ] **Step 3: Run backend BDD tests**

Run: `bun run test:backend:bdd`
Expected: All tests pass including new role envelope scenarios.

- [ ] **Step 4: Run crypto tests**

Run: `bun run crypto:test`
Expected: All pass (no changes to crypto crate, but verify domain label codegen works).

- [ ] **Step 5: Run i18n validation**

Run: `bun run i18n:validate:all`
Expected: All pass.

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues from final verification pass"
```
