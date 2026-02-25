# Epic 78: Client-Side Transcription (WebAssembly Whisper)

## Problem Statement

Currently, call transcription works as follows:

1. Audio is captured in the volunteer's browser during a call
2. After the call ends, audio is sent to Cloudflare Workers AI for transcription
3. The transcription text is then E2EE encrypted and stored

**Privacy gap:** During the ~30 second transcription window, audio is accessible to Cloudflare's AI service. This is a trust dependency we can eliminate.

**Goal:** Run Whisper entirely in the browser via WebAssembly so audio never leaves the volunteer's device.

## Benefits

- **Zero server audio access**: Audio processed locally, only encrypted text uploaded
- **No third-party dependency**: No Cloudflare AI, no OpenAI, no external services
- **Offline capability**: Transcription works without network connectivity
- **Reduced latency**: No network round-trip for transcription
- **Cost reduction**: No per-minute transcription API charges

## Technical Approach

### WebAssembly Whisper Options

Several projects provide Whisper compiled to WebAssembly:

| Project | Size | Performance (single-threaded) | Notes |
| ------- | ---- | ----------- | ----- |
| whisper.cpp (via Emscripten) | ~40MB (tiny model) | ~2-3x realtime | Most mature |
| whisper-web | ~40MB | ~2-3x realtime | whisper.cpp wrapper |
| transformers.js | ~150MB (small model) | ~5x realtime | Hugging Face, ONNX runtime |

**Recommendation:** Use `whisper.cpp` compiled to WASM via Emscripten. It's the most performant and well-tested option.

### Why No Threading (COEP Conflict)

Threaded WASM (compiled with `-s USE_PTHREADS=1`) requires `SharedArrayBuffer`, which requires `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` headers on the page.

**The problem:** The Twilio Voice SDK loads cross-origin scripts that do NOT serve `Cross-Origin-Resource-Policy` headers. Setting COEP to `require-corp` breaks the Twilio SDK entirely — calls stop working.

**The solution:** Compile whisper.cpp WITHOUT pthreads:
```bash
emcc whisper.cpp -o whisper.js \
  -s WASM=1 \
  -s USE_PTHREADS=0 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS='["_whisper_init","_whisper_full","_whisper_free"]' \
  -O3
```

**Trade-off:** Single-threaded WASM runs at ~2-3x realtime instead of ~10x for the tiny model. A 5-minute call takes ~2.5 minutes to transcribe instead of ~30 seconds. This is acceptable because:
- The Web Worker already isolates transcription off the main thread (no UI freezing)
- Transcription happens after call ends — volunteer can continue other work
- The alternative (breaking Twilio calls) is unacceptable

### Model Selection

Whisper models vary in size and accuracy. Performance estimates are for **single-threaded WASM**:

| Model | Size | Languages | Accuracy | Transcription Speed (single-threaded) |
| ----- | ---- | --------- | -------- | ------------------------------------- |
| tiny | 39MB | All | Good | ~2-3x realtime |
| base | 74MB | All | Better | ~4-5x realtime |
| small | 244MB | All | Great | ~8-10x realtime |

**Recommendation:** Offer `tiny` as default (best speed/size ratio), `base` as quality option. `small` is impractical for single-threaded WASM (a 5-minute call would take ~40-50 minutes to transcribe).

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Volunteer's Browser                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    Audio    ┌──────────────────────────┐  │
│  │  Microphone   │───────────►│  AudioWorklet Processor  │  │
│  │  (local only) │            │  (capture & ring buffer)  │  │
│  └──────────────┘             └───────────┬──────────────┘  │
│                                           │                   │
│                               30s chunks  │ (via postMessage) │
│                                           ▼                   │
│                               ┌──────────────────────────┐   │
│                               │  Web Worker              │   │
│                               │  ┌────────────────────┐  │   │
│                               │  │  Whisper WASM      │  │   │
│                               │  │  (single-threaded) │  │   │
│                               │  │  NO pthreads       │  │   │
│                               │  └────────┬───────────┘  │   │
│                               │           │              │   │
│                               │  Transcript segments     │   │
│                               └───────────┬──────────────┘   │
│                                           │                   │
│                                           ▼                   │
│                               ┌──────────────────────────┐   │
│                               │  Segment concatenation   │   │
│                               │  + E2EE Encryption       │   │
│                               │  (XChaCha20-Poly1305)    │   │
│                               └───────────┬──────────────┘   │
│                                           │                   │
└───────────────────────────────────────────┼───────────────────┘
                                            │
                                            ▼
                               ┌──────────────────────────┐
                               │  Server                  │
                               │  (receives ciphertext    │
                               │   only, no audio)        │
                               └──────────────────────────┘
```

### Audio Capture Reality

**Critical constraint:** The Twilio Voice SDK does NOT expose the remote party's audio as a `MediaStream`. There is no `getRemoteAudioTrack()` or equivalent API. You cannot tap into the remote party's audio via `createMediaStreamSource()`.

**Options:**

- **Option A (Recommended for MVP): Local microphone only.** Capture only the volunteer's speech via `navigator.mediaDevices.getUserMedia()`. This provides a partial transcript (volunteer side only) but is straightforward to implement. Useful for note augmentation even if incomplete.

- **Option B (Better but significant undertaking): Custom Twilio signaling.** Replace the Twilio Voice SDK with raw WebRTC using Twilio's SIP/SRTP infrastructure directly. This gives access to `RTCRtpReceiver` and remote `MediaStream` but requires rewriting the entire call handling layer. This is essentially a separate epic.

- **Option C (Investigate first): Internal SDK access.** Check if `@twilio/voice-sdk` v2.x exposes the internal `RTCPeerConnection` via undocumented properties. If accessible, we can extract the remote audio track. This is fragile and may break on SDK updates.

**Decision for this epic: Option A.** Capture local microphone audio only. Document the limitation clearly in the UI ("Transcribes your speech only"). Option B can be evaluated as a follow-up epic if full transcription is needed.

### Memory Budget

Audio at 16kHz mono (Whisper's native rate):
- 1 second = 32KB (16,000 samples x 2 bytes)
- 1 minute = ~1.9MB
- 10 minutes = ~19MB
- 30 minutes = ~58MB
- Plus WASM module (~50MB) + model (~39MB tiny) = ~89MB baseline

**Problem:** A 30-minute call with full buffering needs ~147MB total. Mobile browsers may kill the tab at this memory level.

**Solution: Chunked transcription with ring buffer.**

### Chunked Transcription Approach

Instead of buffering the entire call and transcribing at the end:

1. AudioWorklet maintains a fixed-size ring buffer (last 60 seconds of audio, ~3.6MB)
2. Every 30 seconds, flush the buffer and send to the Web Worker for transcription
3. Use 5-second overlap between chunks to avoid cutting words at boundaries
4. Web Worker transcribes each chunk incrementally via `requestIdleCallback`
5. Concatenate transcript segments in order, deduplicating overlap regions
6. On call end, transcribe the final partial chunk

**Memory ceiling:** ~89MB baseline + ~3.6MB ring buffer + ~3.6MB in-flight chunk = **~96MB peak** regardless of call duration.

```typescript
// Ring buffer in AudioWorklet
const RING_BUFFER_SECONDS = 60;
const RING_BUFFER_SIZE = 16000 * RING_BUFFER_SECONDS; // 960,000 samples
const ringBuffer = new Float32Array(RING_BUFFER_SIZE);
let writeIndex = 0;

// Flush every 30 seconds
const CHUNK_INTERVAL_SECONDS = 30;
const OVERLAP_SECONDS = 5;
```

### Implementation Components

#### 1. WASM Module Loader with Integrity Verification

```typescript
// src/client/lib/transcription/whisper-loader.ts

export type WhisperModel = 'tiny' | 'base';

const MODEL_URLS: Record<WhisperModel, string> = {
  tiny: '/models/whisper-tiny.bin',
  base: '/models/whisper-base.bin',
};

// Expected SHA-256 hashes baked into source at build time
// These are covered by the reproducible build chain (Epic 79)
const EXPECTED_MODEL_HASHES: Record<WhisperModel, string> = {
  tiny: '', // Populated during WASM build pipeline setup
  base: '', // Populated during WASM build pipeline setup
};

export async function loadAndVerifyModel(model: WhisperModel): Promise<Uint8Array> {
  // Check IndexedDB cache first
  const cached = await modelCache.get(model);
  if (cached) {
    // Verify cached model integrity
    if (await verifyHash(cached, EXPECTED_MODEL_HASHES[model])) {
      return cached;
    }
    // Cache corrupted — re-download
    await modelCache.delete(model);
  }

  const modelResponse = await fetch(MODEL_URLS[model]);
  if (!modelResponse.ok) {
    throw new Error(`Failed to fetch model: ${modelResponse.status}`);
  }

  const modelData = new Uint8Array(await modelResponse.arrayBuffer());

  // Verify integrity — SRI does not apply to fetch() calls
  if (!await verifyHash(modelData, EXPECTED_MODEL_HASHES[model])) {
    throw new Error(`Model integrity check failed for ${model}`);
  }

  // Cache verified model
  await modelCache.set(model, modelData);
  return modelData;
}

async function verifyHash(data: Uint8Array, expectedHex: string): Promise<boolean> {
  if (!expectedHex) return true; // Skip during development
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === expectedHex;
}
```

#### 2. Audio Capture Worklet

**Important:** AudioWorklet modules must be plain JavaScript — `.ts` files cannot be loaded directly. The worklet must be compiled to standalone JS via a Vite build step or maintained as a `.js` file.

```javascript
// src/client/lib/transcription/audio-capture-worklet.js
// This runs in AudioWorkletGlobalScope — must be plain JS

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ringBuffer = new Float32Array(16000 * 60); // 60 seconds at 16kHz
    this.writeIndex = 0;
    this.chunkSamples = 16000 * 30; // 30-second chunks
    this.overlapSamples = 16000 * 5; // 5-second overlap
    this.samplesSinceLastFlush = 0;

    this.port.onmessage = (event) => {
      if (event.data.type === 'flush') {
        this.flushBuffer();
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        this.ringBuffer[this.writeIndex % this.ringBuffer.length] = channelData[i];
        this.writeIndex++;
        this.samplesSinceLastFlush++;
      }

      // Auto-flush every 30 seconds
      if (this.samplesSinceLastFlush >= this.chunkSamples) {
        this.flushBuffer();
      }
    }
    return true;
  }

  flushBuffer() {
    const chunkSize = Math.min(this.samplesSinceLastFlush + this.overlapSamples, this.writeIndex);
    const startIndex = Math.max(0, this.writeIndex - chunkSize);
    const chunk = new Float32Array(chunkSize);

    for (let i = 0; i < chunkSize; i++) {
      chunk[i] = this.ringBuffer[(startIndex + i) % this.ringBuffer.length];
    }

    this.port.postMessage({ type: 'audio_chunk', data: chunk }, [chunk.buffer]);
    this.samplesSinceLastFlush = 0;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
```

#### 3. Transcription Worker

```typescript
// src/client/lib/transcription/transcription-worker.ts
// This runs in a dedicated Web Worker

let whisper: WhisperModule | null = null;

self.onmessage = async (event: MessageEvent) => {
  const { type, data } = event.data;

  switch (type) {
    case 'init': {
      // Load single-threaded WASM module (no SharedArrayBuffer required)
      const wasmModule = await import('./whisper.js');
      whisper = await wasmModule.default();

      // Load verified model from transferred ArrayBuffer
      whisper.loadModel(new Uint8Array(data.modelData));

      self.postMessage({ type: 'ready' });
      break;
    }

    case 'transcribe_chunk': {
      if (!whisper) {
        self.postMessage({ type: 'error', error: 'Whisper not initialized' });
        return;
      }

      const audio = new Float32Array(data.audio);
      const language = data.language || 'auto';
      const chunkIndex = data.chunkIndex;

      try {
        const result = whisper.transcribe(audio, {
          language,
          task: 'transcribe',
        });

        self.postMessage({
          type: 'chunk_result',
          chunkIndex,
          text: result.text,
          segments: result.segments,
        });
      } catch (error) {
        self.postMessage({
          type: 'error',
          chunkIndex,
          error: error instanceof Error ? error.message : 'Transcription failed',
        });
      }
      break;
    }
  }
};
```

#### 4. Transcription Manager

```typescript
// src/client/lib/transcription/transcription-manager.ts

export class TranscriptionManager {
  private worker: Worker | null = null;
  private audioContext: AudioContext | null = null;
  private captureNode: AudioWorkletNode | null = null;
  private isInitialized = false;
  private transcriptSegments: Map<number, string> = new Map();
  private chunkIndex = 0;

  async initialize(model: WhisperModel = 'tiny'): Promise<void> {
    // Create worker
    this.worker = new Worker(
      new URL('./transcription-worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Fetch and verify model
    const modelData = await loadAndVerifyModel(model);

    // Initialize worker with model
    return new Promise((resolve, reject) => {
      this.worker!.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;
          resolve();
        } else if (event.data.type === 'error') {
          reject(new Error(event.data.error));
        } else if (event.data.type === 'chunk_result') {
          // Store transcript segment
          this.transcriptSegments.set(event.data.chunkIndex, event.data.text);
        }
      };

      this.worker!.postMessage(
        { type: 'init', data: { modelData: modelData.buffer } },
        [modelData.buffer]
      );
    });
  }

  async startCapture(): Promise<void> {
    // Capture LOCAL microphone only — remote audio not accessible via Twilio SDK
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true }
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });

    // Load AudioWorklet — must be compiled JS, not .ts
    await this.audioContext.audioWorklet.addModule('/worklets/audio-capture-worklet.js');

    this.captureNode = new AudioWorkletNode(
      this.audioContext,
      'audio-capture-processor'
    );

    // Handle audio chunks from worklet
    this.captureNode.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'audio_chunk') {
        const currentChunk = this.chunkIndex++;
        this.worker?.postMessage(
          {
            type: 'transcribe_chunk',
            data: { audio: event.data.data, chunkIndex: currentChunk },
          },
          [event.data.data.buffer]
        );
      }
    };

    const source = this.audioContext.createMediaStreamSource(localStream);
    source.connect(this.captureNode);
  }

  async finalize(): Promise<string> {
    // Flush remaining audio
    this.captureNode?.port.postMessage({ type: 'flush' });

    // Wait for all pending transcriptions to complete
    // (implementation: track pending chunks, resolve when all done)

    // Concatenate segments in order
    const sortedSegments = Array.from(this.transcriptSegments.entries())
      .sort(([a], [b]) => a - b)
      .map(([, text]) => text.trim())
      .filter(Boolean);

    return sortedSegments.join(' ');
  }

  async stop(): Promise<void> {
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.captureNode = null;
    this.transcriptSegments.clear();
    this.chunkIndex = 0;
  }
}
```

### Web Worker Security: Network Restriction

A compromised WASM module running in the Web Worker could potentially exfiltrate captured audio data via `fetch()` or `XMLHttpRequest`.

**Mitigations:**
1. Set `Content-Security-Policy: connect-src 'self'` specifically for the transcription worker context
2. Or create the worker from a Blob URL with restricted scope that blocks network access
3. Model integrity verification (hash check) prevents loading tampered WASM
4. CSP on the main page restricts what domains can be contacted, limiting exfiltration targets

## Implementation Phases

### Phase 1: WASM Build Pipeline (1 week)

**Tasks:**

1. Set up whisper.cpp build with Emscripten (single-threaded, NO `-s USE_PTHREADS`)
2. Configure WASM output with SIMD support only (no threading)
3. Create JavaScript bindings for transcription API
4. Build tiny and base model variants (drop `small` — impractical for single-threaded WASM)
5. Set up model hosting (same-origin with IndexedDB caching)
6. Generate SHA-256 hashes for model files, embed in source

**Deliverables:**

- `whisper.wasm` and `whisper.js` in `/public/wasm/` (single-threaded build)
- Model files in `/public/models/` with corresponding hash constants
- Build script for regenerating WASM
- Documentation: "Why No Threading" rationale

### Phase 2: Audio Capture Infrastructure (0.5 weeks)

**Tasks:**

1. Implement AudioWorklet processor with ring buffer (compiled to standalone `.js`)
2. Handle sample rate conversion (to 16kHz for Whisper)
3. Test with local microphone MediaStream (NOT remote audio — see audio capture section)
4. Handle mono conversion
5. Verify AudioWorklet `.js` file loads correctly in Vite dev and production builds

**Deliverables:**

- AudioWorklet module (plain JS, not TS)
- Integration with local microphone capture
- Build step verified for worklet file

### Phase 3: Transcription Worker (1 week)

**Tasks:**

1. Implement Web Worker for chunked transcription (30-second windows with overlap)
2. Model loading with progress tracking and integrity verification (SHA-256)
3. Transcription API with language detection
4. Error handling and recovery
5. Memory management: ring buffer ceiling, model unloading after transcription

**Deliverables:**

- Transcription worker module with chunked processing
- Progress events for UI feedback
- Memory ceiling verified: ~96MB peak regardless of call duration

### Phase 4: Integration with Call Flow (1 week)

**Tasks:**

1. Replace server-side transcription with client-side (local mic audio only)
2. Add transcription settings UI (model selection, enable/disable)
3. Progress indicator during transcription
4. Fallback to server-side if WASM not supported
5. Clear "Transcribes your speech only" UI label
6. Handle long calls (chunked processing handles 30+ minutes within memory budget)

**Deliverables:**

- Updated call end flow with local transcription
- Settings page for transcription preferences
- Clear documentation of local-audio-only limitation

### Phase 5: Optimization and Testing (0.5 weeks)

**Tasks:**

1. Performance profiling (memory, CPU) — verify ~96MB ceiling
2. Test on various devices (desktop, mobile browsers)
3. Optimize for mobile (tiny model only, clear battery warning)
4. Add transcription quality feedback mechanism
5. CSP / network restriction verification for transcription worker
6. E2E tests for transcription flow

**Deliverables:**

- Performance benchmarks (single-threaded)
- Device compatibility matrix
- Test coverage
- Security verification for worker isolation

## Server-Side Changes

### Remove Transcription Endpoint

```diff
- POST /api/transcribe
-   Body: { audio: base64 }
-   Response: { text: string }
```

The endpoint can be kept as fallback for browsers without WASM support, but becomes optional.

### Update Note Creation

No changes needed — notes already accept encrypted transcription text. The only difference is where the plaintext originates (client vs server).

## Client-Side Changes

### Settings Addition

```typescript
interface TranscriptionSettings {
  enabled: boolean;
  model: 'tiny' | 'base';  // 'small' removed — impractical for single-threaded WASM
  language: string | 'auto';
  fallbackToServer: boolean;
}
```

### Call End Flow Update

```typescript
// Before (server-side)
async function endCallWithTranscription(callId: string, audio: Blob) {
  const base64Audio = await blobToBase64(audio);
  const { text } = await api.post('/api/transcribe', { audio: base64Audio });
  const encrypted = await encryptNote({ transcription: text }, adminPubkey);
  await api.post(`/api/calls/${callId}/notes`, encrypted);
}

// After (client-side, local mic only)
async function endCallWithTranscription(callId: string) {
  const text = await transcriptionManager.finalize();
  const encrypted = await encryptNote({ transcription: text }, adminPubkey);
  await api.post(`/api/calls/${callId}/notes`, encrypted);
  await transcriptionManager.stop(); // Free memory
}
```

## Model Delivery

### Progressive Loading with Integrity Verification

Load model on first use, verify hash, cache in IndexedDB:

```typescript
async function loadModel(model: WhisperModel): Promise<Uint8Array> {
  // Check IndexedDB cache
  const cached = await modelCache.get(model);
  if (cached && await verifyHash(cached, EXPECTED_MODEL_HASHES[model])) {
    return cached;
  }

  // Fetch from same origin
  const response = await fetch(`/models/whisper-${model}.bin`);
  const data = new Uint8Array(await response.arrayBuffer());

  // Verify integrity — SRI does not apply to fetch() calls
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (hashHex !== EXPECTED_MODEL_HASHES[model]) {
    throw new Error(`Model integrity verification failed for ${model}. Expected ${EXPECTED_MODEL_HASHES[model]}, got ${hashHex}`);
  }

  // Cache verified model
  await modelCache.set(model, data);
  return data;
}
```

Expected hashes are baked into source code at build time and covered by the reproducible build chain from Epic 79.

## Browser Compatibility

### Required Features

| Feature | Chrome | Firefox | Safari | Edge |
| ------- | ------ | ------- | ------ | ---- |
| WebAssembly | 57+ | 52+ | 11+ | 16+ |
| WASM SIMD | 91+ | 89+ | 16.4+ | 91+ |
| AudioWorklet | 66+ | 76+ | 14.1+ | 79+ |
| Web Workers | All | All | All | All |

**Not required:** `SharedArrayBuffer`, `Cross-Origin-Embedder-Policy`, `Cross-Origin-Opener-Policy` (avoided by using single-threaded WASM).

### Fallback Strategy

For unsupported browsers:

1. Detect capability: `typeof WebAssembly === 'object' && typeof AudioWorklet !== 'undefined'`
2. If unsupported and `fallbackToServer` enabled: use existing server transcription
3. If unsupported and fallback disabled: skip transcription, show message

## Performance Considerations

### Memory Budget (Single-Threaded)

| Component | Size |
|-----------|------|
| WASM module | ~50MB |
| Model (tiny) | ~39MB |
| Ring buffer (60s at 16kHz) | ~3.6MB |
| In-flight chunk | ~3.6MB |
| **Total peak** | **~96MB** |

This is constant regardless of call duration due to the ring buffer approach.

### CPU Usage (Single-Threaded)

- Transcription: ~100% of one CPU core (in Web Worker, off main thread)
- Duration: ~2-3x audio length for tiny model
- Example: 5-minute call transcribed in ~2.5 minutes
- Example: 30-minute call transcribed in chunks during call, final chunk after hangup

### Battery Impact (Mobile)

- Significant during transcription
- Recommendation: Show warning on mobile, default to tiny model
- Chunked processing spreads CPU usage over call duration rather than spiking at end

### Mitigations

1. Unload model after transcription completes (free ~89MB)
2. Use `requestIdleCallback` for chunk scheduling during call
3. Limit to one active transcription at a time
4. Ring buffer caps memory regardless of call duration

## Security Considerations

### WASM Integrity

- SHA-256 hash verification for model files (SRI does not apply to `fetch()`)
- Expected hashes baked into source code at build time
- Covered by reproducible build chain (Epic 79)
- Version-locked model files (include version in filename)

### Model Provenance

- Document model source (OpenAI Whisper official weights)
- Provide checksums for verification
- Consider reproducible model conversion

### Audio Handling

- Audio never leaves device (core goal)
- Only local microphone captured (remote audio not accessible via Twilio SDK)
- Ring buffer limits in-memory audio to 60 seconds maximum
- Clear audio buffers after transcription
- No audio persistence to disk

### Worker Isolation

- CSP `connect-src 'self'` restricts worker network access
- Compromised WASM cannot exfiltrate to arbitrary domains
- Model integrity check prevents loading tampered binaries

## Success Criteria

1. **Privacy**
   - [ ] Audio never sent to server
   - [ ] Transcription happens entirely in browser
   - [ ] Audio buffers cleared after use
   - [ ] Model integrity verified via SHA-256 hash

2. **Functionality**
   - [ ] Transcription accuracy comparable to server-side (for local mic audio)
   - [ ] Works on major browsers (Chrome, Firefox, Safari, Edge)
   - [ ] Handles calls up to 30 minutes with chunked processing
   - [ ] Language detection works
   - [ ] Clear UI indication that only volunteer speech is transcribed

3. **Performance**
   - [ ] Memory usage under 100MB peak regardless of call duration
   - [ ] No UI freezing during transcription (Web Worker isolation)
   - [ ] Tiny model transcribes at ~2-3x realtime (single-threaded)

4. **User Experience**
   - [ ] Progress indicator during transcription
   - [ ] Model selection in settings (tiny/base only)
   - [ ] Clear error messages if unsupported
   - [ ] "Transcribes your speech only" label visible

## Dependencies

- **Epic 79 (Reproducible Builds):** Model hash verification relies on build-time hash embedding. Reproducible build chain ensures hash constants are trustworthy.
- **Epic 75 (Native Clients):** Native apps can use native Whisper (whisper.cpp directly, not WASM) for better performance.

## Open Questions

1. **Streaming transcription**: Should we transcribe during the call or only after?
   - Decision: During the call via 30-second chunks (solves memory problem and provides progressive results)

2. **Speaker diarization**: Should we identify who said what?
   - Deferred: Only capturing local audio makes this less relevant for MVP

3. **Full call transcription (Option B)**: Is raw WebRTC worth the rewrite for both-side capture?
   - Deferred: Evaluate demand after MVP ships with local-only transcription

4. **Model updates**: How to handle new Whisper model releases?
   - Recommendation: Versioned model URLs, update hashes in source, manual updates
