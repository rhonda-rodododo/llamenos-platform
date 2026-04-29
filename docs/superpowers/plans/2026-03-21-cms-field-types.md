# CMS Field Types — Location, File, and Report Type Field Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `location` and `file` field types across desktop, iOS, and Android, and replace the legacy inline `ReportTypeFieldsEditor` in desktop admin settings with a full-featured `FieldDefinitionEditor` using `ReportFieldDefinition`.

**Architecture:** Field values for `location` and `file` types are JSON-encoded strings stored in the encrypted field envelope — the server never inspects them. New protocol schemas define the wire types; codegen propagates them to Swift/Kotlin. The desktop field editor is extracted into a standalone component that drives both report type and (in the future) entity type configuration.

**Tech Stack:** TypeScript/React/shadcn/ui (desktop), SwiftUI/@Observable (iOS), Kotlin/Compose/Hilt (Android), Zod (protocol schemas), Bun/Hono (worker), MinIO/BlobStorage (file storage), `bun run codegen` (Swift+Kotlin type generation)

---

## Codebase Orientation

Before starting, read these files to understand the existing patterns:

- **Protocol schemas:** `packages/protocol/schemas/geocoding.ts`, `packages/protocol/schemas/entity-schema.ts`, `packages/protocol/schemas/report-types.ts`
- **Desktop form renderer:** `src/client/components/cases/schema-form.tsx` — the `FieldInput` switch-case at line 275 (add `'location'` and `'file'` cases here)
- **Admin field editor:** `src/client/components/admin-settings/report-types-section.tsx` — the `ReportTypeFieldsEditor` function starting at line 301 (replace this)
- **Worker upload routes:** `apps/worker/routes/uploads.ts` (existing chunked upload for E2EE conversations), `apps/worker/routes/files.ts` (download/share for E2EE files). Neither is suitable for CMS field attachments — a new `POST /api/cms/field-upload` endpoint is needed.
- **Blob storage:** `apps/worker/lib/blob-storage.ts` — `createBlobStorage()` returns a `BlobStorage` interface with `put/get/delete`. Use this for the new endpoint.
- **iOS APIService:** `apps/ios/Sources/Services/APIService.swift` — `request<T>()` generic method pattern for new geocoding/upload methods
- **iOS LocationService:** `apps/ios/Sources/Services/LocationService.swift` — `captureAndResolve()` returns `LocationResult`
- **Android LocationService:** `apps/android/app/src/main/java/org/llamenos/hotline/service/LocationService.kt` — `captureAndResolve()` returns `LocationResult`; already calls `/api/geocoding/reverse`
- **Android ApiService:** `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt` — `request<T>(method, path, body)` generic method for new geocoding/upload methods
- **Android DynamicField:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/TypedReportCreateScreen.kt` — the `DynamicField` composable starting at line 293

---

## File Map

### Gap 1: Location Field Type

| File | Change |
|------|--------|
| `packages/protocol/schemas/geocoding.ts` | Add `locationFieldValueSchema` + `LocationFieldValue` type |
| `packages/protocol/tools/schema-registry.ts` | Remove `locationPrecisionSchema` from `EXCLUDED_SCHEMAS` if it blocks; add `locationFieldValueSchema` (already auto-discovered by naming) — it IS auto-discovered; verify it's not excluded |
| `src/client/components/cases/location-field-input.tsx` | **New** — geocoding autocomplete + GPS desktop component |
| `src/client/components/cases/schema-form.tsx` | Add `case 'location':` branch in `FieldInput` |
| `apps/ios/Sources/Views/Reports/LocationField.swift` | **New** — SwiftUI location field with autocomplete + GPS |
| `apps/ios/Sources/Views/Reports/TypedReportCreateView.swift` | Add `.location` case → `LocationField` |
| `apps/ios/Sources/Services/APIService.swift` | Add `geocodingAutocomplete(query:limit:)` and `geocodingReverse(lat:lon:)` methods |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/LocationField.kt` | **New** — Compose location field with autocomplete + GPS |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/TypedReportCreateScreen.kt` | Replace `JoinFieldType.Location` fallthrough with `LocationField(...)` |
| `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt` | Add `geocodingAutocomplete(query, limit)` and `geocodingAutocomplete(query)` |

### Gap 2: File Field Type

| File | Change |
|------|--------|
| `packages/protocol/schemas/entity-schema.ts` | Add `fileFieldValueSchema` + `FileFieldValue` type |
| `apps/worker/routes/records.ts` OR new `apps/worker/routes/cms-uploads.ts` | Add `POST /api/cms/field-upload` multipart endpoint |
| `src/client/components/cases/file-upload-field.tsx` | **New** — drag-drop file picker + upload desktop component |
| `src/client/components/cases/schema-form.tsx` | Add `case 'file':` branch in `FieldInput` |
| `apps/ios/Sources/Views/Reports/FileUploadField.swift` | **New** — photo library + camera SwiftUI component |
| `apps/ios/Sources/Views/Reports/TypedReportCreateView.swift` | Add `.file` case → `FileUploadField`; remove `fileFieldPlaceholder(for:)` |
| `apps/ios/Sources/Services/APIService.swift` | Add `uploadCmsFile(data:filename:mimeType:)` method |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/FileUploadField.kt` | **New** — Compose file picker + camera composable |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/TypedReportCreateScreen.kt` | Replace `JoinFieldType.File` fallthrough with `FileUploadField(...)` |
| `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt` | Add `uploadCmsFile(uri, filename, mimeType)` suspend fun |

### Gap 3: Report Type Field Editor

| File | Change |
|------|--------|
| `src/client/components/admin-settings/field-definition-editor.tsx` | **New** — full-featured shared field editor component |
| `src/client/components/admin-settings/report-types-section.tsx` | Replace inline `ReportTypeFieldsEditor` with `<FieldDefinitionEditor>`; migrate to `ReportFieldDefinition` type |
| `src/client/lib/api.ts` | Update `createReportType` / `updateReportType` types to use `ReportFieldDefinition[]` |
| `packages/i18n/locales/en.json` | Add `fieldEditor.*` i18n keys |

---

## Task 1: Protocol schemas — location and file stored value types

**Files:**
- Modify: `packages/protocol/schemas/geocoding.ts`
- Modify: `packages/protocol/schemas/entity-schema.ts`

- [ ] **Step 1.1: Add `locationFieldValueSchema` to geocoding.ts**

Append after line 15 of `packages/protocol/schemas/geocoding.ts`:

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

- [ ] **Step 1.2: Add `fileFieldValueSchema` to entity-schema.ts**

Append near the top of `packages/protocol/schemas/entity-schema.ts` (after imports, before `enumOptionSchema`):

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

- [ ] **Step 1.3: Run codegen and typecheck**

```bash
cd ~/projects/llamenos
bun run codegen
bun run typecheck
```

Expected: codegen generates `LocationFieldValue` and `FileFieldValue` types in `packages/protocol/generated/swift/` and `packages/protocol/generated/kotlin/`. Typecheck passes with 0 errors.

- [ ] **Step 1.4: Commit**

```bash
git add packages/protocol/schemas/geocoding.ts packages/protocol/schemas/entity-schema.ts
git commit -m "feat(protocol): add locationFieldValueSchema and fileFieldValueSchema for field encoding"
```

---

## Task 2: Worker — CMS field upload endpoint

The existing `/api/uploads/*` route is for E2EE conversation file transfers (chunked, with key envelopes). CMS field attachments need a simpler single-shot multipart endpoint.

**Files:**
- Create: `apps/worker/routes/cms-uploads.ts`
- Modify: `apps/worker/index.ts` (mount route)

- [ ] **Step 2.1: Write a BDD test for the upload endpoint**

Add a new scenario to the BDD test files (check existing BDD structure in `apps/worker/__tests__/`):

```gherkin
# In: apps/worker/__tests__/features/cms-field-upload.feature
Feature: CMS Field File Upload

  Scenario: Volunteer uploads a file for a field attachment
    Given I am authenticated as a volunteer
    When I POST /api/cms/field-upload with a valid multipart file
    Then the response status is 200
    And the response body contains fileId, filename, mimeType, sizeBytes, uploadedAt

  Scenario: Upload is rejected without authentication
    Given I am not authenticated
    When I POST /api/cms/field-upload with a valid multipart file
    Then the response status is 401
```

- [ ] **Step 2.2: Run the BDD test to verify it fails**

```bash
bun run test:backend:bdd --grep "CMS Field File Upload"
```

Expected: FAIL — route does not exist yet.

- [ ] **Step 2.3: Create `apps/worker/routes/cms-uploads.ts`**

```typescript
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { createBlobStorage } from '../lib/blob-storage'
import { z } from 'zod'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

const cmsUploads = new Hono<AppEnv>()

// POST /api/cms/field-upload
// Accepts multipart/form-data with a `file` field.
// Returns { fileId, filename, mimeType, sizeBytes, uploadedAt }.
// Requires notes:write permission (field values are part of encrypted record content).
cmsUploads.post('/field-upload',
  requirePermission('notes:write'),
  async (c) => {
    const hubId = c.get('hubId')
    const formData = await c.req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'Missing file field' }, 400)
    }
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024} MB` }, 400)
    }

    const fileId = crypto.randomUUID()
    const now = new Date().toISOString()
    const key = `${hubId}/field-attachments/${fileId}`

    const storage = createBlobStorage()
    const bytes = await file.arrayBuffer()
    await storage.put(key, new Uint8Array(bytes))

    return c.json({
      fileId,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      uploadedAt: now,
    })
  }
)

export default cmsUploads
```

- [ ] **Step 2.4: Mount the route in `apps/worker/index.ts`**

Find where other routes are mounted (look for `app.route('/api/files', files)`) and add:

```typescript
import cmsUploads from './routes/cms-uploads'
// ...
app.route('/api/cms', cmsUploads)
```

- [ ] **Step 2.5: Run BDD test to verify it passes**

```bash
bun run test:backend:bdd --grep "CMS Field File Upload"
```

Expected: PASS.

- [ ] **Step 2.6: Typecheck**

```bash
bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 2.7: Commit**

```bash
git add apps/worker/routes/cms-uploads.ts apps/worker/index.ts apps/worker/__tests__/features/cms-field-upload.feature
git commit -m "feat(worker): add POST /api/cms/field-upload multipart endpoint for field attachments"
```

---

## Task 3: Desktop — Location field input component

**Files:**
- Create: `src/client/components/cases/location-field-input.tsx`
- Modify: `src/client/components/cases/schema-form.tsx`

- [ ] **Step 3.1: Create `src/client/components/cases/location-field-input.tsx`**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MapPin, Navigation, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EntityFieldDefinition } from '@/lib/api'
import type { LocationFieldValue } from '@protocol/schemas/geocoding'
import type { LocationResult } from '@protocol/schemas/geocoding'

interface LocationFieldInputProps {
  field: EntityFieldDefinition
  fieldId: string
  value: string | undefined  // JSON-encoded LocationFieldValue or empty
  onChange: (value: string) => void
  readOnly?: boolean
  disabled?: boolean
}

const PRECISION_ORDER = ['none', 'city', 'neighborhood', 'block', 'exact'] as const
type Precision = typeof PRECISION_ORDER[number]

function truncateForPrecision(
  value: LocationFieldValue,
  maxPrecision: Precision,
): LocationFieldValue {
  const maxIdx = PRECISION_ORDER.indexOf(maxPrecision)
  const exactIdx = PRECISION_ORDER.indexOf('exact')
  // If maxPrecision is less restrictive than exact, strip coordinates
  if (maxIdx < exactIdx) {
    return { ...value, lat: undefined, lon: undefined, precision: maxPrecision }
  }
  return value
}

export function LocationFieldInput({
  field,
  fieldId,
  value,
  onChange,
  readOnly = false,
  disabled = false,
}: LocationFieldInputProps) {
  const [displayText, setDisplayText] = useState('')
  const [suggestions, setSuggestions] = useState<LocationResult[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxPrecision: Precision = field.locationOptions?.maxPrecision ?? 'exact'

  // Parse existing value on mount
  useEffect(() => {
    if (!value) {
      setDisplayText('')
      return
    }
    try {
      const parsed = JSON.parse(value) as LocationFieldValue
      setDisplayText(parsed.displayAddress)
    } catch {
      setDisplayText('')
    }
  }, [value])

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3) { setSuggestions([]); setShowDropdown(false); return }
    try {
      const res = await fetch('/api/geocoding/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 5 }),
      })
      if (!res.ok) return
      const data = await res.json() as { results: LocationResult[] }
      setSuggestions(data.results ?? [])
      setShowDropdown(true)
    } catch {
      // silently fail — user can still type manually
    }
  }, [])

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setDisplayText(text)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (field.locationOptions?.allowAutocomplete !== false) {
        fetchSuggestions(text)
      }
    }, 300)

    // Store manual entry as a location value with no coordinates
    const manualValue: LocationFieldValue = {
      displayAddress: text,
      precision: 'none',
      source: 'manual',
    }
    onChange(JSON.stringify(manualValue))
  }

  const handleSelectSuggestion = (result: LocationResult) => {
    setDisplayText(result.address)
    setShowDropdown(false)
    setSuggestions([])

    const fieldValue: LocationFieldValue = {
      lat: result.lat,
      lon: result.lon,
      displayAddress: result.address,
      precision: maxPrecision,
      source: 'autocomplete',
    }
    onChange(JSON.stringify(truncateForPrecision(fieldValue, maxPrecision)))
  }

  const handleGps = async () => {
    if (!('geolocation' in navigator)) return
    setGpsLoading(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      )
      const { latitude: lat, longitude: lon } = position.coords

      // Reverse geocode
      const res = await fetch('/api/geocoding/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
      })
      const result = res.ok ? await res.json() as LocationResult : null

      const fieldValue: LocationFieldValue = {
        lat,
        lon,
        displayAddress: result?.address ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        precision: maxPrecision,
        source: 'gps',
      }
      const truncated = truncateForPrecision(fieldValue, maxPrecision)
      setDisplayText(truncated.displayAddress)
      onChange(JSON.stringify(truncated))
    } catch {
      // permission denied or timeout — do nothing
    } finally {
      setGpsLoading(false)
    }
  }

  if (readOnly) {
    return (
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          id={fieldId}
          data-testid={`input-${field.name}`}
          value={displayText}
          readOnly
          className="bg-muted/50"
        />
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id={fieldId}
            data-testid={`input-${field.name}`}
            value={displayText}
            onChange={handleTextChange}
            disabled={disabled}
            placeholder={field.placeholder ?? 'Enter address or location…'}
            className="pl-8"
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          />
        </div>
        {field.locationOptions?.allowGps !== false && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            data-testid={`gps-btn-${field.name}`}
            disabled={disabled || gpsLoading}
            onClick={handleGps}
            title="Use current location"
          >
            {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              data-testid={`location-suggestion-${i}`}
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
              onMouseDown={() => handleSelectSuggestion(s)}
            >
              {s.address}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3.2: Wire `LocationFieldInput` into `schema-form.tsx`**

In `src/client/components/cases/schema-form.tsx`, add the import at the top:

```typescript
import { LocationFieldInput } from './location-field-input'
```

In the `FieldInput` function, add a `case 'location':` before the `default:` case (around line 427):

```typescript
    case 'location':
      return (
        <LocationFieldInput
          field={field}
          fieldId={fieldId}
          value={value as string | undefined}
          onChange={(v) => onChange(v)}
          readOnly={readOnly}
          disabled={disabled}
        />
      )
```

- [ ] **Step 3.3: Run typecheck and build**

```bash
cd ~/projects/llamenos
bun run typecheck && bun run build
```

Expected: 0 type errors, build succeeds.

- [ ] **Step 3.4: Commit**

```bash
git add src/client/components/cases/location-field-input.tsx src/client/components/cases/schema-form.tsx
git commit -m "feat(desktop): implement LocationFieldInput with geocoding autocomplete and GPS"
```

---

## Task 4: Desktop — File upload field component

**Files:**
- Create: `src/client/components/cases/file-upload-field.tsx`
- Modify: `src/client/components/cases/schema-form.tsx`

- [ ] **Step 4.1: Create `src/client/components/cases/file-upload-field.tsx`**

```typescript
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Paperclip, X, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EntityFieldDefinition } from '@/lib/api'
import type { FileFieldValue } from '@protocol/schemas/entity-schema'

interface FileUploadFieldProps {
  field: EntityFieldDefinition
  fieldId: string
  value: string | undefined  // JSON-encoded FileFieldValue[] or empty
  onChange: (value: string) => void
  readOnly?: boolean
  disabled?: boolean
}

function parseFiles(value: string | undefined): FileFieldValue[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as FileFieldValue[] : []
  } catch {
    return []
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileUploadField({
  field,
  fieldId,
  value,
  onChange,
  readOnly = false,
  disabled = false,
}: FileUploadFieldProps) {
  const files = parseFiles(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/cms/field-upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      const newEntry = await res.json() as FileFieldValue
      const updated = [...files, newEntry]
      onChange(JSON.stringify(updated))
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await uploadFile(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) await uploadFile(file)
  }

  const removeFile = (fileId: string) => {
    const updated = files.filter(f => f.fileId !== fileId)
    onChange(updated.length === 0 ? '' : JSON.stringify(updated))
  }

  if (readOnly) {
    return (
      <div className="space-y-1.5">
        {files.length === 0 && <span className="text-sm text-muted-foreground">No files</span>}
        {files.map(f => (
          <a
            key={f.fileId}
            href={`/api/cms/field-download/${f.fileId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            <Download className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate">{f.filename}</span>
            <Badge variant="outline" className="text-[10px]">{formatBytes(f.sizeBytes)}</Badge>
          </a>
        ))}
      </div>
    )
  }

  return (
    <div
      id={fieldId}
      data-testid={`input-${field.name}`}
      className="space-y-2"
    >
      {/* Uploaded file chips */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map(f => (
            <div
              key={f.fileId}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
            >
              <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{f.filename}</span>
              <Badge variant="outline" className="text-[10px]">{formatBytes(f.sizeBytes)}</Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                data-testid={`remove-file-${f.fileId}`}
                disabled={disabled}
                onClick={() => removeFile(f.fileId)}
              >
                <X className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border p-4 transition-colors',
          dragOver && 'border-primary bg-primary/5',
          (disabled || uploading) && 'opacity-50 pointer-events-none',
        )}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <Paperclip className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground text-center">
              Drag & drop a file here, or{' '}
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => inputRef.current?.click()}
              >
                choose file
              </button>
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        disabled={disabled || uploading}
      />
    </div>
  )
}
```

- [ ] **Step 4.2: Wire `FileUploadField` into `schema-form.tsx`**

Add the import:

```typescript
import { FileUploadField } from './file-upload-field'
```

Add a `case 'file':` branch before the `case 'location':` case:

```typescript
    case 'file':
      return (
        <FileUploadField
          field={field}
          fieldId={fieldId}
          value={value as string | undefined}
          onChange={(v) => onChange(v)}
          readOnly={readOnly}
          disabled={disabled}
        />
      )
```

- [ ] **Step 4.3: Run typecheck and build**

```bash
bun run typecheck && bun run build
```

Expected: 0 type errors, build succeeds.

- [ ] **Step 4.4: Commit**

```bash
git add src/client/components/cases/file-upload-field.tsx src/client/components/cases/schema-form.tsx
git commit -m "feat(desktop): implement FileUploadField with drag-drop upload via /api/cms/field-upload"
```

---

## Task 5: Desktop — Report type field definition editor

**Files:**
- Create: `src/client/components/admin-settings/field-definition-editor.tsx`
- Modify: `src/client/components/admin-settings/report-types-section.tsx`
- Modify: `src/client/lib/api.ts`
- Modify: `packages/i18n/locales/en.json`

- [ ] **Step 5.1: Add `fieldEditor.*` i18n keys to `packages/i18n/locales/en.json`**

Find the `"customFields"` object (line ~1122) and add a sibling `"fieldEditor"` object nearby:

```json
"fieldEditor": {
  "addField": "Add Field",
  "editField": "Edit Field",
  "fieldLabel": "Field Label",
  "fieldName": "Field Name (slug)",
  "fieldType": "Type",
  "required": "Required",
  "options": "Options",
  "addOption": "Add Option",
  "audioInput": "Enable audio input (mic button)",
  "locationMaxPrecision": "Maximum precision",
  "locationAllowGps": "Allow GPS location",
  "locationAllowAutocomplete": "Allow address autocomplete",
  "validationMaxLength": "Max length",
  "validationMinLength": "Min length",
  "validationMin": "Min value",
  "validationMax": "Max value"
}
```

- [ ] **Step 5.2: Create `src/client/components/admin-settings/field-definition-editor.tsx`**

This replaces the inline `ReportTypeFieldsEditor`. It uses `ReportFieldDefinition` from the protocol schema. The component is V1-scoped: name, label, type, required, type-specific options, order.

```typescript
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronUp, ChevronDown, Trash2, Save, Plus, FileText } from 'lucide-react'
import type { ReportFieldDefinition } from '@protocol/schemas/report-types'

const FIELD_TYPES: Array<{ value: ReportFieldDefinition['type']; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select (single)' },
  { value: 'multiselect', label: 'Select (multi)' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'file', label: 'File' },
  { value: 'location', label: 'Location' },
]

interface FieldDefinitionEditorProps {
  fields: ReportFieldDefinition[]
  onChange: (fields: ReportFieldDefinition[]) => void
  /** Show supportAudioInput toggle — true for report type fields */
  showAudioInput?: boolean
  maxFields?: number
}

type FieldDraft = Partial<ReportFieldDefinition>

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50)
}

export function FieldDefinitionEditor({
  fields,
  onChange,
  showAudioInput = false,
  maxFields = 100,
}: FieldDefinitionEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<FieldDraft | null>(null)

  function startAdd() {
    setDraft({ type: 'text', required: false, order: fields.length })
  }

  function startEdit(f: ReportFieldDefinition) {
    setDraft({ ...f })
  }

  function handleSaveDraft() {
    if (!draft?.label?.trim() || !draft?.name?.trim() || !draft?.type) return
    let next: ReportFieldDefinition[]
    if (draft.id) {
      next = fields.map(f =>
        f.id === draft.id ? ({ ...f, ...draft } as ReportFieldDefinition) : f
      )
    } else {
      const newField: ReportFieldDefinition = {
        id: crypto.randomUUID(),
        name: draft.name!,
        label: draft.label!,
        type: draft.type as ReportFieldDefinition['type'],
        required: draft.required ?? false,
        options: draft.options,
        locationOptions: draft.locationOptions,
        validation: draft.validation,
        supportAudioInput: draft.supportAudioInput ?? false,
        order: fields.length,
        accessLevel: 'all',
        visibleToUsers: true,
        editableByUsers: true,
        indexable: false,
        indexType: 'none',
        hubEditable: true,
      }
      next = [...fields, newField]
    }
    next.forEach((f, i) => (f.order = i))
    onChange(next)
    setDraft(null)
  }

  function handleDelete(id: string) {
    const next = fields.filter(f => f.id !== id)
    next.forEach((f, i) => (f.order = i))
    onChange(next)
  }

  function handleReorder(index: number, dir: -1 | 1) {
    const next = [...fields]
    const swap = index + dir
    ;[next[index], next[swap]] = [next[swap], next[index]]
    next.forEach((f, i) => (f.order = i))
    onChange(next)
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('reportTypes.fields')}
      </h5>

      {fields.length > 0 && (
        <div className="space-y-1.5">
          {fields.map((f, i) => (
            <div
              key={f.id}
              data-testid={`field-row-${f.name}`}
              className="flex items-center gap-2 rounded border border-border/50 px-3 py-2 text-sm"
            >
              <div className="flex flex-col gap-0.5">
                <Button variant="ghost" size="icon-xs" disabled={i === 0} onClick={() => handleReorder(i, -1)}>
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon-xs" disabled={i === fields.length - 1} onClick={() => handleReorder(i, 1)}>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex-1 space-y-0.5">
                <p className="font-medium text-xs">{f.label}</p>
                <div className="flex gap-1">
                  <Badge variant="outline" className="text-[9px]">{f.type}</Badge>
                  {f.required && <Badge variant="secondary" className="text-[9px]">{t('fieldEditor.required')}</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => startEdit(f)}>
                <FileText className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => handleDelete(f.id)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <div className="space-y-3 rounded border border-primary/20 bg-background p-3">
          <div className="grid grid-cols-2 gap-2">
            {/* Label */}
            <div className="space-y-1">
              <Label className="text-xs">{t('fieldEditor.fieldLabel')}</Label>
              <Input
                size={1}
                value={draft.label ?? ''}
                onChange={e => {
                  const label = e.target.value
                  setDraft(prev => ({
                    ...prev!,
                    label,
                    ...(!prev!.id ? { name: slugify(label) } : {}),
                  }))
                }}
                placeholder="e.g. Incident Location"
                className="text-xs"
              />
            </div>
            {/* Name (slug) */}
            <div className="space-y-1">
              <Label className="text-xs">{t('fieldEditor.fieldName')}</Label>
              <Input
                size={1}
                value={draft.name ?? ''}
                onChange={e => setDraft(prev => ({ ...prev!, name: e.target.value.replace(/[^a-z0-9_]/g, '_') }))}
                placeholder="incident_location"
                className="text-xs font-mono"
              />
            </div>
          </div>

          {/* Type */}
          <div className="space-y-1">
            <Label className="text-xs">{t('fieldEditor.fieldType')}</Label>
            <Select
              value={draft.type ?? 'text'}
              onValueChange={v => setDraft(prev => ({ ...prev!, type: v as ReportFieldDefinition['type'] }))}
            >
              <SelectTrigger className="text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map(ft => (
                  <SelectItem key={ft.value} value={ft.value} className="text-xs">
                    {ft.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Required toggle */}
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.required ?? false}
              onCheckedChange={c => setDraft(prev => ({ ...prev!, required: c }))}
            />
            <Label className="text-xs">{t('fieldEditor.required')}</Label>
          </div>

          {/* Options list (select / multiselect) */}
          {(draft.type === 'select' || draft.type === 'multiselect') && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t('fieldEditor.options')}</Label>
              {(draft.options ?? []).map((opt, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    size={1}
                    placeholder="key"
                    value={opt.key}
                    onChange={e => {
                      const opts = [...(draft.options ?? [])]
                      opts[i] = { ...opts[i], key: e.target.value }
                      setDraft(prev => ({ ...prev!, options: opts }))
                    }}
                    className="text-xs font-mono w-24"
                  />
                  <Input
                    size={1}
                    placeholder="label"
                    value={opt.label}
                    onChange={e => {
                      const opts = [...(draft.options ?? [])]
                      opts[i] = { ...opts[i], label: e.target.value }
                      setDraft(prev => ({ ...prev!, options: opts }))
                    }}
                    className="text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setDraft(prev => ({ ...prev!, options: prev!.options!.filter((_, j) => j !== i) }))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDraft(prev => ({ ...prev!, options: [...(prev!.options ?? []), { key: '', label: '' }] }))}
              >
                <Plus className="h-3 w-3" />
                {t('fieldEditor.addOption')}
              </Button>
            </div>
          )}

          {/* Audio input toggle (textarea, report fields only) */}
          {showAudioInput && draft.type === 'textarea' && (
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.supportAudioInput ?? false}
                onCheckedChange={c => setDraft(prev => ({ ...prev!, supportAudioInput: c }))}
              />
              <Label className="text-xs">{t('fieldEditor.audioInput')}</Label>
            </div>
          )}

          {/* Location options */}
          {draft.type === 'location' && (
            <div className="space-y-2 rounded border border-border/50 p-2">
              <Label className="text-xs font-medium">Location Options</Label>
              <div className="space-y-1">
                <Label className="text-xs">{t('fieldEditor.locationMaxPrecision')}</Label>
                <Select
                  value={draft.locationOptions?.maxPrecision ?? 'exact'}
                  onValueChange={v =>
                    setDraft(prev => ({ ...prev!, locationOptions: { ...prev!.locationOptions, maxPrecision: v as 'none' | 'city' | 'neighborhood' | 'block' | 'exact' } }))
                  }
                >
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['none', 'city', 'neighborhood', 'block', 'exact'] as const).map(p => (
                      <SelectItem key={p} value={p} className="text-xs capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.locationOptions?.allowGps ?? true}
                  onCheckedChange={c =>
                    setDraft(prev => ({ ...prev!, locationOptions: { ...prev!.locationOptions, allowGps: c } }))
                  }
                />
                <Label className="text-xs">{t('fieldEditor.locationAllowGps')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.locationOptions?.allowAutocomplete ?? true}
                  onCheckedChange={c =>
                    setDraft(prev => ({ ...prev!, locationOptions: { ...prev!.locationOptions, allowAutocomplete: c } }))
                  }
                />
                <Label className="text-xs">{t('fieldEditor.locationAllowAutocomplete')}</Label>
              </div>
            </div>
          )}

          {/* Validation: text/textarea */}
          {(draft.type === 'text' || draft.type === 'textarea') && (
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t('fieldEditor.validationMaxLength')}</Label>
                <Input
                  type="number"
                  size={1}
                  value={draft.validation?.maxLength ?? ''}
                  onChange={e => setDraft(prev => ({
                    ...prev!,
                    validation: { ...prev!.validation, maxLength: e.target.value ? Number(e.target.value) : undefined },
                  }))}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          {/* Validation: number */}
          {draft.type === 'number' && (
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t('fieldEditor.validationMin')}</Label>
                <Input
                  type="number"
                  size={1}
                  value={draft.validation?.min ?? ''}
                  onChange={e => setDraft(prev => ({
                    ...prev!,
                    validation: { ...prev!.validation, min: e.target.value ? Number(e.target.value) : undefined },
                  }))}
                  className="text-xs"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t('fieldEditor.validationMax')}</Label>
                <Input
                  type="number"
                  size={1}
                  value={draft.validation?.max ?? ''}
                  onChange={e => setDraft(prev => ({
                    ...prev!,
                    validation: { ...prev!.validation, max: e.target.value ? Number(e.target.value) : undefined },
                  }))}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!draft.label?.trim() || !draft.name?.trim()}
              onClick={handleSaveDraft}
            >
              <Save className="h-3 w-3" />
              {t('common.save')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        fields.length < maxFields && (
          <Button variant="outline" size="sm" data-testid="field-definition-add-btn" onClick={startAdd}>
            <Plus className="h-3 w-3" />
            {t('fieldEditor.addField')}
          </Button>
        )
      )}
    </div>
  )
}
```

- [ ] **Step 5.3: Update `report-types-section.tsx` to use `FieldDefinitionEditor`**

Replace the import block and the inline `ReportTypeFieldsEditor` component:

**Imports to add/change in `report-types-section.tsx`:**
```typescript
// Remove:
import type { ReportType, CustomFieldDefinition } from '@shared/types'
import { MAX_REPORT_TYPES, MAX_CUSTOM_FIELDS } from '@shared/types'
// Add:
import type { ReportType } from '@shared/types'
import { MAX_REPORT_TYPES } from '@shared/types'
import type { ReportFieldDefinition } from '@protocol/schemas/report-types'
import { FieldDefinitionEditor } from './field-definition-editor'
```

**Replace the `<ReportTypeFieldsEditor>` call (line ~255):**
```typescript
<FieldDefinitionEditor
  fields={(editing.fields ?? []) as ReportFieldDefinition[]}
  onChange={fields => setEditing(prev => ({ ...prev!, fields: fields as ReportType['fields'] }))}
  showAudioInput={true}
/>
```

**Delete** the entire `ReportTypeFieldsEditor` function (lines 301–500).

Update `handleCreate` and `handleUpdate` bodies: the `fields: editing.fields || []` expressions remain unchanged — the `FieldDefinitionEditor` ensures each field has the full `ReportFieldDefinition` shape already.

- [ ] **Step 5.4: Update `api.ts` types for report type functions**

In `src/client/lib/api.ts`, update the `createReportType` and `updateReportType` signatures to accept `ReportFieldDefinition[]` instead of `CustomFieldDefinition[]`:

```typescript
// Around line 1125
import type { ReportFieldDefinition } from '@protocol/schemas/report-types'

export async function createReportType(data: {
  name: string
  description?: string
  icon?: string
  fields?: ReportFieldDefinition[]
  isDefault?: boolean
}) { ... }

export async function updateReportType(id: string, data: {
  name?: string
  description?: string
  icon?: string
  fields?: ReportFieldDefinition[]
  isDefault?: boolean
  isArchived?: boolean
}) { ... }
```

- [ ] **Step 5.5: Run typecheck and build**

```bash
bun run typecheck && bun run build
```

Expected: 0 type errors, build succeeds.

- [ ] **Step 5.6: Run Playwright E2E tests**

```bash
bun run test
```

Expected: PASS. If any report-type-related tests fail, fix the selectors (the field editor now uses `data-testid="field-definition-add-btn"` instead of `data-testid="field-add-btn"`).

- [ ] **Step 5.7: Commit**

```bash
git add \
  src/client/components/admin-settings/field-definition-editor.tsx \
  src/client/components/admin-settings/report-types-section.tsx \
  src/client/lib/api.ts \
  packages/i18n/locales/en.json
git commit -m "feat(desktop): replace ReportTypeFieldsEditor with FieldDefinitionEditor using ReportFieldDefinition"
```

---

## Task 6: iOS — Add geocoding and file upload to APIService

**Files:**
- Modify: `apps/ios/Sources/Services/APIService.swift`

- [ ] **Step 6.1: Add geocoding and file upload methods to `APIService.swift`**

Open `apps/ios/Sources/Services/APIService.swift` on mac:
```bash
ssh mac "cat ~/projects/llamenos/apps/ios/Sources/Services/APIService.swift" | tail -50
```

Append the following methods to `APIService` (before the closing `}`):

```swift
// MARK: - Geocoding

struct AutocompleteBody: Encodable {
    let query: String
    let limit: Int
}

struct AutocompleteResponse: Decodable {
    let results: [LocationResult]
}

struct LocationResult: Codable {
    let address: String
    let displayName: String?
    let lat: Double
    let lon: Double
    let countryCode: String?
}

struct ReverseGeocodeBody: Encodable {
    let lat: Double
    let lon: Double
}

func geocodingAutocomplete(query: String, limit: Int = 5) async throws -> [LocationResult] {
    let body = AutocompleteBody(query: query, limit: limit)
    let response: AutocompleteResponse = try await request(
        method: "POST",
        path: "/api/geocoding/autocomplete",
        body: body
    )
    return response.results
}

func geocodingReverse(lat: Double, lon: Double) async throws -> LocationResult? {
    let body = ReverseGeocodeBody(lat: lat, lon: lon)
    return try? await request(
        method: "POST",
        path: "/api/geocoding/reverse",
        body: body
    )
}

// MARK: - CMS Field Upload

struct FileFieldValue: Codable {
    let fileId: String
    let filename: String
    let mimeType: String
    let sizeBytes: Int
    let uploadedAt: String
}

func uploadCmsFile(data: Data, filename: String, mimeType: String) async throws -> FileFieldValue {
    guard let url = URL(string: hp("/api/cms/field-upload")) else {
        throw URLError(.badURL)
    }
    let boundary = "Boundary-\(UUID().uuidString)"
    var body = Data()
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
    body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
    body.append(data)
    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    req.httpBody = body
    // Auth header — reuse the session token injection pattern from existing request()
    if let token = sessionToken {
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }

    let (responseData, response) = try await session.data(for: req)
    guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
        throw URLError(.badServerResponse)
    }
    return try JSONDecoder().decode(FileFieldValue.self, from: responseData)
}
```

> **Note:** Check how `sessionToken` is stored in the existing `APIService.swift` — it may be named `authToken` or similar. Use the same pattern as the existing `request()` method for injecting the Authorization header.

- [ ] **Step 6.2: Build iOS on mac**

```bash
ssh mac "cd ~/projects/llamenos/apps/ios && xcodegen generate && xcodebuild build -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -20"
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 6.3: Commit**

```bash
git add apps/ios/Sources/Services/APIService.swift
git commit -m "feat(ios): add geocodingAutocomplete, geocodingReverse, uploadCmsFile to APIService"
```

---

## Task 7: iOS — LocationField SwiftUI component

**Files:**
- Create: `apps/ios/Sources/Views/Reports/LocationField.swift`
- Modify: `apps/ios/Sources/Views/Reports/TypedReportCreateView.swift`

- [ ] **Step 7.1: Create `apps/ios/Sources/Views/Reports/LocationField.swift`**

Create this file on mac via ssh:

```swift
import SwiftUI

/// Stored value for a `location` field — JSON-encoded as a string in the field values dictionary.
struct LocationFieldValue: Codable {
    var lat: Double?
    var lon: Double?
    var displayAddress: String
    var precision: String  // none | city | neighborhood | block | exact
    var source: String     // manual | autocomplete | gps
}

struct LocationField: View {
    let field: ClientReportFieldDefinition
    @Binding var value: String  // JSON-encoded LocationFieldValue

    @State private var displayText: String = ""
    @State private var suggestions: [APIService.LocationResult] = []
    @State private var showDropdown = false
    @State private var gpsLoading = false
    @State private var debounceTask: Task<Void, Never>? = nil

    private var maxPrecision: String {
        field.locationOptions?.maxPrecision ?? "exact"
    }

    private let precisionOrder = ["none", "city", "neighborhood", "block", "exact"]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                HStack {
                    Image(systemName: "mappin.and.ellipse")
                        .foregroundStyle(.secondary)
                        .frame(width: 16)
                    TextField(
                        field.placeholder ?? NSLocalizedString("location_placeholder", comment: "Enter address"),
                        text: $displayText
                    )
                    .textFieldStyle(.plain)
                    .onChange(of: displayText) { _, newValue in
                        scheduleAutocomplete(query: newValue)
                        commitManual(text: newValue)
                    }
                }
                .padding(8)
                .background(Color(.systemGray6))
                .cornerRadius(8)

                if field.locationOptions?.allowGps != false {
                    Button {
                        fetchGPS()
                    } label: {
                        if gpsLoading {
                            ProgressView().frame(width: 20, height: 20)
                        } else {
                            Image(systemName: "location.fill")
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(gpsLoading)
                }
            }

            if showDropdown && !suggestions.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(suggestions.enumerated()), id: \.offset) { _, result in
                        Button {
                            selectSuggestion(result)
                        } label: {
                            Text(result.address)
                                .font(.callout)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                        }
                        .buttonStyle(.plain)
                        Divider()
                    }
                }
                .background(Color(.systemBackground))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.3)))
                .cornerRadius(8)
                .shadow(radius: 4)
            }
        }
        .onAppear {
            if let existing = try? JSONDecoder().decode(LocationFieldValue.self, from: Data(value.utf8)) {
                displayText = existing.displayAddress
            }
        }
    }

    private func scheduleAutocomplete(query: String) {
        guard field.locationOptions?.allowAutocomplete != false, query.count >= 3 else {
            suggestions = []
            showDropdown = false
            return
        }
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            let results = (try? await APIService.shared.geocodingAutocomplete(query: query)) ?? []
            await MainActor.run {
                suggestions = results
                showDropdown = !results.isEmpty
            }
        }
    }

    private func commitManual(text: String) {
        let fieldValue = LocationFieldValue(
            displayAddress: text,
            precision: "none",
            source: "manual"
        )
        if let data = try? JSONEncoder().encode(fieldValue),
           let str = String(data: data, encoding: .utf8) {
            value = str
        }
    }

    private func selectSuggestion(_ result: APIService.LocationResult) {
        displayText = result.address
        showDropdown = false
        suggestions = []
        var fieldValue = LocationFieldValue(
            lat: result.lat,
            lon: result.lon,
            displayAddress: result.address,
            precision: maxPrecision,
            source: "autocomplete"
        )
        fieldValue = truncateForPrecision(fieldValue)
        if let data = try? JSONEncoder().encode(fieldValue),
           let str = String(data: data, encoding: .utf8) {
            value = str
        }
    }

    private func fetchGPS() {
        gpsLoading = true
        Task {
            defer { Task { @MainActor in gpsLoading = false } }
            guard let result = try? await LocationService.shared.captureAndResolve() else { return }
            var fieldValue = LocationFieldValue(
                lat: result.lat,
                lon: result.lon,
                displayAddress: result.address,
                precision: maxPrecision,
                source: "gps"
            )
            fieldValue = truncateForPrecision(fieldValue)
            await MainActor.run {
                displayText = fieldValue.displayAddress
                if let data = try? JSONEncoder().encode(fieldValue),
                   let str = String(data: data, encoding: .utf8) {
                    value = str
                }
            }
        }
    }

    private func truncateForPrecision(_ v: LocationFieldValue) -> LocationFieldValue {
        let maxIdx = precisionOrder.firstIndex(of: maxPrecision) ?? precisionOrder.count - 1
        let exactIdx = precisionOrder.firstIndex(of: "exact")!
        if maxIdx < exactIdx {
            var stripped = v
            stripped.lat = nil
            stripped.lon = nil
            stripped.precision = maxPrecision
            return stripped
        }
        return v
    }
}
```

> **Note:** The iOS `LocationService` at `apps/ios/Sources/Services/LocationService.swift` already has a `captureAndResolve()` method but currently returns its own `LocationResult` type (a local struct in that file). Check if it is the same as `APIService.LocationResult` and reconcile to avoid duplication — prefer using `APIService.LocationResult` in both places, or move `LocationResult` to a shared file.

- [ ] **Step 7.2: Wire `LocationField` into `TypedReportCreateView.swift`**

In `TypedReportCreateView.swift`, in the `fieldInput(for:)` switch, the `.location` case is currently missing (falls through to default or is absent entirely). Add it:

```swift
case .location:
    LocationField(
        field: field,
        value: Binding(
            get: {
                if case .string(let s) = fieldValues[field.name] { return s }
                return ""
            },
            set: { newVal in fieldValues[field.name] = .string(newVal) }
        )
    )
```

The exact binding pattern should match how other string fields (`.text`) bind their values in the existing switch. Look at the `.text` case for the pattern.

- [ ] **Step 7.3: Build iOS on mac**

```bash
ssh mac "cd ~/projects/llamenos/apps/ios && xcodegen generate && xcodebuild build -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -30"
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 7.4: Run iOS unit tests on mac**

```bash
ssh mac "cd ~/projects/llamenos/apps/ios && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -30"
```

Expected: All existing tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add apps/ios/Sources/Views/Reports/LocationField.swift apps/ios/Sources/Views/Reports/TypedReportCreateView.swift
git commit -m "feat(ios): implement LocationField with geocoding autocomplete and GPS"
```

---

## Task 8: iOS — FileUploadField SwiftUI component

**Files:**
- Create: `apps/ios/Sources/Views/Reports/FileUploadField.swift`
- Modify: `apps/ios/Sources/Views/Reports/TypedReportCreateView.swift`

- [ ] **Step 8.1: Create `apps/ios/Sources/Views/Reports/FileUploadField.swift`**

```swift
import SwiftUI
import PhotosUI

/// Stored value for a `file` field — JSON-encoded as a [FileFieldValue] array.
// Note: FileFieldValue is already defined in APIService.swift — import from there.

struct FileUploadField: View {
    let field: ClientReportFieldDefinition
    @Binding var value: String  // JSON-encoded [FileFieldValue] or ""

    @State private var files: [APIService.FileFieldValue] = []
    @State private var uploading = false
    @State private var showPhotoPicker = false
    @State private var showCamera = false
    @State private var selectedPhoto: PhotosPickerItem? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Existing files
            ForEach(files, id: \.fileId) { f in
                HStack {
                    Image(systemName: "paperclip")
                        .foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(f.filename).font(.callout)
                        Text(formatBytes(f.sizeBytes)).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        removeFile(id: f.fileId)
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.plain)
                }
                .padding(8)
                .background(Color(.systemGray6))
                .cornerRadius(8)
            }

            // Upload buttons
            HStack(spacing: 8) {
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label("Choose Photo", systemImage: "photo")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .onChange(of: selectedPhoto) { _, item in
                    guard let item else { return }
                    uploadPhotoItem(item)
                }

                Button {
                    showCamera = true
                } label: {
                    Label("Take Photo", systemImage: "camera")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .disabled(uploading)

            if uploading {
                HStack {
                    ProgressView().padding(.trailing, 4)
                    Text("Uploading…").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .onAppear {
            if !value.isEmpty,
               let data = value.data(using: .utf8),
               let decoded = try? JSONDecoder().decode([APIService.FileFieldValue].self, from: data) {
                files = decoded
            }
        }
        .sheet(isPresented: $showCamera) {
            CameraPickerView { image in
                uploadUIImage(image)
            }
        }
    }

    private func uploadPhotoItem(_ item: PhotosPickerItem) {
        uploading = true
        Task {
            defer { Task { @MainActor in uploading = false } }
            guard let data = try? await item.loadTransferable(type: Data.self) else { return }
            let filename = "photo_\(Int(Date().timeIntervalSince1970)).jpg"
            guard let result = try? await APIService.shared.uploadCmsFile(
                data: data, filename: filename, mimeType: "image/jpeg"
            ) else { return }
            await MainActor.run {
                files.append(result)
                encodeFiles()
            }
        }
    }

    private func uploadUIImage(_ image: UIImage) {
        guard let data = image.jpegData(compressionQuality: 0.8) else { return }
        uploading = true
        Task {
            defer { Task { @MainActor in uploading = false } }
            let filename = "photo_\(Int(Date().timeIntervalSince1970)).jpg"
            guard let result = try? await APIService.shared.uploadCmsFile(
                data: data, filename: filename, mimeType: "image/jpeg"
            ) else { return }
            await MainActor.run {
                files.append(result)
                encodeFiles()
            }
        }
    }

    private func removeFile(id: String) {
        files.removeAll { $0.fileId == id }
        encodeFiles()
    }

    private func encodeFiles() {
        if files.isEmpty { value = ""; return }
        if let data = try? JSONEncoder().encode(files),
           let str = String(data: data, encoding: .utf8) {
            value = str
        }
    }

    private func formatBytes(_ n: Int) -> String {
        if n < 1024 { return "\(n) B" }
        if n < 1_048_576 { return "\(n / 1024) KB" }
        return String(format: "%.1f MB", Double(n) / 1_048_576)
    }
}

/// Minimal UIViewControllerRepresentable wrapper for the camera.
struct CameraPickerView: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onImage: onImage) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onImage: (UIImage) -> Void
        init(onImage: @escaping (UIImage) -> Void) { self.onImage = onImage }
        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { onImage(img) }
            picker.dismiss(animated: true)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            picker.dismiss(animated: true)
        }
    }
}
```

- [ ] **Step 8.2: Wire `FileUploadField` and remove `fileFieldPlaceholder`**

In `TypedReportCreateView.swift`:
1. Add `case .file:` routing to `FileUploadField(field:value:)` — same binding pattern as `LocationField`.
2. Delete the `fileFieldPlaceholder(for:)` method.

- [ ] **Step 8.3: Build and test iOS**

```bash
ssh mac "cd ~/projects/llamenos/apps/ios && xcodegen generate && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -30"
```

Expected: BUILD SUCCEEDED, all tests pass.

- [ ] **Step 8.4: Commit**

```bash
git add apps/ios/Sources/Views/Reports/FileUploadField.swift apps/ios/Sources/Views/Reports/TypedReportCreateView.swift
git commit -m "feat(ios): implement FileUploadField with photo library + camera upload; remove fileFieldPlaceholder"
```

---

## Task 9: Android — Add geocoding and file upload to ApiService

**Files:**
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt`

- [ ] **Step 9.1: Add geocoding autocomplete and file upload methods to `ApiService.kt`**

Open the file and add after the existing `getHubKey` method:

```kotlin
// MARK: - Geocoding autocomplete

@Serializable
private data class AutocompleteBody(val query: String, val limit: Int = 5)

@Serializable
private data class AutocompleteResponse(val results: List<LocationResult>)

suspend fun geocodingAutocomplete(query: String, limit: Int = 5): List<LocationResult> {
    val response: AutocompleteResponse = request(
        method = "POST",
        path = "/api/geocoding/autocomplete",
        body = AutocompleteBody(query = query, limit = limit),
    )
    return response.results
}

// MARK: - CMS Field Upload

@Serializable
data class CmsFileFieldValue(
    val fileId: String,
    val filename: String,
    val mimeType: String,
    val sizeBytes: Long,
    val uploadedAt: String,
)

suspend fun uploadCmsFile(
    context: android.content.Context,
    uri: android.net.Uri,
    filename: String,
    mimeType: String,
): CmsFileFieldValue {
    val baseUrl = getBaseUrl()
    val url = java.net.URL("$baseUrl/api/cms/field-upload")
    val boundary = "Boundary-${java.util.UUID.randomUUID()}"

    val connection = url.openConnection() as java.net.HttpURLConnection
    connection.requestMethod = "POST"
    connection.doOutput = true
    connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
    // Auth header
    sessionState.token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }

    val bytes = context.contentResolver.openInputStream(uri)?.readBytes()
        ?: throw IllegalArgumentException("Cannot read file at $uri")

    connection.outputStream.bufferedWriter(Charsets.UTF_8).use { writer ->
        writer.write("--$boundary\r\n")
        writer.write("Content-Disposition: form-data; name=\"file\"; filename=\"$filename\"\r\n")
        writer.write("Content-Type: $mimeType\r\n\r\n")
        writer.flush()
        connection.outputStream.write(bytes)
        writer.write("\r\n--$boundary--\r\n")
    }

    val code = connection.responseCode
    if (code != 200) throw ApiException(code, "Upload failed")
    val body = connection.inputStream.readBytes().decodeToString()
    return kotlinx.serialization.json.Json.decodeFromString(body)
}
```

> **Note:** Check how `sessionState.token` is accessed in the existing `ApiService.kt`. The pattern will be the same as the `Authorization` header in the existing `request()` method. Use the same accessor.

- [ ] **Step 9.2: Compile Android debug**

```bash
cd ~/projects/llamenos/apps/android && ./gradlew compileDebugKotlin 2>&1 | tail -30
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 9.3: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt
git commit -m "feat(android): add geocodingAutocomplete and uploadCmsFile to ApiService"
```

---

## Task 10: Android — LocationField composable

**Files:**
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/LocationField.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/TypedReportCreateScreen.kt`

- [ ] **Step 10.1: Create `LocationField.kt`**

```kotlin
package org.llamenos.hotline.ui.reports

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.service.LocationResult
import org.llamenos.hotline.service.LocationError

@Serializable
data class LocationFieldValue(
    val lat: Double? = null,
    val lon: Double? = null,
    val displayAddress: String,
    val precision: String,
    val source: String,
)

private val precisionOrder = listOf("none", "city", "neighborhood", "block", "exact")

private fun truncateForPrecision(value: LocationFieldValue, maxPrecision: String): LocationFieldValue {
    val maxIdx = precisionOrder.indexOf(maxPrecision)
    val exactIdx = precisionOrder.indexOf("exact")
    return if (maxIdx < exactIdx) value.copy(lat = null, lon = null, precision = maxPrecision) else value
}

@Composable
fun LocationField(
    field: ReportTypeDefinitionField,
    value: String,
    onValueChange: (String) -> Unit,
    locationService: org.llamenos.hotline.service.LocationService,
    apiService: ApiService,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val maxPrecision = field.locationOptions?.maxPrecision ?: "exact"

    var displayText by remember {
        mutableStateOf(
            value.takeIf { it.isNotBlank() }
                ?.let { runCatching { Json.decodeFromString<LocationFieldValue>(it) }.getOrNull()?.displayAddress }
                ?: ""
        )
    }
    var suggestions by remember { mutableStateOf(emptyList<LocationResult>()) }
    var showDropdown by remember { mutableStateOf(false) }
    var gpsLoading by remember { mutableStateOf(false) }
    var debounceJob: Job? by remember { mutableStateOf(null) }

    fun commitValue(fieldValue: LocationFieldValue) {
        onValueChange(Json.encodeToString(fieldValue))
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = displayText,
                onValueChange = { text ->
                    displayText = text
                    commitValue(LocationFieldValue(displayAddress = text, precision = "none", source = "manual"))

                    if (field.locationOptions?.allowAutocomplete != false && text.length >= 3) {
                        debounceJob?.cancel()
                        debounceJob = scope.launch {
                            delay(400)
                            val results = runCatching { apiService.geocodingAutocomplete(query = text) }.getOrNull() ?: emptyList()
                            suggestions = results
                            showDropdown = results.isNotEmpty()
                        }
                    } else {
                        suggestions = emptyList()
                        showDropdown = false
                    }
                },
                leadingIcon = { Icon(Icons.Default.LocationOn, contentDescription = null) },
                placeholder = { Text(field.placeholder ?: "Enter address…") },
                modifier = Modifier.weight(1f),
                singleLine = true,
            )

            if (field.locationOptions?.allowGps != false) {
                IconButton(
                    onClick = {
                        scope.launch {
                            gpsLoading = true
                            try {
                                val result = locationService.captureAndResolve()
                                val fieldValue = truncateForPrecision(
                                    LocationFieldValue(
                                        lat = result.lat,
                                        lon = result.lon,
                                        displayAddress = result.address,
                                        precision = maxPrecision,
                                        source = "gps",
                                    ),
                                    maxPrecision,
                                )
                                displayText = fieldValue.displayAddress
                                commitValue(fieldValue)
                            } catch (_: LocationError) {
                                // permission denied or no result — silent fail
                            } finally {
                                gpsLoading = false
                            }
                        }
                    },
                    enabled = !gpsLoading,
                ) {
                    if (gpsLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.MyLocation, contentDescription = "Use current location")
                    }
                }
            }
        }

        if (showDropdown && suggestions.isNotEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
            ) {
                LazyColumn {
                    items(suggestions) { result ->
                        TextButton(
                            onClick = {
                                val fieldValue = truncateForPrecision(
                                    LocationFieldValue(
                                        lat = result.lat,
                                        lon = result.lon,
                                        displayAddress = result.address,
                                        precision = maxPrecision,
                                        source = "autocomplete",
                                    ),
                                    maxPrecision,
                                )
                                displayText = fieldValue.displayAddress
                                commitValue(fieldValue)
                                showDropdown = false
                                suggestions = emptyList()
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(result.address, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 10.2: Wire `LocationField` into `TypedReportCreateScreen.kt`**

Replace the `JoinFieldType.Location` branch (lines ~371–381):

```kotlin
JoinFieldType.Location -> LocationField(
    field = field,
    value = value,
    onValueChange = onValueChange,
    locationService = locationService,
    apiService = apiService,
)
```

The `DynamicField` composable will need `locationService` and `apiService` passed in via Hilt. Find how the ViewModel injects services and pass them through — check if `TypedReportCreateScreen` already receives a ViewModel that has these dependencies.

- [ ] **Step 10.3: Compile and test Android**

```bash
cd ~/projects/llamenos/apps/android
./gradlew testDebugUnitTest && ./gradlew lintDebug && ./gradlew compileDebugAndroidTestKotlin 2>&1 | tail -30
```

Expected: BUILD SUCCESSFUL, all unit tests pass, no lint errors.

- [ ] **Step 10.4: Commit**

```bash
git add \
  apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/LocationField.kt \
  apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/TypedReportCreateScreen.kt
git commit -m "feat(android): implement LocationField composable with geocoding autocomplete and GPS"
```

---

## Task 11: Android — FileUploadField composable

**Files:**
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/FileUploadField.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/TypedReportCreateScreen.kt`

- [ ] **Step 11.1: Create `FileUploadField.kt`**

```kotlin
package org.llamenos.hotline.ui.reports

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Camera
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.api.CmsFileFieldValue

@Composable
fun FileUploadField(
    field: ReportTypeDefinitionField,
    value: String,
    onValueChange: (String) -> Unit,
    apiService: ApiService,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var uploading by remember { mutableStateOf(false) }

    val files: List<CmsFileFieldValue> = remember(value) {
        value.takeIf { it.isNotBlank() }
            ?.let { runCatching { Json.decodeFromString<List<CmsFileFieldValue>>(it) }.getOrNull() }
            ?: emptyList()
    }

    fun commitFiles(updated: List<CmsFileFieldValue>) {
        onValueChange(if (updated.isEmpty()) "" else Json.encodeToString(updated))
    }

    fun uploadUri(uri: Uri, mimeType: String) {
        val filename = context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && nameIndex >= 0) cursor.getString(nameIndex) else null
        } ?: "file_${System.currentTimeMillis()}"

        uploading = true
        scope.launch {
            try {
                val result = apiService.uploadCmsFile(context, uri, filename, mimeType)
                commitFiles(files + result)
            } catch (_: Exception) {
                // TODO: show snackbar error
            } finally {
                uploading = false
            }
        }
    }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
            uploadUri(uri, mime)
        }
    }

    // For camera — create a temp URI, capture, then upload
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val cameraPicker = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success && cameraUri != null) {
            uploadUri(cameraUri!!, "image/jpeg")
        }
    }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // Existing file chips
        files.forEach { f ->
            Row(
                modifier = Modifier.fillMaxWidth()
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Default.AttachFile, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text(f.filename, style = MaterialTheme.typography.bodySmall)
                    Text(formatBytes(f.sizeBytes), style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { commitFiles(files.filter { it.fileId != f.fileId }) }) {
                    Icon(Icons.Default.Close, contentDescription = "Remove", tint = MaterialTheme.colorScheme.error)
                }
            }
        }

        // Action buttons
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = { filePicker.launch("*/*") },
                enabled = !uploading,
                modifier = Modifier.weight(1f),
            ) {
                Icon(Icons.Default.AttachFile, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Choose File", style = MaterialTheme.typography.labelMedium)
            }

            OutlinedButton(
                onClick = {
                    val tmpFile = java.io.File(context.cacheDir, "camera_${System.currentTimeMillis()}.jpg")
                    cameraUri = androidx.core.content.FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        tmpFile,
                    )
                    cameraPicker.launch(cameraUri!!)
                },
                enabled = !uploading,
                modifier = Modifier.weight(1f),
            ) {
                Icon(Icons.Default.Camera, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Take Photo", style = MaterialTheme.typography.labelMedium)
            }
        }

        if (uploading) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
                Text("Uploading…", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

private fun formatBytes(n: Long): String = when {
    n < 1024 -> "$n B"
    n < 1_048_576 -> "${n / 1024} KB"
    else -> String.format("%.1f MB", n.toDouble() / 1_048_576)
}
```

> **Note:** The camera capture requires a `FileProvider` in `AndroidManifest.xml`. Check if one is already configured (look for `<provider android:name="androidx.core.content.FileProvider"` in the manifest). If not, add it — this is standard Android setup for camera capture.

- [ ] **Step 11.2: Wire `FileUploadField` into `TypedReportCreateScreen.kt`**

Replace the `JoinFieldType.File` branch:

```kotlin
JoinFieldType.File -> FileUploadField(
    field = field,
    value = value,
    onValueChange = onValueChange,
    apiService = apiService,
)
```

- [ ] **Step 11.3: Compile and test Android**

```bash
cd ~/projects/llamenos/apps/android
./gradlew testDebugUnitTest && ./gradlew lintDebug && ./gradlew compileDebugAndroidTestKotlin 2>&1 | tail -30
```

Expected: BUILD SUCCESSFUL, all tests pass.

- [ ] **Step 11.4: Commit**

```bash
git add \
  apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/FileUploadField.kt \
  apps/android/app/src/main/java/org/llamenos/hotline/ui/reports/TypedReportCreateScreen.kt
git commit -m "feat(android): implement FileUploadField composable with file picker + camera upload"
```

---

## Task 12: Final verification pass

- [ ] **Step 12.1: Full desktop verification**

```bash
cd ~/projects/llamenos
bun run typecheck && bun run build
bun run test
```

Expected: 0 type errors, build succeeds, all Playwright tests pass.

- [ ] **Step 12.2: Full Android verification**

```bash
cd ~/projects/llamenos/apps/android
./gradlew testDebugUnitTest && ./gradlew lintDebug && ./gradlew compileDebugAndroidTestKotlin
```

Expected: All pass.

- [ ] **Step 12.3: Full iOS verification on mac**

```bash
ssh mac "cd ~/projects/llamenos/apps/ios && xcodegen generate && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -30"
```

Expected: All tests pass.

- [ ] **Step 12.4: Full backend BDD tests**

```bash
bun run test:backend:bdd
```

Expected: All scenarios pass.

- [ ] **Step 12.5: Verify codegen output includes new types**

```bash
bun run codegen
ls packages/protocol/generated/swift/ | grep -i location
ls packages/protocol/generated/kotlin/ | grep -i location
```

Expected: `LocationFieldValue.swift` and `LocationFieldValue.kt` (or equivalent) exist in generated output.

- [ ] **Step 12.6: Final commit**

```bash
git add packages/protocol/
git commit -m "chore: regenerate protocol types with LocationFieldValue and FileFieldValue"
```

---

## Verification Checklist (from spec)

Use these as a final gate before marking implementation complete:

**Gap 1: Location Field**
- [ ] `locationFieldValueSchema` exported from `packages/protocol/schemas/geocoding.ts`
- [ ] Desktop: `schema-form.tsx` renders `LocationFieldInput` for `field.type === 'location'`
- [ ] Desktop: typing triggers debounced call to `POST /api/geocoding/autocomplete`, shows dropdown
- [ ] Desktop: selecting suggestion populates `lat`, `lon`, `displayAddress` in stored JSON
- [ ] Desktop: GPS button uses `navigator.geolocation` and calls `/api/geocoding/reverse`
- [ ] Desktop: `maxPrecision === 'city'` stored value has no `lat`/`lon`
- [ ] iOS: `TypedReportCreateView` `.location` case renders `LocationField`
- [ ] Android: `DynamicField` `JoinFieldType.Location` renders `LocationField` composable

**Gap 2: File Field**
- [ ] `fileFieldValueSchema` exported from `packages/protocol/schemas/entity-schema.ts`
- [ ] `POST /api/cms/field-upload` exists and returns `{ fileId, filename, mimeType, sizeBytes, uploadedAt }`
- [ ] Desktop: `schema-form.tsx` renders `FileUploadField` for `field.type === 'file'`
- [ ] Desktop: file picker + drag-drop + upload + chip display working
- [ ] iOS: `.file` case renders `FileUploadField`, `fileFieldPlaceholder` removed
- [ ] Android: `JoinFieldType.File` renders `FileUploadField`, no `(desktop only)` fallback

**Gap 3: Report Type Field Editor**
- [ ] Editing a report type shows `FieldDefinitionEditor`
- [ ] All field types available in type selector including `file` and `location`
- [ ] `select`/`multiselect` shows options list editor
- [ ] `textarea` shows `supportAudioInput` toggle
- [ ] `location` shows maxPrecision, allowGps, allowAutocomplete options
- [ ] Fields saved via PATCH use `ReportFieldDefinition` shape (not `CustomFieldDefinition`)
- [ ] `bun run typecheck && bun run build` passes
