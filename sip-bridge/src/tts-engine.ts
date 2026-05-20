import { createHash, createHmac } from 'node:crypto'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

/** Maximum age for cached TTS audio files (7 days) */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Supported TTS engine types */
export type TtsEngineType = 'google' | 'polly' | 'espeak' | 'none'

/** Configuration for TTS engines */
export interface TtsConfig {
  /** Selected TTS engine */
  engine: TtsEngineType
  /** Directory to cache synthesized audio files */
  cacheDir: string
  /** Google Cloud API key (for google engine) */
  googleApiKey?: string
  /** Google Cloud voice name, e.g. "en-US-Neural2-D" */
  googleVoiceName?: string
  /** AWS access key ID (for polly engine) */
  awsAccessKeyId?: string
  /** AWS secret access key (for polly engine) */
  awsSecretAccessKey?: string
  /** AWS region (for polly engine) */
  awsRegion?: string
  /** AWS Polly voice ID, e.g. "Joanna" */
  pollyVoiceId?: string
  /** espeak-ng voice name, e.g. "en" or "es" */
  espeakVoice?: string
}

/** TTS engine abstraction — synthesize text to an audio file path */
export interface TtsEngine {
  /**
   * Synthesize text to speech.
   * @returns Absolute path to the generated audio file, or null on failure.
   */
  synthesize(text: string, language?: string): Promise<string | null>
}

/** Build a cache key from text, language, and engine type */
function buildCacheKey(text: string, language: string | undefined, engine: string): string {
  const hash = createHash('sha256')
    .update(`${engine}\0${language ?? ''}\0${text}`)
    .digest('hex')
  return hash
}

/** Ensure cache directory exists and prune stale files */
async function initCacheDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  try {
    const files = await readdir(dir)
    const now = Date.now()
    for (const file of files) {
      const filePath = join(dir, file)
      try {
        const s = await stat(filePath)
        if (!s.isFile()) continue
        if (now - s.mtimeMs > CACHE_MAX_AGE_MS) {
          await unlink(filePath)
        }
      } catch {
        // ignore per-file errors
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

/** ------------------------------------------------------------------
 *  Google Cloud Text-to-Speech
 *  ------------------------------------------------------------------ */
class GoogleTtsEngine implements TtsEngine {
  private readonly apiKey: string
  private readonly cacheDir: string
  private readonly voiceName?: string

  constructor(config: TtsConfig) {
    this.apiKey = config.googleApiKey ?? ''
    this.cacheDir = config.cacheDir
    this.voiceName = config.googleVoiceName
  }

  async synthesize(text: string, language?: string): Promise<string | null> {
    if (!this.apiKey) {
      console.warn('[tts:google] No API key configured')
      return null
    }

    const lang = mapLanguageToGoogle(language)
    const cacheKey = buildCacheKey(text, lang, 'google')
    const cachePath = join(this.cacheDir, `${cacheKey}.mp3`)

    // Check cache
    try {
      const s = await stat(cachePath)
      if (s.isFile()) return cachePath
    } catch {
      // not cached
    }

    const voiceName = this.voiceName ?? defaultGoogleVoice(lang)

    try {
      const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(this.apiKey)}`
      const body = JSON.stringify({
        input: { text },
        voice: { languageCode: lang, name: voiceName },
        audioConfig: { audioEncoding: 'MP3' },
      })

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(30_000),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.warn(`[tts:google] API error ${res.status}: ${errText}`)
        return null
      }

      const data = (await res.json()) as { audioContent?: string }
      if (!data.audioContent) {
        console.warn('[tts:google] No audioContent in response')
        return null
      }

      const audioBuffer = Buffer.from(data.audioContent, 'base64')
      await writeFile(cachePath, audioBuffer)
      return cachePath
    } catch (err) {
      console.warn('[tts:google] Synthesis failed:', err)
      return null
    }
  }
}

/** ------------------------------------------------------------------
 *  AWS Polly
 *  ------------------------------------------------------------------ */
class PollyTtsEngine implements TtsEngine {
  private readonly accessKeyId: string
  private readonly secretAccessKey: string
  private readonly region: string
  private readonly voiceId: string
  private readonly cacheDir: string

  constructor(config: TtsConfig) {
    this.accessKeyId = config.awsAccessKeyId ?? ''
    this.secretAccessKey = config.awsSecretAccessKey ?? ''
    this.region = config.awsRegion ?? 'us-east-1'
    this.voiceId = config.pollyVoiceId ?? 'Joanna'
    this.cacheDir = config.cacheDir
  }

  async synthesize(text: string, language?: string): Promise<string | null> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      console.warn('[tts:polly] AWS credentials not configured')
      return null
    }

    const lang = mapLanguageToPolly(language)
    const cacheKey = buildCacheKey(text, lang, 'polly')
    const cachePath = join(this.cacheDir, `${cacheKey}.mp3`)

    // Check cache
    try {
      const s = await stat(cachePath)
      if (s.isFile()) return cachePath
    } catch {
      // not cached
    }

    const voiceId = this.voiceId ?? defaultPollyVoice(lang)
    const endpoint = `https://polly.${this.region}.amazonaws.com/v1/speech`
    const body = JSON.stringify({
      Text: text,
      OutputFormat: 'mp3',
      VoiceId: voiceId,
    })

    try {
      const signedHeaders = signAwsV4(
        'POST',
        new URL(endpoint),
        { 'Content-Type': 'application/json' },
        body,
        this.accessKeyId,
        this.secretAccessKey,
        this.region,
        'polly'
      )

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: signedHeaders,
        body,
        signal: AbortSignal.timeout(30_000),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.warn(`[tts:polly] API error ${res.status}: ${errText}`)
        return null
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer())
      await writeFile(cachePath, audioBuffer)
      return cachePath
    } catch (err) {
      console.warn('[tts:polly] Synthesis failed:', err)
      return null
    }
  }
}

/** Sign an AWS request using Signature Version 4 */
function signAwsV4(
  method: string,
  url: URL,
  headers: Record<string, string>,
  body: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  service: string
): Record<string, string> {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  headers['x-amz-date'] = amzDate
  headers['host'] = url.host

  const payloadHash = createHash('sha256').update(body).digest('hex')
  headers['x-amz-content-sha256'] = payloadHash

  const sortedHeaderKeys = Object.keys(headers).map((k) => k.toLowerCase()).sort()
  const signedHeaders = sortedHeaderKeys.join(';')

  let canonicalHeaders = ''
  for (const key of sortedHeaderKeys) {
    const originalKey = Object.keys(headers).find((k) => k.toLowerCase() === key)!
    canonicalHeaders += `${key}:${headers[originalKey].trim()}\n`
  }

  const canonicalRequest = [
    method,
    url.pathname,
    url.search,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')

  const kDate = createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest()
  const kRegion = createHmac('sha256', kDate).update(region).digest()
  const kService = createHmac('sha256', kRegion).update(service).digest()
  const kSigning = createHmac('sha256', kService).update('aws4_request').digest()
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex')

  headers['Authorization'] =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return headers
}

/** ------------------------------------------------------------------
 *  espeak-ng (local TTS)
 *  ------------------------------------------------------------------ */
class EspeakTtsEngine implements TtsEngine {
  private readonly voice: string
  private readonly cacheDir: string

  constructor(config: TtsConfig) {
    this.voice = config.espeakVoice ?? 'en'
    this.cacheDir = config.cacheDir
  }

  async synthesize(text: string, language?: string): Promise<string | null> {
    const voice = language ? mapLanguageToEspeak(language) : this.voice
    const cacheKey = buildCacheKey(text, voice, 'espeak')
    const cachePath = join(this.cacheDir, `${cacheKey}.wav`)

    // Check cache
    try {
      const s = await stat(cachePath)
      if (s.isFile()) return cachePath
    } catch {
      // not cached
    }

    return new Promise((resolve) => {
      const proc = spawn('espeak-ng', ['-w', cachePath, '-v', voice, text], {
        stdio: ['ignore', 'ignore', 'pipe'],
      })

      let stderr = ''
      proc.stderr?.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(cachePath)
        } else {
          console.warn(`[tts:espeak] espeak-ng exited ${code}: ${stderr.trim()}`)
          resolve(null)
        }
      })

      proc.on('error', (err) => {
        console.warn('[tts:espeak] Failed to spawn espeak-ng:', err)
        resolve(null)
      })
    })
  }
}

/** ------------------------------------------------------------------
 *  Factory
 *  ------------------------------------------------------------------ */

/**
 * Create a TTS engine from configuration.
 * Returns null if engine is 'none' or unsupported.
 */
export function createTtsEngine(config: TtsConfig): TtsEngine | null {
  if (!config.engine || config.engine === 'none') return null

  // Initialize cache directory asynchronously — fire and forget
  initCacheDir(config.cacheDir).catch((err) => {
    console.warn('[tts] Cache init failed:', err)
  })

  switch (config.engine) {
    case 'google':
      return new GoogleTtsEngine(config)
    case 'polly':
      return new PollyTtsEngine(config)
    case 'espeak':
      return new EspeakTtsEngine(config)
    default:
      console.warn(`[tts] Unknown engine "${config.engine}" — TTS disabled`)
      return null
  }
}

/** Build TTS config from environment variables */
export function loadTtsConfigFromEnv(): TtsConfig {
  const engine = (process.env.TTS_ENGINE ?? 'none') as TtsEngineType
  return {
    engine,
    cacheDir: process.env.TTS_CACHE_DIR ?? '/tmp/tts-cache',
    googleApiKey: process.env.TTS_GOOGLE_API_KEY,
    googleVoiceName: process.env.TTS_GOOGLE_VOICE_NAME,
    awsAccessKeyId: process.env.TTS_AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.TTS_AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.TTS_AWS_REGION ?? 'us-east-1',
    pollyVoiceId: process.env.TTS_POLLY_VOICE_ID,
    espeakVoice: process.env.TTS_ESPEAK_VOICE,
  }
}

/** ------------------------------------------------------------------
 *  Language mapping helpers
 *  ------------------------------------------------------------------ */

/** Map a Llamenos language code to a Google Cloud TTS language code */
function mapLanguageToGoogle(lang?: string): string {
  const map: Record<string, string> = {
    en: 'en-US',
    es: 'es-ES',
    zh: 'cmn-CN',
    tl: 'en-US', // Tagalog fallback
    vi: 'vi-VN',
    ar: 'ar-XA',
    fr: 'fr-FR',
    ht: 'fr-FR', // Haitian Creole fallback
    ko: 'ko-KR',
    ru: 'ru-RU',
    hi: 'hi-IN',
    pt: 'pt-BR',
    de: 'de-DE',
  }
  return map[lang ?? ''] ?? 'en-US'
}

function defaultGoogleVoice(langCode: string): string {
  // Prefer Neural2 voices where available
  const defaults: Record<string, string> = {
    'en-US': 'en-US-Neural2-D',
    'es-ES': 'es-ES-Neural2-F',
    'cmn-CN': 'cmn-CN-Wavenet-D',
    'vi-VN': 'vi-VN-Neural2-A',
    'ar-XA': 'ar-XA-Wavenet-B',
    'fr-FR': 'fr-FR-Neural2-A',
    'ko-KR': 'ko-KR-Neural2-A',
    'ru-RU': 'ru-RU-Wavenet-D',
    'hi-IN': 'hi-IN-Neural2-A',
    'pt-BR': 'pt-BR-Neural2-A',
    'de-DE': 'de-DE-Neural2-D',
  }
  return defaults[langCode] ?? 'en-US-Neural2-D'
}

/** Map a Llamenos language code to an AWS Polly language code */
function mapLanguageToPolly(lang?: string): string {
  const map: Record<string, string> = {
    en: 'en-US',
    es: 'es-ES',
    zh: 'cmn-CN',
    tl: 'en-US',
    vi: 'vi-VN',
    ar: 'ar-AE',
    fr: 'fr-FR',
    ht: 'fr-FR',
    ko: 'ko-KR',
    ru: 'ru-RU',
    hi: 'hi-IN',
    pt: 'pt-BR',
    de: 'de-DE',
  }
  return map[lang ?? ''] ?? 'en-US'
}

function defaultPollyVoice(langCode: string): string {
  const defaults: Record<string, string> = {
    'en-US': 'Joanna',
    'es-ES': 'Lucia',
    'cmn-CN': 'Zhiyu',
    'vi-VN': 'Lin',
    'ar-AE': 'Hala',
    'fr-FR': 'Lea',
    'ko-KR': 'Seoyeon',
    'ru-RU': 'Tatyana',
    'hi-IN': 'Kajal',
    'pt-BR': 'Camila',
    'de-DE': 'Vicki',
  }
  return defaults[langCode] ?? 'Joanna'
}

/** Map a Llamenos language code to an espeak-ng voice name */
function mapLanguageToEspeak(lang?: string): string {
  const map: Record<string, string> = {
    en: 'en',
    es: 'es',
    zh: 'zhy',
    tl: 'tl',
    vi: 'vi',
    ar: 'ar',
    fr: 'fr',
    ht: 'fr-ht',
    ko: 'ko',
    ru: 'ru',
    hi: 'hi',
    pt: 'pt',
    de: 'de',
  }
  return map[lang ?? ''] ?? 'en'
}

/** Format a local audio file path for the PBX type */
export function formatMediaPath(filePath: string, pbxType: 'asterisk' | 'freeswitch' | 'kamailio'): string {
  if (pbxType === 'asterisk') {
    // ARI accepts file:// URIs for absolute paths
    return `file://${filePath}`
  }
  // FreeSWITCH ESL uuid_broadcast accepts raw file paths
  return filePath
}
