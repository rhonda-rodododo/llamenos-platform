# Epic 291: Client-Side Transcription on Mobile

**Status**: PENDING
**Priority**: Medium
**Depends on**: None
**Blocks**: None
**Branch**: `desktop`

## Summary

Implement on-device speech-to-text transcription for iOS (Apple Speech framework) and Android (SpeechRecognizer on-device mode). Audio never leaves the device on any platform. Transcription text is encrypted and attached to call notes via the existing `NotePayload` structure. The desktop implementation (Whisper ONNX via `@huggingface/transformers`, AudioWorklet, Web Worker in `src/client/lib/transcription/`) serves as the reference for the user experience.

## Problem Statement

Desktop volunteers have access to real-time transcription during calls — a powerful tool for accurately documenting crisis conversations. Mobile volunteers (iOS and Android) have no transcription capability at all. This creates a feature gap that disadvantages volunteers using mobile clients, which are often the only option for field workers or volunteers without desktop access.

The desktop implementation captures the local microphone via AudioWorklet, processes audio in a Web Worker using Whisper ONNX, and produces text segments that are concatenated into a transcript. Audio never leaves the browser. Mobile needs equivalent functionality using platform-native speech APIs that also keep audio on-device.

## Implementation

### 1. iOS: Apple Speech Framework

iOS 17+ provides `SFSpeechRecognizer` with on-device recognition (no network required for supported languages). The recognizer processes audio buffers from `AVAudioEngine` and streams partial/final results.

**File: `apps/ios/Sources/Services/TranscriptionService.swift`**:

```swift
import Speech
import AVFoundation

enum TranscriptionStatus: String, Sendable {
    case idle
    case loading
    case ready
    case capturing
    case finalizing
    case done
    case error
}

@Observable
final class TranscriptionService: @unchecked Sendable {
    private(set) var status: TranscriptionStatus = .idle
    private(set) var currentTranscript: String = ""
    private(set) var isAvailable: Bool = false
    private(set) var supportedLanguages: [Locale] = []

    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var audioEngine: AVAudioEngine?

    /// Selected language for transcription (user preference)
    var language: Locale = Locale(identifier: "en-US")

    init() {
        checkAvailability()
    }

    private func checkAvailability() {
        let recognizer = SFSpeechRecognizer(locale: language)
        isAvailable = recognizer?.isAvailable ?? false
        // On-device recognition availability (iOS 17+)
        if #available(iOS 17, *) {
            isAvailable = recognizer?.supportsOnDeviceRecognition ?? false
        }
        supportedLanguages = SFSpeechRecognizer.supportedLocales()
            .sorted { $0.identifier < $1.identifier }
    }

    /// Request Speech and Microphone permissions
    func requestPermissions() async -> Bool {
        let speechStatus = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }

        guard speechStatus else { return false }

        let micStatus = await AVAudioApplication.requestRecordPermission()
        return micStatus
    }

    /// Start live transcription from microphone
    func start() throws {
        guard isAvailable else {
            status = .error
            throw TranscriptionError.notAvailable
        }

        // Configure speech recognizer for on-device only
        speechRecognizer = SFSpeechRecognizer(locale: language)
        guard let speechRecognizer, speechRecognizer.isAvailable else {
            status = .error
            throw TranscriptionError.notAvailable
        }

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest else {
            status = .error
            throw TranscriptionError.requestCreationFailed
        }

        // Force on-device processing — audio never leaves device
        recognitionRequest.requiresOnDeviceRecognition = true
        recognitionRequest.shouldReportPartialResults = true
        recognitionRequest.addsPunctuation = true

        // Set up audio engine
        audioEngine = AVAudioEngine()
        guard let audioEngine else { return }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) {
            [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        // Start recognition task
        status = .capturing
        currentTranscript = ""

        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) {
            [weak self] result, error in
            guard let self else { return }

            if let result {
                self.currentTranscript = result.bestTranscription.formattedString
                if result.isFinal {
                    self.status = .done
                }
            }

            if let error {
                // Timeout errors are expected when user pauses speaking
                if (error as NSError).code != 216 { // kAFAssistantErrorDomain timeout
                    self.status = .error
                }
            }
        }

        audioEngine.prepare()
        try audioEngine.start()
    }

    /// Stop transcription and return final text
    func stop() -> String {
        status = .finalizing

        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()

        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        audioEngine = nil

        status = .done
        return currentTranscript
    }

    enum TranscriptionError: Error, LocalizedError {
        case notAvailable
        case requestCreationFailed
        case permissionDenied

        var errorDescription: String? {
            switch self {
            case .notAvailable:
                return NSLocalizedString("transcription_not_available", comment: "")
            case .requestCreationFailed:
                return NSLocalizedString("transcription_request_failed", comment: "")
            case .permissionDenied:
                return NSLocalizedString("transcription_permission_denied", comment: "")
            }
        }
    }
}
```

**File: `apps/ios/Sources/Views/Components/TranscriptionOverlay.swift`**:

```swift
struct TranscriptionOverlay: View {
    @Bindable var transcriptionService: TranscriptionService
    let onSave: (String) -> Void

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Circle()
                    .fill(statusColor)
                    .frame(width: 8, height: 8)
                Text(transcriptionService.status.rawValue)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button(action: toggleTranscription) {
                    Image(systemName: transcriptionService.status == .capturing
                          ? "stop.circle.fill" : "mic.circle.fill")
                        .font(.title2)
                }
            }

            if !transcriptionService.currentTranscript.isEmpty {
                ScrollView {
                    Text(transcriptionService.currentTranscript)
                        .font(.body)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 200)

                Button("Attach to Note") {
                    onSave(transcriptionService.currentTranscript)
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var statusColor: Color {
        switch transcriptionService.status {
        case .capturing: .red
        case .done: .green
        case .error: .orange
        default: .gray
        }
    }

    private func toggleTranscription() {
        if transcriptionService.status == .capturing {
            let text = transcriptionService.stop()
            if !text.isEmpty { onSave(text) }
        } else {
            try? transcriptionService.start()
        }
    }
}
```

**File: `apps/ios/Sources/Views/Notes/NoteCreateView.swift`** — Wire transcription into note creation:

```swift
// Add transcription toggle and overlay to the note editor
// When transcription completes, append text to note body
```

### 2. Android: SpeechRecognizer On-Device

Android 13+ supports on-device speech recognition via `SpeechRecognizer.createOnDeviceSpeechRecognizer()`. For older Android versions, a toggle can enable the backend Whisper service (if the operator has it deployed).

**File: `apps/android/app/src/main/java/org/llamenos/hotline/service/TranscriptionService.kt`**:

```kotlin
@Singleton
class TranscriptionService @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    sealed class Status {
        data object Idle : Status()
        data object Loading : Status()
        data object Ready : Status()
        data object Capturing : Status()
        data object Finalizing : Status()
        data class Done(val transcript: String) : Status()
        data class Error(val message: String) : Status()
    }

    private val _status = MutableStateFlow<Status>(Status.Idle)
    val status: StateFlow<Status> = _status.asStateFlow()

    private val _transcript = MutableStateFlow("")
    val transcript: StateFlow<String> = _transcript.asStateFlow()

    private var speechRecognizer: SpeechRecognizer? = null
    private var isListening = false

    /** Whether on-device recognition is available (Android 13+) */
    val isAvailable: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

    var language: String = "en-US"

    fun start() {
        if (!isAvailable) {
            _status.value = Status.Error("On-device speech recognition not available")
            return
        }

        _status.value = Status.Loading
        _transcript.value = ""

        speechRecognizer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        } else {
            SpeechRecognizer.createSpeechRecognizer(context)
        }

        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                _status.value = Status.Capturing
                isListening = true
            }

            override fun onBeginningOfSpeech() {}

            override fun onRmsChanged(rmsdB: Float) {}

            override fun onBufferReceived(buffer: ByteArray?) {}

            override fun onEndOfSpeech() {
                _status.value = Status.Finalizing
            }

            override fun onError(error: Int) {
                val message = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected"
                    SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                    SpeechRecognizer.ERROR_NETWORK -> "Network error"
                    else -> "Recognition error: $error"
                }
                // ERROR_NO_MATCH after silence is normal — restart if still listening
                if (error == SpeechRecognizer.ERROR_NO_MATCH && isListening) {
                    restartListening()
                    return
                }
                _status.value = Status.Error(message)
            }

            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val bestMatch = matches?.firstOrNull() ?: ""
                if (bestMatch.isNotEmpty()) {
                    val current = _transcript.value
                    _transcript.value = if (current.isEmpty()) bestMatch
                                        else "$current $bestMatch"
                }
                // Continue listening for more speech
                if (isListening) {
                    restartListening()
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val matches = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                // Partial results shown as preview but not committed to transcript
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        startListening()
    }

    private fun startListening() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                     RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            // Force on-device (Android 13+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                putExtra(RecognizerIntent.EXTRA_ENABLE_LANGUAGE_SWITCH, false)
            }
        }
        speechRecognizer?.startListening(intent)
    }

    private fun restartListening() {
        speechRecognizer?.cancel()
        startListening()
    }

    fun stop(): String {
        isListening = false
        speechRecognizer?.stopListening()
        speechRecognizer?.destroy()
        speechRecognizer = null

        val finalTranscript = _transcript.value
        _status.value = Status.Done(finalTranscript)
        return finalTranscript
    }

    fun destroy() {
        isListening = false
        speechRecognizer?.destroy()
        speechRecognizer = null
        _status.value = Status.Idle
    }
}
```

**File: `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/TranscriptionOverlay.kt`**:

```kotlin
@Composable
fun TranscriptionOverlay(
    transcriptionService: TranscriptionService,
    onSave: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val status by transcriptionService.status.collectAsStateWithLifecycle()
    val transcript by transcriptionService.transcript.collectAsStateWithLifecycle()

    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusDot(status)
                Spacer(Modifier.width(8.dp))
                Text(
                    text = statusLabel(status),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.weight(1f))
                IconButton(onClick = {
                    if (status is TranscriptionService.Status.Capturing) {
                        val text = transcriptionService.stop()
                        if (text.isNotEmpty()) onSave(text)
                    } else {
                        transcriptionService.start()
                    }
                }) {
                    Icon(
                        imageVector = if (status is TranscriptionService.Status.Capturing)
                            Icons.Default.StopCircle else Icons.Default.Mic,
                        contentDescription = stringResource(R.string.transcription_toggle),
                    )
                }
            }

            if (transcript.isNotEmpty()) {
                Text(
                    text = transcript,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier
                        .heightIn(max = 200.dp)
                        .verticalScroll(rememberScrollState()),
                )
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = { onSave(transcript) }) {
                    Text(stringResource(R.string.transcription_attach_to_note))
                }
            }
        }
    }
}
```

**File: `apps/android/app/src/main/AndroidManifest.xml`** — Add permission:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

### 3. Transcription Settings

Both platforms need per-volunteer transcription settings (toggle, language selection) that sync with the server settings.

**File: `apps/ios/Sources/Views/Settings/TranscriptionSettingsView.swift`**:

```swift
struct TranscriptionSettingsView: View {
    @Bindable var transcriptionService: TranscriptionService
    @AppStorage("transcription_enabled") var isEnabled = false
    @AppStorage("transcription_language") var languageCode = "en-US"
    @AppStorage("transcription_auto_attach") var autoAttach = false

    var body: some View {
        Form {
            Section {
                Toggle("transcription_enabled", isOn: $isEnabled)
                if !transcriptionService.isAvailable {
                    Text("transcription_not_available_device")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if isEnabled {
                Section("transcription_language_section") {
                    Picker("transcription_language", selection: $languageCode) {
                        ForEach(transcriptionService.supportedLanguages, id: \.identifier) { locale in
                            Text(locale.localizedString(forIdentifier: locale.identifier) ?? locale.identifier)
                                .tag(locale.identifier)
                        }
                    }
                }

                Section {
                    Toggle("transcription_auto_attach", isOn: $autoAttach)
                } footer: {
                    Text("transcription_auto_attach_description")
                }
            }
        }
        .navigationTitle("transcription_settings_title")
    }
}
```

**File: `apps/android/app/src/main/java/org/llamenos/hotline/ui/settings/TranscriptionSettingsScreen.kt`**:

```kotlin
@Composable
fun TranscriptionSettingsScreen(
    transcriptionService: TranscriptionService,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val isEnabled by viewModel.transcriptionEnabled.collectAsStateWithLifecycle()
    val language by viewModel.transcriptionLanguage.collectAsStateWithLifecycle()
    val autoAttach by viewModel.transcriptionAutoAttach.collectAsStateWithLifecycle()

    Column(modifier = Modifier.padding(16.dp)) {
        SwitchPreference(
            title = stringResource(R.string.transcription_enabled),
            checked = isEnabled,
            onCheckedChange = { viewModel.setTranscriptionEnabled(it) },
        )

        if (!transcriptionService.isAvailable) {
            Text(
                text = stringResource(R.string.transcription_not_available_device),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }

        if (isEnabled) {
            // Language picker
            // Auto-attach toggle
        }
    }
}
```

### 4. Note Payload Integration

The `NotePayload` type in `packages/shared/types.ts` does not currently have a `transcription` field. Add it, then regenerate protocol types.

**File: `packages/shared/types.ts`**:

```typescript
export interface NotePayload {
  text: string
  fields?: Record<string, string | number | boolean>
  transcription?: string  // Client-side speech-to-text transcript
}
```

**File: `packages/protocol/schemas/notes.json`** — Add `transcription` to the JSON Schema:

```json
{
  "transcription": {
    "type": "string",
    "description": "Client-side speech-to-text transcript, encrypted alongside the note"
  }
}
```

Run `bun run codegen` to regenerate Swift/Kotlin types.

### 5. Encryption

Transcription text is encrypted as part of the note payload — it goes through the same ECIES envelope encryption as the note body. No separate encryption path is needed. The `transcription` field is included in the `NotePayload` JSON before encryption.

### 6. i18n Strings

Add to `packages/i18n/locales/en.json`:

```json
{
  "transcription": {
    "toggle": "Toggle transcription",
    "attach_to_note": "Attach to Note",
    "enabled": "Enable Transcription",
    "not_available_device": "On-device speech recognition is not available on this device",
    "language_section": "Language",
    "language": "Transcription Language",
    "auto_attach": "Auto-attach to Notes",
    "auto_attach_description": "Automatically append transcript to call notes when transcription ends",
    "settings_title": "Transcription",
    "not_available": "Speech recognition is not available",
    "request_failed": "Failed to create transcription request",
    "permission_denied": "Microphone or speech recognition permission denied"
  }
}
```

Run `bun run i18n:codegen` after adding strings.

## Files to Modify

| File | Change |
|------|--------|
| `apps/ios/Sources/Services/TranscriptionService.swift` | **New** — iOS speech-to-text service |
| `apps/ios/Sources/Views/Components/TranscriptionOverlay.swift` | **New** — Transcription UI overlay |
| `apps/ios/Sources/Views/Settings/TranscriptionSettingsView.swift` | **New** — Transcription settings |
| `apps/ios/Sources/Views/Notes/NoteCreateView.swift` | Wire transcription into note creation flow |
| `apps/android/app/src/main/java/org/llamenos/hotline/service/TranscriptionService.kt` | **New** — Android speech-to-text service |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/components/TranscriptionOverlay.kt` | **New** — Transcription UI overlay |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/settings/TranscriptionSettingsScreen.kt` | **New** — Transcription settings |
| `apps/android/app/src/main/java/org/llamenos/hotline/di/AppModule.kt` | Provide `TranscriptionService` singleton |
| `apps/android/app/src/main/AndroidManifest.xml` | Add `RECORD_AUDIO` permission |
| `packages/shared/types.ts` | Add `transcription` field to `NotePayload` |
| `packages/protocol/schemas/notes.json` | Add `transcription` to note schema |
| `packages/i18n/locales/en.json` | Add `transcription.*` strings |
| `packages/i18n/locales/*.json` | Propagate to all locales |

## Testing

### iOS (XCTest)

- **Unit test**: `TranscriptionServiceTests` — verify `isAvailable` returns correct value on simulator (may be false on CI simulators without speech model).
- **Unit test**: Verify `start()` throws `notAvailable` when recognizer is nil.
- **Unit test**: Verify `stop()` returns accumulated transcript text.
- **XCUITest**: If speech recognition is available on the CI simulator, test the full flow: start transcription, verify status indicator changes, stop, verify transcript appears.

### Android (Unit + UI)

- **Unit test**: `TranscriptionServiceTest` — mock `SpeechRecognizer` availability, verify status flow.
- **Unit test**: Verify `stop()` returns accumulated results.
- **UI test**: `TranscriptionOverlayTest` — inject mock status flow, verify composable renders correctly for each status.
- **Integration test (emulator)**: If speech recognition is available, test start/stop cycle.

### Cross-Platform

- **Protocol codegen**: `bun run codegen:check` — verify `transcription` field appears in generated Swift and Kotlin types.
- **Note roundtrip**: Create a note with `transcription` field on mobile, decrypt on desktop — verify text is preserved.

## Acceptance Criteria

- [ ] iOS transcription uses `SFSpeechRecognizer` with `requiresOnDeviceRecognition = true`
- [ ] Android transcription uses `SpeechRecognizer.createOnDeviceSpeechRecognizer()` on Android 13+
- [ ] Audio never leaves the device on either platform
- [ ] Transcription status indicator visible during capture (idle/capturing/done/error states)
- [ ] Transcript text can be attached to call notes
- [ ] `NotePayload.transcription` field added to shared types and protocol schema
- [ ] Protocol codegen generates `transcription` field in Swift and Kotlin types
- [ ] Transcription settings: enable/disable toggle, language picker, auto-attach toggle
- [ ] i18n strings added for transcription UI in all 13 locales
- [ ] Permissions requested at runtime (microphone + speech recognition)
- [ ] Graceful degradation: transcription toggle disabled with explanation on unsupported devices
- [ ] All platform tests pass

## Risk Assessment

- **Simulator limitations**: iOS simulators and Android emulators may not have on-device speech models installed. Tests that require actual speech recognition should be gated behind availability checks.
- **Language coverage**: Apple Speech supports 60+ languages but on-device models are only available for a subset. Android on-device coverage is narrower. Display unsupported language clearly in the picker.
- **Battery impact**: Continuous speech recognition is CPU-intensive. On mobile, this drains battery faster. Document this in the transcription settings description.
- **Audio quality**: Phone calls via Twilio provide audio through the earpiece/speaker, but `SFSpeechRecognizer` captures from the microphone. Only the volunteer's side of the conversation is transcribed (same as desktop). This is a feature, not a bug — caller audio should not be transcribed without consent considerations.
- **Privacy**: Transcription text is encrypted as part of the note payload (ECIES envelope). Server never sees plaintext. This matches the desktop behavior.
