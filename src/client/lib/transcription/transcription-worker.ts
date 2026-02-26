/**
 * Web Worker for client-side transcription using @huggingface/transformers.
 *
 * Runs Whisper ONNX model in single-threaded WASM mode (no SharedArrayBuffer
 * required). Audio chunks arrive from the AudioWorklet via the main thread;
 * transcription results are posted back.
 */
import {
  env,
  type AutomaticSpeechRecognitionPipeline,
  type AutomaticSpeechRecognitionOutput,
} from '@huggingface/transformers'

// Force single-threaded WASM — avoids SharedArrayBuffer / COEP requirement
// that would break Twilio Voice SDK
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1
}

// Disable remote model loading — we'll only use approved models
// Models are fetched from HF Hub by default; self-hosting can be configured
// by setting env.localModelPath and env.allowRemoteModels = false

type WorkerMessage =
  | { type: 'init'; model: string; language: string }
  | { type: 'transcribe_chunk'; audio: ArrayBuffer; chunkIndex: number }
  | { type: 'finalize' }

let transcriber: AutomaticSpeechRecognitionPipeline | null = null
let modelLanguage = 'en'

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'init': {
      try {
        self.postMessage({ type: 'status', status: 'loading' })

        // Map our model names to HF Hub model IDs
        // Use onnx-community models which have proper quantized ONNX exports
        const modelMap: Record<string, string> = {
          'tiny': 'onnx-community/whisper-tiny',
          'tiny.en': 'onnx-community/whisper-tiny.en',
          'base': 'onnx-community/whisper-base',
          'base.en': 'onnx-community/whisper-base.en',
        }

        const modelId = modelMap[msg.model] || modelMap['tiny.en']
        modelLanguage = msg.language || 'en'

        // Dynamic import to avoid TypeScript union explosion from pipeline() overloads
        const { pipeline } = await import('@huggingface/transformers')
        transcriber = await (pipeline as (
          task: string,
          model: string,
          options: Record<string, unknown>,
        ) => Promise<AutomaticSpeechRecognitionPipeline>)(
          'automatic-speech-recognition',
          modelId,
          {
            dtype: 'q8',  // 8-bit quantized — best balance of size and quality for WASM
            device: 'wasm',
            progress_callback: (progress: { status: string; file?: string; progress?: number }) => {
              self.postMessage({
                type: 'progress',
                status: progress.status,
                file: progress.file,
                progress: progress.progress,
              })
            },
          },
        )

        self.postMessage({ type: 'ready' })
      } catch (error) {
        self.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Failed to initialize transcription model',
        })
      }
      break
    }

    case 'transcribe_chunk': {
      if (!transcriber) {
        self.postMessage({
          type: 'error',
          error: 'Transcriber not initialized',
          chunkIndex: msg.chunkIndex,
        })
        return
      }

      try {
        const audio = new Float32Array(msg.audio)

        const result = await transcriber(audio, {
          language: modelLanguage === 'auto' ? undefined : modelLanguage,
          return_timestamps: true,
          chunk_length_s: 30,
          stride_length_s: 5,
        }) as AutomaticSpeechRecognitionOutput

        self.postMessage({
          type: 'chunk_result',
          chunkIndex: msg.chunkIndex,
          text: result.text,
          chunks: result.chunks,
        })
      } catch (error) {
        self.postMessage({
          type: 'error',
          error: error instanceof Error ? error.message : 'Transcription failed',
          chunkIndex: msg.chunkIndex,
        })
      }
      break
    }

    case 'finalize': {
      // Dispose of the pipeline to free memory (~89MB)
      if (transcriber) {
        await (transcriber as AutomaticSpeechRecognitionPipeline & { dispose?: () => Promise<void> }).dispose?.()
        transcriber = null
      }
      self.postMessage({ type: 'finalized' })
      break
    }
  }
}
