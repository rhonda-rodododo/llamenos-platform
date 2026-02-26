// AudioWorklet processor for capturing local microphone audio.
// Runs in AudioWorkletGlobalScope — must be plain JavaScript.
//
// Maintains a ring buffer and flushes 30-second chunks with 5-second overlap
// to the main thread via postMessage. Memory ceiling: ~3.6MB ring buffer.

const SAMPLE_RATE = 16000
const RING_BUFFER_SECONDS = 60
const RING_BUFFER_SIZE = SAMPLE_RATE * RING_BUFFER_SECONDS
const CHUNK_SECONDS = 30
const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SECONDS
const OVERLAP_SECONDS = 5
const OVERLAP_SAMPLES = SAMPLE_RATE * OVERLAP_SECONDS

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ringBuffer = new Float32Array(RING_BUFFER_SIZE)
    this.writeIndex = 0
    this.samplesSinceLastFlush = 0
    this.active = true

    this.port.onmessage = (event) => {
      if (event.data.type === 'flush') {
        this._flushBuffer()
      } else if (event.data.type === 'stop') {
        this._flushBuffer()
        this.active = false
      }
    }
  }

  process(inputs) {
    if (!this.active) return false

    const input = inputs[0]
    if (!input || input.length === 0) return true

    // Take first channel (mono)
    const channelData = input[0]
    if (!channelData) return true

    for (let i = 0; i < channelData.length; i++) {
      this.ringBuffer[this.writeIndex % RING_BUFFER_SIZE] = channelData[i]
      this.writeIndex++
      this.samplesSinceLastFlush++
    }

    // Auto-flush every 30 seconds of captured audio
    if (this.samplesSinceLastFlush >= CHUNK_SAMPLES) {
      this._flushBuffer()
    }

    return true
  }

  _flushBuffer() {
    if (this.samplesSinceLastFlush === 0) return

    // Include overlap from before the chunk start for context continuity
    const totalSamples = Math.min(
      this.samplesSinceLastFlush + OVERLAP_SAMPLES,
      this.writeIndex,
    )
    const startIndex = Math.max(0, this.writeIndex - totalSamples)
    const chunk = new Float32Array(totalSamples)

    for (let i = 0; i < totalSamples; i++) {
      chunk[i] = this.ringBuffer[(startIndex + i) % RING_BUFFER_SIZE]
    }

    // Transfer ownership of the buffer for zero-copy
    this.port.postMessage({ type: 'audio_chunk', data: chunk }, [chunk.buffer])
    this.samplesSinceLastFlush = 0
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor)
