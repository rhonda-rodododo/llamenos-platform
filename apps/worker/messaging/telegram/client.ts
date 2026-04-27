/**
 * TelegramBotClient — HTTP client for the Telegram Bot API.
 *
 * All methods correspond to Telegram Bot API methods:
 * https://core.telegram.org/bots/api
 *
 * Methods POST JSON to `https://api.telegram.org/bot{token}/{method}`.
 */
import type {
  TelegramFile,
  TelegramGetFileResponse,
  TelegramGetMeResponse,
  TelegramMessage,
  TelegramSendMessageResponse,
  TelegramUser,
} from './types'

export class TelegramBotClient {
  private readonly baseUrl: string

  constructor(private readonly botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`
  }

  /**
   * Send a text message to a chat.
   * https://core.telegram.org/bots/api#sendmessage
   */
  async sendMessage(
    chatId: number | string,
    text: string,
  ): Promise<{ ok: boolean; result?: TelegramMessage; error?: string }> {
    const res = await fetch(`${this.baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    })

    const data: TelegramSendMessageResponse = await res.json()
    if (!data.ok) {
      return { ok: false, error: data.description ?? `HTTP ${res.status}` }
    }
    return { ok: true, result: data.result }
  }

  /**
   * Send a photo to a chat.
   * https://core.telegram.org/bots/api#sendphoto
   *
   * @param photo - File ID, HTTP URL, or upload (only URL/file_id supported here)
   */
  async sendPhoto(
    chatId: number | string,
    photo: string,
    caption?: string,
  ): Promise<{ ok: boolean; result?: TelegramMessage; error?: string }> {
    const body: Record<string, unknown> = { chat_id: chatId, photo }
    if (caption) body.caption = caption

    const res = await fetch(`${this.baseUrl}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })

    const data: TelegramSendMessageResponse = await res.json()
    if (!data.ok) {
      return { ok: false, error: data.description ?? `HTTP ${res.status}` }
    }
    return { ok: true, result: data.result }
  }

  /**
   * Send a voice message to a chat.
   * https://core.telegram.org/bots/api#sendvoice
   *
   * @param voiceUrl - HTTP URL to an OGG file encoded with OPUS
   */
  async sendVoice(
    chatId: number | string,
    voiceUrl: string,
  ): Promise<{ ok: boolean; result?: TelegramMessage; error?: string }> {
    const res = await fetch(`${this.baseUrl}/sendVoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, voice: voiceUrl }),
      signal: AbortSignal.timeout(15_000),
    })

    const data: TelegramSendMessageResponse = await res.json()
    if (!data.ok) {
      return { ok: false, error: data.description ?? `HTTP ${res.status}` }
    }
    return { ok: true, result: data.result }
  }

  /**
   * Send a document (general file) to a chat.
   * https://core.telegram.org/bots/api#senddocument
   */
  async sendDocument(
    chatId: number | string,
    documentUrl: string,
    caption?: string,
  ): Promise<{ ok: boolean; result?: TelegramMessage; error?: string }> {
    const body: Record<string, unknown> = { chat_id: chatId, document: documentUrl }
    if (caption) body.caption = caption

    const res = await fetch(`${this.baseUrl}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })

    const data: TelegramSendMessageResponse = await res.json()
    if (!data.ok) {
      return { ok: false, error: data.description ?? `HTTP ${res.status}` }
    }
    return { ok: true, result: data.result }
  }

  /**
   * Verify the bot token and get bot info.
   * https://core.telegram.org/bots/api#getme
   */
  async getMe(): Promise<{ ok: boolean; result?: TelegramUser; error?: string }> {
    const res = await fetch(`${this.baseUrl}/getMe`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    })

    const data: TelegramGetMeResponse = await res.json()
    if (!data.ok) {
      return { ok: false, error: data.description ?? `HTTP ${res.status}` }
    }
    return { ok: true, result: data.result }
  }

  /**
   * Register a webhook URL with Telegram.
   * https://core.telegram.org/bots/api#setwebhook
   *
   * @param url - HTTPS URL to send updates to
   * @param secret - Secret token for X-Telegram-Bot-Api-Secret-Token header verification
   */
  async setWebhook(url: string, secret?: string): Promise<{ ok: boolean; error?: string }> {
    const body: Record<string, unknown> = { url }
    if (secret) body.secret_token = secret

    const res = await fetch(`${this.baseUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })

    const data = (await res.json()) as { ok: boolean; description?: string }
    if (!data.ok) {
      return { ok: false, error: data.description ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  }

  /**
   * Get file info for downloading.
   * https://core.telegram.org/bots/api#getfile
   *
   * After getting the file_path, download from:
   * https://api.telegram.org/file/bot{token}/{file_path}
   */
  async getFile(fileId: string): Promise<{ ok: boolean; result?: TelegramFile; error?: string }> {
    const res = await fetch(`${this.baseUrl}/getFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
      signal: AbortSignal.timeout(10_000),
    })

    const data: TelegramGetFileResponse = await res.json()
    if (!data.ok) {
      return { ok: false, error: data.description ?? `HTTP ${res.status}` }
    }
    return { ok: true, result: data.result }
  }

  /**
   * Download file content by file_path.
   * Uses the Telegram file download endpoint:
   * https://api.telegram.org/file/bot{token}/{file_path}
   */
  async downloadFile(filePath: string): Promise<ArrayBuffer> {
    const url = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) {
      throw new Error(`Failed to download Telegram file: HTTP ${res.status}`)
    }
    return res.arrayBuffer()
  }
}
