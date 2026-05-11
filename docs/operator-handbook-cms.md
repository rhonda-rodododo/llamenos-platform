# Operator Handbook: Case Management System

This section covers the case management (CMS) features in Llamenos. The CMS lets hubs track contacts, cases, and events with customizable fields, statuses, and workflows -- all end-to-end encrypted.

## Enabling Case Management

1. Navigate to **Hub Settings > Case Management**.
2. Toggle **Enable Case Management** to on.
3. The CMS toggle is at `PUT /api/settings/cms/case-management` with body `{ "enabled": true }`.

Once enabled, the **Cases** page appears in the sidebar navigation for all users with `cases:read-*` permissions.

## Applying Templates

Templates provide pre-configured entity types, fields, statuses, contact roles, report types, and suggested roles. They save hours of manual configuration.

1. Go to **Hub Settings > Case Management > Templates**.
2. Browse available templates (e.g., "Jail Support" for NLG hotlines).
3. Click **Apply** on the template card.
4. The system creates entity types, relationship types, and report types automatically.
5. After applying, you can customize everything -- templates are a starting point.

Templates can be re-applied safely. Existing entity types with matching names are updated; new ones are added. Templates also suggest roles with pre-configured permissions. Create them from the **Roles** section after applying.

## Understanding Entity Types

Entity types define what kinds of records your hub tracks. Each entity type has:

- **Name**: Machine-readable identifier (immutable after creation, e.g., `arrest_case`)
- **Label / Label Plural**: Human-readable names (e.g., "Arrest Case" / "Arrest Cases")
- **Category**: `case`, `event`, `contact`, `resource`, or `task`
- **Icon and Color**: Visual identifiers in the UI
- **Statuses**: Ordered list with colors (e.g., Reported, In Custody, Released, Closed)
- **Default Status**: The status assigned to new records
- **Closed Statuses**: Statuses that mark a record as resolved
- **Severities**: Optional priority levels (e.g., Urgent, Standard, Low)
- **Contact Roles**: How contacts relate to this record type (e.g., Arrestee, Attorney, Witness)
- **Fields**: Custom data fields with types, validation, sections, and access levels

### Creating Entity Types Manually

1. Go to **Hub Settings > Case Management > Entity Types**.
2. Click **Create Entity Type**.
3. Fill in the General tab (name, label, category, icon, color).
4. Configure Fields (see below), Statuses, Severities, and Contact Roles using the tabbed editor.
5. Click **Save**.

Maximum entity types per hub: 50.

## Fields

Fields define what data is collected for each case type. Each field has:

| Property | Description |
|----------|-------------|
| `name` | Machine-readable key (auto-generated from label) |
| `label` | Display name |
| `type` | `text`, `textarea`, `number`, `select`, `multiselect`, `checkbox`, `date`, `file` |
| `required` | Whether the field must be filled |
| `section` | Groups fields into collapsible sections (e.g., "Arrest Details", "Legal") |
| `accessLevel` | `all` (summary tier), `assigned` (fields tier), or `admin` (PII tier) |
| `helpText` | Hint text displayed below the field label |
| `placeholder` | Placeholder text for empty fields |
| `options` | For `select`/`multiselect`: list of `{ key, label }` pairs |
| `validation` | `min`, `max`, `minLength`, `maxLength`, `pattern` |
| `showWhen` | Conditional visibility: `{ field, operator, value }` |
| `indexable` | Whether the field can be used in blind-index searches |

### Access Levels (Encryption Tiers)

Data is organized in three encryption tiers:

1. **Summary tier** (`all`): Visible to all hub members with any `cases:read-*` permission. Used for status, timestamps, category.
2. **Fields tier** (`assigned`): Visible to assigned volunteers and admins. Used for case details, charges, bail info.
3. **PII tier** (`admin`): Visible to admins only. Used for attorney contact info, immigration status, identity details.

Each tier is encrypted with separate envelope keys. The server never sees plaintext at any tier.

## Creating and Managing Cases

### Creating a Case

1. Go to the **Cases** page.
2. Click **New Case** (requires `cases:create` permission).
3. Select the entity type.
4. Fill in required fields.
5. Click **Create**.

A case number is auto-generated if the entity type has numbering enabled (e.g., `JS-0001` for jail support).

### Viewing Cases

The Cases page has a split-pane layout:
- **Left sidebar**: List of cases with status indicators, filters, and pagination.
- **Right panel**: Case detail with tabs for Details, Timeline, Contacts, Evidence, and Related.

Filter by entity type using the tab bar at the top. Filter by status using the dropdown in the sidebar.

### Changing Status

Click the **status pill** on any case to change its status. Status changes are logged in the timeline automatically and published as WebSocket events for real-time sync.

### Assignment

- **Assign to me**: Click to take ownership of a case.
- **Assign dialog**: Choose specific volunteers from on-shift members.
- **Auto-assignment**: Admins can toggle auto-assignment globally. When enabled, new cases are automatically assigned to the best-available volunteer based on workload, language skills, and specializations.

## Contact Directory

The contact directory stores encrypted profiles of people your hub interacts with.

- Contacts are created automatically from incoming calls (via telephony-CRM integration).
- Contacts can also be created manually.
- Link contacts to cases with roles (e.g., "Arrestee", "Attorney", "Witness").
- All contact data is E2EE. Search works via blind indexes -- the server compares encrypted tokens without seeing plaintext.

## Timeline

Each case has a chronological timeline showing:
- Comments (encrypted, posted by volunteers)
- Status changes (logged automatically)
- File uploads
- Call links
- Notes
- Messages
- Referrals

Comments support Ctrl+Enter to post. The timeline polls for updates every 15 seconds.

## Evidence Management

The Evidence tab lets you upload and manage files associated with a case:

- Supported classifications: Photo, Video, Document, Audio, Other
- Files are encrypted before upload
- Each file gets an integrity hash (SHA-256) for chain of custody
- Every view, download, and share is logged in the custody chain
- Grid and list views available
- Filter by classification type

## Permissions Reference

| Permission | Description |
|------------|-------------|
| `cases:create` | Create new case records |
| `cases:read-own` | View cases assigned to or created by self |
| `cases:read-assigned` | View cases assigned to self or role-matched teammates |
| `cases:read-all` | View all cases (admin) |
| `cases:update-own` | Edit cases assigned to self |
| `cases:update` | Edit any case |
| `cases:assign` | Assign/unassign volunteers to cases |
| `cases:close` | Close cases |
| `cases:delete` | Delete cases |
| `cases:manage-types` | Create/edit/delete entity types and report types |
| `cases:link` | Link contacts and reports to cases |
| `cases:manage` | Manage CMS settings (auto-assignment, cross-hub) |
| `contacts:view` | View contact directory |
| `contacts:view-pii` | View PII-tier contact fields |
| `contacts:create` | Create contacts |
| `contacts:edit` | Edit contact profiles |
| `evidence:upload` | Upload evidence files |
| `evidence:download` | Download evidence files |
