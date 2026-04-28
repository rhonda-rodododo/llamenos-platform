# Epic 300: Mobile Admin Feature Parity

**Status**: PENDING
**Priority**: Low
**Depends on**: None
**Blocks**: None
**Branch**: `desktop`

## Summary

Close the feature gap between desktop and mobile admin capabilities across 4 phases. iOS and Android admins currently cannot manage custom fields, report categories, telephony providers, IVR prompts, transcription settings, call settings, rate limiting, or play call recordings. This epic implements the most impactful features on both mobile platforms, using existing backend APIs (no new endpoints needed).

## Problem Statement

Desktop admins have full access to the admin settings panel (`/admin/settings`) with 10+ configurable sections. Mobile admins (iOS and Android) have access to:
- Volunteer management (list, view)
- Ban list management
- Audit log viewing
- Invite management
- Custom field viewing (read-only)

Missing from mobile:
1. **Custom field CRUD** — Admins cannot create, edit, or delete custom fields (note templates) from mobile. This is the most-requested feature since admins often need to adjust field definitions while away from their desktop.
2. **Report category management** — Cannot add/edit/delete report categories.
3. **Telephony provider selection** — Cannot switch between Twilio/SignalWire/Vonage or update credentials.
4. **IVR prompt configuration** — Cannot enable/disable IVR languages or upload voice prompts.
5. **Transcription settings** — Cannot toggle transcription or configure Whisper model.
6. **Call settings** — Cannot configure ring timeout, max call duration, parallel ring count.
7. **Rate limiting configuration** — Cannot adjust spam mitigation settings.
8. **Role creation/editing** — Complex UI, deferred to desktop-only (acceptable tradeoff).
9. **Recording playback** — No audio player component on mobile for call recordings.
10. **Encrypted export** — Desktop-only feature, not prioritized for mobile.

Phases prioritize by admin request frequency and implementation complexity.

## Implementation

### Phase 1: Custom Field Management (iOS + Android)

Custom fields are the most requested mobile admin feature. The API already exists:
- `GET /api/settings/custom-fields` — list definitions
- `POST /api/settings/custom-fields` — create
- `PUT /api/settings/custom-fields/:id` — update
- `DELETE /api/settings/custom-fields/:id` — delete

Each custom field has: `id` (UUID), `label` (string), `type` (text | number | select | checkbox), `required` (bool), `options` (string[] for select type), `order` (number).

#### iOS Implementation

**File: `apps/ios/Sources/Views/Admin/CustomFieldEditView.swift`** (modify existing file)

```swift
import SwiftUI

struct CustomFieldEditView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    let existingField: CustomFieldDefinition?
    let onSave: (CustomFieldDefinition) async throws -> Void

    @State private var label = ""
    @State private var fieldType: CustomFieldType = .text
    @State private var isRequired = false
    @State private var options: [String] = []
    @State private var newOption = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(field: CustomFieldDefinition? = nil, onSave: @escaping (CustomFieldDefinition) async throws -> Void) {
        self.existingField = field
        self.onSave = onSave
        if let field {
            _label = State(initialValue: field.label)
            _fieldType = State(initialValue: field.type)
            _isRequired = State(initialValue: field.required)
            _options = State(initialValue: field.options ?? [])
        }
    }

    var body: some View {
        Form {
            Section(header: Text(NSLocalizedString("admin_field_label", comment: "Label"))) {
                TextField(
                    NSLocalizedString("admin_field_label_placeholder", comment: "Field name"),
                    text: $label
                )
                .accessibilityIdentifier("field-label-input")
            }

            Section(header: Text(NSLocalizedString("admin_field_type", comment: "Type"))) {
                Picker(
                    NSLocalizedString("admin_field_type", comment: "Type"),
                    selection: $fieldType
                ) {
                    Text(NSLocalizedString("admin_field_type_text", comment: "Text")).tag(CustomFieldType.text)
                    Text(NSLocalizedString("admin_field_type_number", comment: "Number")).tag(CustomFieldType.number)
                    Text(NSLocalizedString("admin_field_type_select", comment: "Select")).tag(CustomFieldType.select)
                    Text(NSLocalizedString("admin_field_type_checkbox", comment: "Checkbox")).tag(CustomFieldType.checkbox)
                }
                .accessibilityIdentifier("field-type-picker")
            }

            if fieldType == .select {
                Section(header: Text(NSLocalizedString("admin_field_options", comment: "Options"))) {
                    ForEach(options.indices, id: \.self) { index in
                        HStack {
                            Text(options[index])
                            Spacer()
                            Button(role: .destructive) {
                                options.remove(at: index)
                            } label: {
                                Image(systemName: "minus.circle.fill")
                                    .foregroundColor(.red)
                            }
                        }
                    }
                    .onMove { from, to in
                        options.move(fromOffsets: from, toOffset: to)
                    }

                    HStack {
                        TextField(
                            NSLocalizedString("admin_field_new_option", comment: "New option"),
                            text: $newOption
                        )
                        Button {
                            guard !newOption.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                            options.append(newOption.trimmingCharacters(in: .whitespaces))
                            newOption = ""
                        } label: {
                            Image(systemName: "plus.circle.fill")
                        }
                        .disabled(newOption.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }

            Section {
                Toggle(
                    NSLocalizedString("admin_field_required", comment: "Required"),
                    isOn: $isRequired
                )
                .accessibilityIdentifier("field-required-toggle")
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundColor(.red)
                        .font(.caption)
                }
            }
        }
        .navigationTitle(existingField == nil
            ? NSLocalizedString("admin_field_create", comment: "New Field")
            : NSLocalizedString("admin_field_edit", comment: "Edit Field")
        )
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(NSLocalizedString("save", comment: "Save")) {
                    Task { await save() }
                }
                .disabled(label.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                .accessibilityIdentifier("save-field-button")
            }
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        let field = CustomFieldDefinition(
            id: existingField?.id ?? UUID().uuidString,
            label: label.trimmingCharacters(in: .whitespaces),
            type: fieldType,
            required: isRequired,
            options: fieldType == .select ? options : nil,
            order: existingField?.order ?? 0
        )

        do {
            try await onSave(field)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }

        isSaving = false
    }
}
```

**File: `apps/ios/Sources/Views/Admin/CustomFieldsView.swift`** (extend existing)

Add create, edit, and delete functionality. The existing view is read-only — extend it with:
- Toolbar "+" button to create new fields
- Swipe-to-delete on each row
- Tap to edit (navigate to `CustomFieldEditView`)
- Drag-to-reorder for field ordering

#### Android Implementation

**File: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/CustomFieldEditorScreen.kt`**

```kotlin
@Composable
fun CustomFieldEditorScreen(
    existingField: CustomFieldDefinition? = null,
    onSave: suspend (CustomFieldDefinition) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var label by remember { mutableStateOf(existingField?.label ?: "") }
    var fieldType by remember { mutableStateOf(existingField?.type ?: CustomFieldType.TEXT) }
    var isRequired by remember { mutableStateOf(existingField?.required ?: false) }
    var options by remember { mutableStateOf(existingField?.options ?: emptyList()) }
    var newOption by remember { mutableStateOf("") }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (existingField == null)
                            stringResource(R.string.admin_field_create)
                        else
                            stringResource(R.string.admin_field_edit)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = stringResource(R.string.close))
                    }
                },
                actions = {
                    TextButton(
                        onClick = {
                            scope.launch {
                                isSaving = true
                                try {
                                    val field = CustomFieldDefinition(
                                        id = existingField?.id ?: UUID.randomUUID().toString(),
                                        label = label.trim(),
                                        type = fieldType,
                                        required = isRequired,
                                        options = if (fieldType == CustomFieldType.SELECT) options else null,
                                        order = existingField?.order ?: 0,
                                    )
                                    onSave(field)
                                    onDismiss()
                                } catch (e: Exception) {
                                    errorMessage = e.message
                                } finally {
                                    isSaving = false
                                }
                            }
                        },
                        enabled = label.isNotBlank() && !isSaving,
                    ) {
                        Text(stringResource(R.string.save))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Label field
            OutlinedTextField(
                value = label,
                onValueChange = { label = it },
                label = { Text(stringResource(R.string.admin_field_label)) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            // Type selector
            ExposedDropdownMenuBox(/* field type selection */)

            // Options list (for select type)
            if (fieldType == CustomFieldType.SELECT) {
                Card {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            stringResource(R.string.admin_field_options),
                            style = MaterialTheme.typography.titleSmall,
                        )
                        options.forEachIndexed { index, option ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(option)
                                IconButton(onClick = {
                                    options = options.toMutableList().apply { removeAt(index) }
                                }) {
                                    Icon(Icons.Default.RemoveCircle, contentDescription = "Remove")
                                }
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = newOption,
                                onValueChange = { newOption = it },
                                label = { Text(stringResource(R.string.admin_field_new_option)) },
                                modifier = Modifier.weight(1f),
                                singleLine = true,
                            )
                            IconButton(
                                onClick = {
                                    if (newOption.isNotBlank()) {
                                        options = options + newOption.trim()
                                        newOption = ""
                                    }
                                },
                                enabled = newOption.isNotBlank(),
                            ) {
                                Icon(Icons.Default.AddCircle, contentDescription = "Add")
                            }
                        }
                    }
                }
            }

            // Required toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(R.string.admin_field_required))
                Switch(checked = isRequired, onCheckedChange = { isRequired = it })
            }

            // Error message
            errorMessage?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
```

### Phase 2: Report Category Management + Telephony Provider

#### Report Categories

Both platforms get a simple list editor for report categories:
- `GET /api/settings/report-categories`
- `POST /api/settings/report-categories`
- `DELETE /api/settings/report-categories/:id`

**iOS**: `ReportCategoriesView.swift` — List with swipe-to-delete and "+" toolbar button. TextField alert for new category name.

**Android**: `ReportCategoriesScreen.kt` — LazyColumn with AlertDialog for add/delete.

#### Telephony Provider Selection

Read-only view of current telephony provider with ability to switch and update credentials.

**iOS**: `TelephonySettingsView.swift` — Picker for provider type (Twilio, SignalWire, Vonage, Plivo, Asterisk) + credential fields (account SID, auth token, phone number). Save button calls `PUT /api/settings/telephony`.

**Android**: `TelephonySettingsScreen.kt` — ExposedDropdownMenuBox for provider + OutlinedTextField for credentials.

### Phase 3: Recording Playback

Audio player component for playing back call recordings stored in RustFS.

**iOS**: `RecordingPlayerView.swift` — Uses `AVAudioPlayer` with standard transport controls (play/pause, seek, time display). Fetches recording via `GET /api/files/:id` with auth header. Streams directly without downloading to disk.

```swift
struct RecordingPlayerView: View {
    let recordingId: String
    @State private var player: AVPlayer?
    @State private var isPlaying = false
    @State private var progress: Double = 0
    @State private var duration: Double = 0

    var body: some View {
        VStack(spacing: 12) {
            // Progress bar
            ProgressView(value: progress, total: max(duration, 1))
                .progressViewStyle(.linear)

            // Time display
            HStack {
                Text(formatTime(progress))
                    .font(.caption.monospacedDigit())
                Spacer()
                Text(formatTime(duration))
                    .font(.caption.monospacedDigit())
            }

            // Transport controls
            HStack(spacing: 24) {
                Button { seek(by: -15) } label: {
                    Image(systemName: "gobackward.15")
                        .font(.title2)
                }
                Button { togglePlayback() } label: {
                    Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.largeTitle)
                }
                .accessibilityIdentifier("recording-play-pause")
                Button { seek(by: 15) } label: {
                    Image(systemName: "goforward.15")
                        .font(.title2)
                }
            }
        }
        .padding()
        .task { await loadRecording() }
    }
}
```

**Android**: `RecordingPlayer.kt` — Uses `ExoPlayer` (part of AndroidX Media3). Composable with `PlayerView` or custom controls.

```kotlin
@Composable
fun RecordingPlayer(
    recordingId: String,
    apiService: ApiService = hiltViewModel<AdminViewModel>().apiService,
) {
    val context = LocalContext.current
    val player = remember {
        ExoPlayer.Builder(context).build()
    }

    DisposableEffect(Unit) {
        onDispose { player.release() }
    }

    LaunchedEffect(recordingId) {
        val url = apiService.getRecordingUrl(recordingId)
        val mediaItem = MediaItem.fromUri(url)
        player.setMediaItem(mediaItem)
        player.prepare()
    }

    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                this.player = player
                showController()
                controllerShowTimeoutMs = 0 // Always show controls
            }
        },
        modifier = Modifier
            .fillMaxWidth()
            .height(80.dp),
    )
}
```

### Phase 4: Remaining Settings

- **IVR Languages**: Toggle switches for each of the 13 supported languages. Simple form calling `PUT /api/settings/ivr-languages`.
- **Transcription**: Toggle global transcription + allow volunteer opt-out toggle. Calls `PUT /api/settings/transcription`.
- **Call Settings**: Ring timeout (slider, 15-60s), max call duration (slider, 5-120 min). Calls `PUT /api/settings/call`.
- **Rate Limiting / Spam**: Max calls per number per hour (stepper), CAPTCHA toggle, known-number bypass toggle. Calls `PUT /api/settings/spam`.

Each setting screen follows the same pattern: Form/List view, load current settings on appear, save on button tap, show success/error toast.

### Phase 5: i18n Strings

Add to `packages/i18n/locales/en.json`:

```json
{
  "admin": {
    "field": {
      "create": "New Field",
      "edit": "Edit Field",
      "label": "Label",
      "label_placeholder": "Field name",
      "type": "Type",
      "type_text": "Text",
      "type_number": "Number",
      "type_select": "Select",
      "type_checkbox": "Checkbox",
      "options": "Options",
      "new_option": "New option",
      "required": "Required",
      "delete_confirm": "Delete this custom field? Notes using it will keep their data."
    },
    "report": {
      "categories": "Report Categories",
      "category_add": "Add Category",
      "category_delete": "Delete Category"
    },
    "telephony": {
      "settings": "Telephony Provider",
      "provider": "Provider",
      "credentials": "Credentials"
    },
    "recording": {
      "play": "Play Recording",
      "pause": "Pause"
    },
    "ivr": {
      "languages": "IVR Languages"
    },
    "transcription": {
      "settings": "Transcription"
    },
    "call": {
      "settings": "Call Settings",
      "ring_timeout": "Ring Timeout",
      "max_duration": "Max Call Duration"
    },
    "spam": {
      "settings": "Spam Mitigation"
    }
  }
}
```

> **Note**: Codegen flattens nested keys with `_`, so `admin.field.create` becomes `admin_field_create` in iOS `.strings` and Android `R.string.admin_field_create`. Desktop uses the nested form via `t('admin.field.create')`.

Propagate to all 13 locales, then run `bun run i18n:codegen` and `bun run i18n:validate:all`.

### Navigation Integration

**iOS** (`AdminTabView.swift`): Add NavigationLinks for each new section under a "Settings" group in the admin list. Group order: Volunteers, Ban List, Audit, Invites, Custom Fields, Report Categories, Telephony, Call Settings, IVR, Transcription, Spam.

**Android** (`AdminScreen.kt`): Add new tabs or navigation items to the admin screen. Use a scrollable tab row or nested navigation for the settings sections.

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| **Phase 1: Custom Fields** | | |
| `apps/ios/Sources/Views/Admin/CustomFieldEditView.swift` | Rewrite | iOS custom field create/edit form (modify existing file) |
| `apps/ios/Sources/Views/Admin/CustomFieldsView.swift` | Rewrite | Add CRUD (create, edit, delete, reorder) to existing read-only view |
| `apps/ios/Sources/Services/APIService.swift` | Extend | Add createCustomField, updateCustomField, deleteCustomField methods |
| `apps/android/.../ui/admin/CustomFieldEditorScreen.kt` | Create | Android custom field create/edit screen |
| `apps/android/.../ui/admin/AdminSettingsTab.kt` | Extend | Add custom field management to admin settings |
| `apps/android/.../api/ApiService.kt` | Extend | Add custom field CRUD API methods |
| **Phase 2: Report Categories + Telephony** | | |
| `apps/ios/Sources/Views/Admin/ReportCategoriesView.swift` | Create | iOS report category list editor |
| `apps/ios/Sources/Views/Admin/TelephonySettingsView.swift` | Create | iOS telephony provider config |
| `apps/android/.../ui/admin/ReportCategoriesScreen.kt` | Create | Android report category editor |
| `apps/android/.../ui/admin/TelephonySettingsScreen.kt` | Create | Android telephony config |
| **Phase 3: Recording Playback** | | |
| `apps/ios/Sources/Views/Admin/RecordingPlayerView.swift` | Create | iOS audio player for recordings |
| `apps/android/.../ui/admin/RecordingPlayer.kt` | Create | Android ExoPlayer-based recording player |
| `apps/android/app/build.gradle.kts` | Extend | Add AndroidX Media3 dependency |
| **Phase 4: Remaining Settings** | | |
| `apps/ios/Sources/Views/Admin/IvrSettingsView.swift` | Create | iOS IVR language toggles |
| `apps/ios/Sources/Views/Admin/TranscriptionSettingsView.swift` | Create | iOS transcription toggle |
| `apps/ios/Sources/Views/Admin/CallSettingsView.swift` | Create | iOS call settings (ring timeout, max duration) |
| `apps/ios/Sources/Views/Admin/SpamSettingsView.swift` | Create | iOS spam mitigation settings |
| `apps/android/.../ui/admin/IvrSettingsScreen.kt` | Create | Android IVR settings |
| `apps/android/.../ui/admin/TranscriptionSettingsScreen.kt` | Create | Android transcription settings |
| `apps/android/.../ui/admin/CallSettingsScreen.kt` | Create | Android call settings |
| `apps/android/.../ui/admin/SpamSettingsScreen.kt` | Create | Android spam settings |
| **Navigation & i18n** | | |
| `apps/ios/Sources/Views/Admin/AdminTabView.swift` | Extend | Add navigation links for all new sections |
| `apps/android/.../ui/admin/AdminScreen.kt` | Extend | Add navigation for all new sections |
| `packages/i18n/locales/en.json` | Extend | Add admin settings strings |
| `packages/i18n/locales/*.json` | Extend | Propagate to all 13 locales |

## Testing

### Phase 1 Tests

1. **iOS XCUITest**: Navigate to Admin > Custom Fields. Create a text field with label "Test Field". Verify it appears in the list. Edit label to "Updated Field". Verify update persists. Delete the field. Verify it disappears.

2. **iOS XCUITest**: Create a select-type field. Add 3 options. Verify options render. Remove one option. Save. Reload view. Verify 2 options remain.

3. **Android UI Test**: Same flow as iOS — create, edit, delete custom field. Verify API calls via mock server or Hilt test module.

### Phase 2 Tests

4. **iOS XCUITest**: Navigate to Admin > Report Categories. Add "Domestic Violence" category. Verify it appears. Delete it. Verify removal.

5. **Android UI Test**: Navigate to Admin > Telephony. Change provider to SignalWire. Enter credentials. Save. Verify provider persists on reload.

### Phase 3 Tests

6. **iOS XCUITest**: Open a call record with a recording. Tap play. Verify audio player appears with play/pause button. Verify time display updates.

7. **Android UI Test**: Same flow. Verify ExoPlayer renders with controls.

### Phase 4 Tests

8. **iOS XCUITest**: Navigate to each settings screen (IVR, Transcription, Call Settings, Spam). Verify form loads with current values. Change a value, save, reload, verify persistence.

### i18n

9. Run `bun run i18n:validate:all` after all phases to verify string references match codegen output.

## Acceptance Criteria

- [ ] **Phase 1**: Custom field CRUD on both iOS and Android — create, edit, delete, reorder
- [ ] **Phase 2**: Report category add/delete on both platforms; telephony provider selection with credential input
- [ ] **Phase 3**: Audio recording playback on both platforms (AVAudioPlayer on iOS, ExoPlayer on Android)
- [ ] **Phase 4**: IVR languages, transcription, call settings, and spam settings configurable on both platforms
- [ ] All settings persist across app restarts (API-backed, not local)
- [ ] Admin-only access enforced (views hidden for non-admins)
- [ ] Role creation/editing explicitly deferred (desktop-only, documented as acceptable)
- [ ] Encrypted export explicitly deferred (desktop-only)
- [ ] All new strings internationalized across 13 locales
- [ ] XCUITests for iOS custom field CRUD
- [ ] Android UI tests for custom field CRUD

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| API changes needed for mobile-friendly payloads | Low | Low | APIs are already RESTful and return JSON; mobile clients use the same endpoints as desktop |
| ExoPlayer dependency increases Android APK size | Low | Low | Media3 ExoPlayer is ~1.5 MB; acceptable for an admin feature |
| Custom field reorder UX differs between iOS and Android | Medium | Low | iOS uses native List drag-to-reorder; Android uses manual move buttons; both call the same reorder API |
| Telephony credential entry on mobile is error-prone | Medium | Medium | Use paste-from-clipboard for long API keys; show/hide toggle for sensitive fields; validate format before saving |
| Too many admin sections overwhelm mobile navigation | Medium | Medium | Group settings under a collapsible "Settings" section in admin tab; most operators will only use Custom Fields regularly |
| Recording streaming fails on slow connections | Low | Medium | iOS AVPlayer and Android ExoPlayer both handle buffering natively; show loading indicator; allow download for offline playback |
