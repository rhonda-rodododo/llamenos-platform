/**
 * Telegram-specific types for webhook payloads and Bot API responses.
 *
 * @see https://core.telegram.org/bots/api
 */

/** Telegram Update object — the root webhook payload */
export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
  edited_channel_post?: TelegramMessage
  callback_query?: TelegramCallbackQuery
  inline_query?: unknown
  chosen_inline_result?: unknown
}

/** Telegram Message object */
export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  sender_chat?: TelegramChat
  date: number // Unix timestamp
  chat: TelegramChat
  text?: string
  caption?: string
  photo?: TelegramPhotoSize[]
  document?: TelegramDocument
  voice?: TelegramVoice
  audio?: TelegramAudio
  video?: TelegramVideo
  animation?: TelegramAnimation
  sticker?: TelegramSticker
  location?: TelegramLocation
  contact?: TelegramContact
  reply_to_message?: TelegramMessage
  forward_from?: TelegramUser
  forward_date?: number
}

/** Telegram User object (the sender) */
export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

/** Telegram Chat object */
export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

/** Telegram PhotoSize object */
export interface TelegramPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

/** Telegram Document object */
export interface TelegramDocument {
  file_id: string
  file_unique_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
  thumbnail?: TelegramPhotoSize
}

/** Telegram Voice object (voice message) */
export interface TelegramVoice {
  file_id: string
  file_unique_id: string
  duration: number
  mime_type?: string
  file_size?: number
}

/** Telegram Audio object (music file) */
export interface TelegramAudio {
  file_id: string
  file_unique_id: string
  duration: number
  performer?: string
  title?: string
  file_name?: string
  mime_type?: string
  file_size?: number
  thumbnail?: TelegramPhotoSize
}

/** Telegram Video object */
export interface TelegramVideo {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  duration: number
  thumbnail?: TelegramPhotoSize
  file_name?: string
  mime_type?: string
  file_size?: number
}

/** Telegram Animation object (GIF or H.264/MPEG-4 video without sound) */
export interface TelegramAnimation {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  duration: number
  thumbnail?: TelegramPhotoSize
  file_name?: string
  mime_type?: string
  file_size?: number
}

/** Telegram Sticker object */
export interface TelegramSticker {
  file_id: string
  file_unique_id: string
  type: 'regular' | 'mask' | 'custom_emoji'
  width: number
  height: number
  is_animated: boolean
  is_video: boolean
  thumbnail?: TelegramPhotoSize
  emoji?: string
  set_name?: string
  file_size?: number
}

/** Telegram Location object */
export interface TelegramLocation {
  longitude: number
  latitude: number
  horizontal_accuracy?: number
  live_period?: number
  heading?: number
  proximity_alert_radius?: number
}

/** Telegram Contact object */
export interface TelegramContact {
  phone_number: string
  first_name: string
  last_name?: string
  user_id?: number
  vcard?: string
}

/** Telegram CallbackQuery object (for inline keyboards) */
export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  inline_message_id?: string
  chat_instance: string
  data?: string
  game_short_name?: string
}

/** Telegram File object (response from getFile) */
export interface TelegramFile {
  file_id: string
  file_unique_id: string
  file_size?: number
  file_path?: string
}

// --- Bot API Response Types ---

/** Generic Telegram Bot API response */
export interface TelegramApiResponse<T> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
}

/** Response from sendMessage */
export type TelegramSendMessageResponse = TelegramApiResponse<TelegramMessage>

/** Response from getMe */
export type TelegramGetMeResponse = TelegramApiResponse<TelegramUser>

/** Response from getFile */
export type TelegramGetFileResponse = TelegramApiResponse<TelegramFile>
