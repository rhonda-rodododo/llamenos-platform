# Spec: CMS Field Types — Location, File, and Report Type Field Editor

**Date:** 2026-03-21
**Status:** Draft
**Branch target:** desktop

---

## Goal

Implement two unfinished field types (`location` and `file`) across all platforms, and add a field configuration UI to the report type editor in the desktop admin settings. These are all gaps in the entity schema field rendering pipeline.

---

## Current State

### Gap 1: Location Field Type

**Protocol schema:**
`packages/protocol/schemas/entity-schema.ts` — `entityFieldDefinitionSchema.type` includes `'location'`. The schema also defines `locationOptions: { maxPrecision, allowGps, allowAutocomplete }`.

**Geocoding infrastructure:**
- `apps/worker/routes/geocoding.ts`: `POST /api/geocoding/autocomplete`, `/geocode`, `/reverse` — all implemented and rate-limited.
- `apps/worker/geocoding/` directory: `adapter.ts`, `factory.ts`, `opencage.ts`, `geoapify.ts`, `null.ts`.
- `packages/protocol/schemas/geocoding.ts`: `locationResultSchema = { address, displayName?, lat, lon, countryCode? }`, `locationPrecisionSchema = 'none'|'city'|'neighborhood'|'block'|'exact'`.
- Geocoding settings UI already exists in admin settings (provider, API key, country filter, enable/disable).

**Desktop (schema-form.tsx):**
`src/client/components/cases/schema-form.tsx` — `FieldInput` switch-case has no `'location'` case. Falls through to `default:` which renders a plain `<Input>`. Line 428: `default: return <Input .../>`. No geocoding autocomplete is invoked.

**iOS (TypedReportCreateView.swift):**
`apps/ios/Sources/Views/Reports/TypedReportCreateView.swift` — `fieldInput(for:)` switch does not have a `.location` case. The `ClientReportFieldType` enum presumably only covers the implemented types. The `LocationService.swift` exists in `apps/ios/Sources/Services/` and provides `CLLocationManager` integration.

**Android (TypedReportCreateScreen.kt):**
`apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/TypedReportCreateScreen.kt` — `DynamicField` Composable handles `JoinFieldType.Location` by falling through to `TextInputField` (lines 371–382) with a comment "not yet implemented on mobile." `LocationService.kt` exists in `org.llamenos.hotline.service` with `FusedLocationProviderClient` already implemented.

**Stored value format:** Not yet defined. Must be specified in this spec.

---

### Gap 2: File Field Type

**Protocol schema:**
`entityFieldDefinitionSchema.type` includes `'file'`. No separate file field value schema exists.

**iOS (TypedReportCreateView.swift):**
`case .file:` renders `fileFieldPlaceholder(for:)` — a static row showing "Coming soon" (lines 484–496). No upload logic.

**Desktop (schema-form.tsx):**
Falls through to `default:` — renders a plain `<Input>`. No file picker, no upload.

**Android (TypedReportCreateScreen.kt):**
`JoinFieldType.File` renders as `TextInputField` with label suffix `" (desktop only)"` (lines 359–369). No upload UI.

**File storage infrastructure:**
MinIO is in the Docker Compose stack. Evidence file upload already exists (Epics 329/330) with a `/api/files` or similar upload endpoint. The exact upload endpoint path needs to be confirmed against the existing evidence service routes.

---

### Gap 3: Report Type Field Customization UI

**Current state of `report-types-section.tsx`:**
`src/client/components/admin-settings/report-types-section.tsx` — The edit form at line 254 calls `<ReportTypeFieldsEditor fields={editing.fields || []} onChange={...} />` (defined inline, lines 300–end). The `ReportTypeFieldsEditor` renders a field list with Add/Edit inline forms, but it uses `CustomFieldDefinition` from `@shared/types` — the legacy type — rather than `ReportFieldDefinition` from `@protocol/schemas/report-types`.

The field editor only supports basic properties: `label`, `name`, `type` (text/textarea/number/select/checkbox/date — no location or file), `required`, `visibleToUsers`, `editableByUsers`. It does not expose:
- `options` configuration (for select/multiselect field types)
- `locationOptions` (maxPrecision, allowGps, allowAutocomplete)
- `supportAudioInput` (report-specific, for textarea fields)
- `section` grouping
- `helpText`
- `placeholder`
- `validation` (minLength, maxLength, min, max, pattern)
- `showWhen` conditional visibility rules
- `order` drag-to-reorder

The entity type field editor (for case/contact entity types) may be more complete — search for a `FieldEditor` component used in entity type settings. If it exists, the report type editor should reuse it.

---

## Required Changes

### Gap 1: Location Field Type

#### Protocol schema — define stored value format
**File:** `packages/protocol/schemas/geocoding.ts`

Add `locationFieldValueSchema`:

```typescript
export const locationFieldValueSchema = z.object({
  lat: z.number().optional(),
  lon: z.number().optional(),
  displayAddress: z.string(),
  precision: locationPrecisionSchema,
  source: z.enum(['manual', 'autocomplete', 'gps']),
})

export type LocationFieldValue = z.infer<typeof locationFieldValueSchema>
```

This is the JSON object stored in the field value for a `'location'`-type field. It is stored as a JSON string in the encrypted field envelope (alongside other field values). The schema is client-only — the server never inspects field values due to E2EE.

#### Desktop — `LocationFieldInput` component
**File:** `src/client/components/cases/location-field-input.tsx` (new)

A React component replacing the default `<Input>` fallback for `field.type === 'location'`:

```typescript
interface LocationFieldInputProps {
  field: EntityFieldDefinition
  value: string | undefined  // JSON-serialized LocationFieldValue or empty
  onChange: (value: string) => void
  readOnly?: boolean
  disabled?: boolean
}
```

Behavior:
1. Parse existing value from JSON if present; display `displayAddress` in the text input.
2. As the user types, debounce 300ms, call `POST /api/geocoding/autocomplete` with the query.
3. Show a dropdown of up to 5 `LocationResult` suggestions (address + coordinates).
4. On suggestion select: populate `displayAddress` from `LocationResult.address`, `lat`/`lon` from result, `precision` from `field.locationOptions.maxPrecision` (default `'exact'`), `source = 'autocomplete'`.
5. If `field.locationOptions.allowGps` is true, show a "Use my location" button. On click, call the Geolocation API (`navigator.geolocation.getCurrentPosition`), then call `POST /api/geocoding/reverse` to resolve address. Set `source = 'gps'`, `precision` capped by `maxPrecision`.
6. Precision truncation: if `maxPrecision` is `'city'`, clear `lat`/`lon` from the stored value (store only `displayAddress` and `precision='city'`). This enforces the field's privacy constraint.
7. Store value as `JSON.stringify(LocationFieldValue)` — the `onChange` callback receives a string.
8. In read-only mode, display the `displayAddress` in a non-editable input. Show a map pin icon.

**Integrate into `schema-form.tsx`:**
Add a `case 'location':` branch in `FieldInput` that renders `<LocationFieldInput>`.

The `SchemaFieldValues` type currently is `Record<string, string | number | boolean | string[]>`. Location values are JSON strings — they fit in the `string` slot.

#### iOS — `LocationField` SwiftUI component
**File:** `apps/ios/Sources/Views/Reports/LocationField.swift` (new)

A `View` struct for `field.fieldType == .location`:

```swift
struct LocationField: View {
    let field: ClientReportFieldDefinition
    @Binding var value: String  // JSON-encoded LocationFieldValue
    // ...
}
```

Behavior:
1. Parse `value` as JSON `LocationFieldValue` on init. Display `displayAddress` in a `TextField`.
2. As text changes, debounce 400ms, call `APIClient.shared.geocodingAutocomplete(query:)` using the existing `APIClient` pattern.
3. Show an overlay list of autocomplete suggestions (max 5). On tap: populate value, dismiss overlay.
4. If `field.locationOptions?.allowGps != false`, show a "Use current location" button. Use `LocationService.swift` (which already uses `CLLocationManager`). Call `geocodingReverse(lat:lon:)` to resolve address.
5. Precision capping: if `maxPrecision` is not `'exact'`, strip coordinates from the stored value.
6. Encode the final `LocationFieldValue` as JSON and call `onChange`.

**Add to `TypedReportCreateView.swift`:**
Add `ClientReportFieldType.location` (or equivalent string matching) to the `fieldType` enum and route to `LocationField` in `fieldInput(for:)`. Remove the fallthrough to the default case.

**Add `geocodingAutocomplete` and `geocodingReverse` to `APIClient`:**
**File:** `apps/ios/Sources/Services/APIClient.swift`

```swift
func geocodingAutocomplete(query: String, limit: Int = 5) async throws -> [LocationResult]
func geocodingReverse(lat: Double, lon: Double) async throws -> LocationResult?
```

#### Android — `LocationField` Composable
**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/LocationField.kt` (new)

```kotlin
@Composable
fun LocationField(
    field: ReportTypeDefinitionField,
    value: String,  // JSON-encoded LocationFieldValue
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
)
```

Behavior:
1. Parse `value` as `LocationFieldValue` JSON on recomposition. Show `displayAddress` in `OutlinedTextField`.
2. On text change, debounce 400ms via `LaunchedEffect` + `delay`, call the geocoding API via `ApiClient`.
3. Show a `DropdownMenu` or `ExposedDropdownMenuBox` with autocomplete suggestions.
4. If `allowGps` is not false, show a "Use location" `IconButton`. Use `LocationService.kt` (already implemented with `FusedLocationProviderClient`). Call reverse geocoding to resolve address.
5. Precision capping: same as iOS.
6. Serialize `LocationFieldValue` as JSON and call `onValueChange`.

**Add geocoding API calls to `ApiClient`:**
**File:** `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiClient.kt`

```kotlin
suspend fun geocodingAutocomplete(query: String, limit: Int = 5): List<LocationResult>
suspend fun geocodingReverse(lat: Double, lon: Double): LocationResult?
```

**Wire `LocationField` into `DynamicField`:**
Replace the `JoinFieldType.Location` fallthrough with `LocationField(field, value, onValueChange)`.

**Add `LocationResult` Kotlin data class:**
This will be generated by `bun run codegen` from `locationResultSchema` — confirm it is registered in `packages/protocol/tools/schema-registry.ts`. If not, register it.

---

### Gap 2: File Field Type

#### Protocol schema — define stored value format
**File:** `packages/protocol/schemas/entity-schema.ts` (add alongside `entityFieldDefinitionSchema`)

```typescript
export const fileFieldValueSchema = z.object({
  fileId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  uploadedAt: z.iso.datetime(),
})

export type FileFieldValue = z.infer<typeof fileFieldValueSchema>
```

Stored as a JSON string in the field value. Multiple files in a single field: store as `FileFieldValue[]` JSON array. The schema is client-only.

#### Upload endpoint
Confirm the existing file upload endpoint. Expected: `POST /api/files` (multipart) returns `{ fileId, filename, mimeType, sizeBytes }`. This should already exist from the evidence/blob storage epics. If not, this spec requires it to be added.

**File:** `apps/worker/routes/files.ts` (confirm or add)

The upload endpoint:
- Accepts `multipart/form-data` with a `file` field.
- Validates file size (max configurable, default 50 MB).
- Stores to MinIO under hub-scoped prefix `/{hubId}/field-attachments/{fileId}`.
- Returns `fileFieldValueSchema`-shaped response.

Requires `files:upload` permission (or `notes:write` — align with existing evidence upload permission).

#### Desktop — `FileUploadField` component
**File:** `src/client/components/cases/file-upload-field.tsx` (new)

```typescript
interface FileUploadFieldProps {
  field: EntityFieldDefinition
  value: string | undefined  // JSON-encoded FileFieldValue[] or empty
  onChange: (value: string) => void
  readOnly?: boolean
  disabled?: boolean
}
```

Behavior:
1. Parse `value` as `FileFieldValue[]` JSON. Display uploaded files as chips with filename + size.
2. A file picker area: `<input type="file">` wrapped in a drag-drop zone. Click or drag to select a file.
3. On file select: `POST /api/files` as multipart (using `FormData`). Show upload progress (indeterminate spinner). On success, append the returned `FileFieldValue` to the array, serialize as JSON, call `onChange`.
4. Each uploaded file has a remove button (X). Clicking remove removes it from the array and calls `onChange`. (The file remains in MinIO — deletion is handled by the record/evidence cleanup service, not by field editing.)
5. In read-only mode: show file names as download links (`GET /api/files/:fileId`).

**Integrate into `schema-form.tsx`:**
Add `case 'file':` branch in `FieldInput` that renders `<FileUploadField>`.

#### iOS — `FileUploadField` SwiftUI view
**File:** `apps/ios/Sources/Views/Reports/FileUploadField.swift` (new)

```swift
struct FileUploadField: View {
    let field: ClientReportFieldDefinition
    @Binding var value: String  // JSON-encoded [FileFieldValue] or ""
    // ...
}
```

Behavior:
1. Parse `value` as `[FileFieldValue]` JSON. Display uploaded files in a list with filename + size.
2. Show two buttons: "Choose Photo" (opens `PHPickerViewController`) and "Take Photo" (opens `UIImagePickerController` with `.camera` source).
3. On selection: encode image as JPEG (configurable quality, default 80%), `POST /api/files` as multipart. Show `ProgressView` overlay during upload.
4. On success: append `FileFieldValue` to array, encode as JSON, update binding.
5. Each file has a "Remove" action.

**Add to `TypedReportCreateView.swift`:**
Add `ClientReportFieldType.file` routing to `FileUploadField`. Remove `fileFieldPlaceholder(for:)`.

**Add file upload to `APIClient`:**
**File:** `apps/ios/Sources/Services/APIClient.swift`

```swift
func uploadFile(data: Data, filename: String, mimeType: String) async throws -> FileFieldValue
```

#### Android — `FileUploadField` Composable
**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/FileUploadField.kt` (new)

```kotlin
@Composable
fun FileUploadField(
    field: ReportTypeDefinitionField,
    value: String,  // JSON-encoded List<FileFieldValue> or ""
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
)
```

Behavior:
1. Parse `value` as `List<FileFieldValue>` JSON. Display file chips.
2. Two `OutlinedButton` rows: "Choose File" (opens `ActivityResultContracts.GetContent()`) and "Take Photo" (opens `ActivityResultContracts.TakePicture()`).
3. On file selection: upload via `ApiClient.uploadFile(uri, filename, mimeType)`. Show `CircularProgressIndicator` while uploading.
4. On success: append `FileFieldValue`, re-serialize, call `onValueChange`.
5. Per-file delete button.

**Add file upload to `ApiClient`:**
**File:** `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiClient.kt`

```kotlin
suspend fun uploadFile(uri: Uri, filename: String, mimeType: String): FileFieldValue
```

**Wire `FileUploadField` into `DynamicField`:**
Replace `JoinFieldType.File` fallthrough with `FileUploadField(field, value, onValueChange)`.

---

### Gap 3: Report Type Field Customization UI

**Context:** The `ReportTypeFieldsEditor` in `report-types-section.tsx` currently uses `CustomFieldDefinition` from `@shared/types` (the legacy CMS type), not `ReportFieldDefinition` from `@protocol/schemas/report-types`. It also lacks support for several field properties needed for a complete field definition.

**Goal:** Replace `ReportTypeFieldsEditor` with a full-featured field editor equivalent to what is used for entity type fields, adapted for `ReportFieldDefinition`.

#### Locate or create a reusable `FieldEditor` component
Search `src/client/components/admin-settings/` for an entity type field editor (used when configuring case/contact entity type fields). If one exists (`EntityTypeFieldEditor`, `FieldDefinitionEditor`, or similar), extract it into a shared component.

If no shared field editor exists, implement one:

**File:** `src/client/components/admin-settings/field-definition-editor.tsx` (new, or extract/rename existing)

The component receives `fields: ReportFieldDefinition[]` (or `EntityFieldDefinition[]` — same schema, `ReportFieldDefinition` just adds `supportAudioInput`) and `onChange: (fields) => void`.

Required property editors per field:
- **Basic:** `label` (text), `name` (slug-format, auto-derived from label on create), `type` (select: text/textarea/number/select/multiselect/checkbox/date/file/location), `required` (toggle), `order` (drag handle or numeric).
- **Type-specific:**
  - `select` / `multiselect`: `options` list editor (add/remove/reorder key+label pairs).
  - `textarea`: `supportAudioInput` toggle (report fields only).
  - `location`: `locationOptions.maxPrecision` (select: none/city/neighborhood/block/exact), `locationOptions.allowGps` (toggle), `locationOptions.allowAutocomplete` (toggle).
  - `text` / `textarea`: `validation.minLength`, `validation.maxLength`, `validation.pattern`.
  - `number`: `validation.min`, `validation.max`.
- **Display:** `section` (text, grouping label), `helpText` (text), `placeholder` (text).
- **Access:** `accessLevel` (select: all/admin/assigned/custom), `visibleToUsers` (toggle), `editableByUsers` (toggle).
- **Conditional visibility:** `showWhen.field` (select from other field names in the type), `showWhen.operator` (equals/not_equals/contains/is_set), `showWhen.value`.

The editor should be tabbed or use an accordion layout: **Basic | Options | Display | Access | Conditions**.

#### Wire into `report-types-section.tsx`
**File:** `src/client/components/admin-settings/report-types-section.tsx`

Replace the inline `ReportTypeFieldsEditor` with the shared `FieldDefinitionEditor`, passing `ReportFieldDefinition[]`:

```typescript
<FieldDefinitionEditor
  fields={(editing.fields ?? []) as ReportFieldDefinition[]}
  onChange={fields => setEditing(prev => ({ ...prev!, fields }))}
  showAudioInput={true}   // report-specific
/>
```

Update the `handleCreate`/`handleUpdate` handlers to use the `createCmsReportTypeBodySchema` field format (which already accepts the full `ReportFieldDefinition` shape via `reportFieldDefinitionSchema`). The current handlers pass `editing.fields` directly — ensure the type is `ReportFieldDefinition[]` not `CustomFieldDefinition[]`.

#### i18n keys to add
```json
"fieldEditor.addField": "Add Field",
"fieldEditor.editField": "Edit Field",
"fieldEditor.fieldLabel": "Field Label",
"fieldEditor.fieldName": "Field Name (slug)",
"fieldEditor.fieldType": "Type",
"fieldEditor.required": "Required",
"fieldEditor.options": "Options",
"fieldEditor.addOption": "Add Option",
"fieldEditor.section": "Section",
"fieldEditor.helpText": "Help Text",
"fieldEditor.placeholder": "Placeholder",
"fieldEditor.accessLevel": "Access Level",
"fieldEditor.visibleToUsers": "Visible to users",
"fieldEditor.editableByUsers": "Editable by users",
"fieldEditor.conditions": "Show When",
"fieldEditor.conditionField": "Field",
"fieldEditor.conditionOperator": "Operator",
"fieldEditor.conditionValue": "Value",
"fieldEditor.audioInput": "Enable audio input (mic button)",
"fieldEditor.locationMaxPrecision": "Maximum precision",
"fieldEditor.locationAllowGps": "Allow GPS location",
"fieldEditor.locationAllowAutocomplete": "Allow address autocomplete",
"fieldEditor.validationMinLength": "Min length",
"fieldEditor.validationMaxLength": "Max length",
"fieldEditor.validationMin": "Min value",
"fieldEditor.validationMax": "Max value",
"fieldEditor.validationPattern": "Pattern (regex)"
```

---

## File Map

### Gap 1: Location Field

| File | Change |
|------|--------|
| `packages/protocol/schemas/geocoding.ts` | Add `locationFieldValueSchema`, `LocationFieldValue` |
| `packages/protocol/tools/schema-registry.ts` | Register `locationFieldValueSchema` if mobile codegen needed |
| `src/client/components/cases/location-field-input.tsx` | New: geocoding autocomplete + GPS input |
| `src/client/components/cases/schema-form.tsx` | Add `case 'location':` in `FieldInput` switch |
| `apps/ios/Sources/Views/Reports/LocationField.swift` | New: text + autocomplete + GPS |
| `apps/ios/Sources/Views/Reports/TypedReportCreateView.swift` | Add `.location` case → `LocationField` |
| `apps/ios/Sources/Services/APIClient.swift` | Add `geocodingAutocomplete`, `geocodingReverse` |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/LocationField.kt` | New composable |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/TypedReportCreateScreen.kt` | Replace location fallthrough → `LocationField` |
| `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiClient.kt` | Add geocoding API methods |

### Gap 2: File Field

| File | Change |
|------|--------|
| `packages/protocol/schemas/entity-schema.ts` | Add `fileFieldValueSchema`, `FileFieldValue` |
| `apps/worker/routes/files.ts` | Confirm or add `POST /api/files` multipart upload endpoint |
| `src/client/components/cases/file-upload-field.tsx` | New: drag-drop / file picker + upload |
| `src/client/components/cases/schema-form.tsx` | Add `case 'file':` in `FieldInput` switch |
| `apps/ios/Sources/Views/Reports/FileUploadField.swift` | New: photo library / camera + upload |
| `apps/ios/Sources/Views/Reports/TypedReportCreateView.swift` | Add `.file` case → `FileUploadField`; remove `fileFieldPlaceholder` |
| `apps/ios/Sources/Services/APIClient.swift` | Add `uploadFile` |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/FileUploadField.kt` | New composable |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/TypedReportCreateScreen.kt` | Replace file fallthrough → `FileUploadField` |
| `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiClient.kt` | Add `uploadFile` |

### Gap 3: Report Type Field Editor

| File | Change |
|------|--------|
| `src/client/components/admin-settings/field-definition-editor.tsx` | New (or extracted/renamed) full-featured field editor |
| `src/client/components/admin-settings/report-types-section.tsx` | Replace inline `ReportTypeFieldsEditor` with `FieldDefinitionEditor`; migrate to `ReportFieldDefinition` type |
| `packages/i18n/locales/en.json` | Add `fieldEditor.*` i18n keys |

---

## Verification Gates

### Gap 1: Location Field

- [ ] `locationFieldValueSchema` is exported from `packages/protocol/schemas/geocoding.ts`.
- [ ] Desktop: `schema-form.tsx` renders `LocationFieldInput` for `field.type === 'location'` — no longer falls through to `default`.
- [ ] Desktop: typing in the location input triggers a debounced call to `POST /api/geocoding/autocomplete` and shows a dropdown.
- [ ] Desktop: selecting an autocomplete suggestion populates `lat`, `lon`, `displayAddress` in the stored JSON.
- [ ] Desktop: "Use my location" button uses `navigator.geolocation` and calls `/api/geocoding/reverse`.
- [ ] Desktop: if `field.locationOptions.maxPrecision === 'city'`, the stored value has no `lat`/`lon`.
- [ ] Desktop: read-only mode shows `displayAddress` in a non-editable input.
- [ ] iOS: `TypedReportCreateView` has a `.location` case that renders `LocationField`.
- [ ] iOS: `LocationField` calls `APIClient.geocodingAutocomplete` on debounced text input.
- [ ] iOS: GPS button invokes `LocationService` and calls `APIClient.geocodingReverse`.
- [ ] Android: `DynamicField` `JoinFieldType.Location` renders `LocationField` composable — not `TextInputField`.
- [ ] Android: `LocationField` calls `ApiClient.geocodingAutocomplete` on debounced text.
- [ ] Android: GPS button uses `LocationService` (FusedLocationProvider) and reverse geocoding.
- [ ] `bun run typecheck && bun run build` passes.
- [ ] `cd apps/android && ./gradlew testDebugUnitTest && ./gradlew lintDebug` passes.
- [ ] `cd apps/android && ./gradlew compileDebugAndroidTestKotlin` passes.

### Gap 2: File Field

- [ ] `fileFieldValueSchema` is exported from `packages/protocol/schemas/entity-schema.ts`.
- [ ] `POST /api/files` multipart upload endpoint exists and returns `fileFieldValueSchema`-shaped response.
- [ ] Desktop: `schema-form.tsx` renders `FileUploadField` for `field.type === 'file'` — no longer falls through.
- [ ] Desktop: clicking/dragging a file into `FileUploadField` triggers upload to `/api/files`.
- [ ] Desktop: uploaded file appears as a chip with filename and size.
- [ ] Desktop: read-only mode renders file chips as download links.
- [ ] iOS: `TypedReportCreateView` `.file` case renders `FileUploadField` — `fileFieldPlaceholder` is removed.
- [ ] iOS: tapping "Choose Photo" opens `PHPickerViewController`; tapping "Take Photo" opens camera.
- [ ] iOS: selected image is uploaded via `APIClient.uploadFile` and stored as `FileFieldValue`.
- [ ] Android: `DynamicField` `JoinFieldType.File` renders `FileUploadField` — not the `(desktop only)` fallback.
- [ ] Android: "Choose File" and "Take Photo" buttons launch respective intents.
- [ ] Android: file is uploaded via `ApiClient.uploadFile` and stored as `FileFieldValue`.
- [ ] `bun run typecheck && bun run build` passes.
- [ ] `cd apps/android && ./gradlew testDebugUnitTest && ./gradlew lintDebug` passes.
- [ ] `cd apps/android && ./gradlew compileDebugAndroidTestKotlin` passes.

### Gap 3: Report Type Field Editor

- [ ] Editing a report type in admin settings shows a full field editor — not just the basic inline form.
- [ ] All field property tabs are present: Basic, Options (for select/multiselect), Display, Access, Conditions.
- [ ] `select`/`multiselect` field type shows an options list editor with add/remove/reorder.
- [ ] `textarea` field type shows the `supportAudioInput` toggle.
- [ ] `location` field type shows `maxPrecision`, `allowGps`, `allowAutocomplete` options.
- [ ] `text`/`textarea` show `minLength`/`maxLength`/`pattern` validation fields.
- [ ] `number` shows `min`/`max` validation fields.
- [ ] `showWhen` conditional rules can be configured (field selector, operator, value).
- [ ] Saving a report type with configured fields persists them via `PATCH /api/cms/report-types/:id`.
- [ ] The `fields` sent in the PATCH body match `reportFieldDefinitionSchema` (not `CustomFieldDefinition`).
- [ ] `bun run typecheck && bun run build` passes.

---

## Cross-cutting Notes

### Codegen
After adding `locationFieldValueSchema` and `fileFieldValueSchema` to protocol schemas, run `bun run codegen` to regenerate Swift and Kotlin types. These new schemas need to be registered in `packages/protocol/tools/schema-registry.ts` if they are needed in generated mobile types.

For `LocationResult` (already in `geocodingResultSchema`): confirm it is in the schema registry — Android's `DynamicField` already references it. If not registered, add it.

### E2EE constraint
Location and file field values are stored in the encrypted field envelope alongside other field data. The server never sees raw `lat`/`lon` or file metadata in plaintext for E2EE-encrypted fields. For non-E2EE fields (if any), the constraint still applies at the report level — report content is encrypted. File IDs stored in field values are opaque to the server.

### Precision capping security
The `maxPrecision` constraint on a location field is enforced client-side. The server has no way to validate this (it cannot decrypt field values). Document this constraint clearly in the `LocationFieldInput` implementation — precision truncation must happen before encoding the value for upload.
