// --- WhatsApp Cloud API Webhook Payload Types (Meta Graph API format) ---

/** Webhook verification query parameters sent by Meta during setup */
export interface WebhookVerificationPayload {
  'hub.mode': 'subscribe'
  'hub.verify_token': string
  'hub.challenge': string
}

// --- Inbound Message Types ---

/** Top-level webhook payload from Meta Cloud API */
export interface MetaWebhookPayload {
  object: 'whatsapp_business_account'
  entry: MetaWebhookEntry[]
}

export interface MetaWebhookEntry {
  id: string
  changes: MetaWebhookChange[]
}

export interface MetaWebhookChange {
  value: MetaWebhookValue
  field: 'messages'
}

export interface MetaWebhookValue {
  messaging_product: 'whatsapp'
  metadata: MetaWebhookMetadata
  contacts?: MetaWebhookContact[]
  messages?: MetaInboundMessage[]
  statuses?: MetaMessageStatus[]
  errors?: MetaWebhookError[]
}

export interface MetaWebhookMetadata {
  display_phone_number: string
  phone_number_id: string
}

export interface MetaWebhookContact {
  profile: { name: string }
  wa_id: string
}

export interface MetaInboundMessage {
  from: string
  id: string
  timestamp: string
  type: MetaMessageType
  text?: MetaTextContent
  image?: MetaMediaContent
  video?: MetaMediaContent
  audio?: MetaMediaContent
  document?: MetaDocumentContent
  location?: MetaLocationContent
  contacts?: MetaContactContent[]
  reaction?: MetaReactionContent
  interactive?: MetaInteractiveContent
  context?: MetaMessageContext
}

export type MetaMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'location'
  | 'contacts'
  | 'reaction'
  | 'interactive'

export interface MetaTextContent {
  body: string
}

export interface MetaMediaContent {
  id: string
  mime_type: string
  sha256: string
  caption?: string
}

export interface MetaDocumentContent extends MetaMediaContent {
  filename: string
}

export interface MetaLocationContent {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface MetaContactContent {
  name: {
    formatted_name: string
    first_name?: string
    last_name?: string
  }
  phones?: Array<{
    phone: string
    type: string
    wa_id?: string
  }>
}

export interface MetaReactionContent {
  message_id: string
  emoji: string
}

export interface MetaInteractiveContent {
  type: 'button_reply' | 'list_reply'
  button_reply?: {
    id: string
    title: string
  }
  list_reply?: {
    id: string
    title: string
    description?: string
  }
}

export interface MetaMessageContext {
  from: string
  id: string
}

export interface MetaMessageStatus {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
  errors?: MetaWebhookError[]
}

export interface MetaWebhookError {
  code: number
  title: string
  message: string
  error_data?: {
    details: string
  }
}

// --- Outbound Message Request Types ---

export interface MetaOutboundMessageBase {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
}

export interface MetaSendTextRequest extends MetaOutboundMessageBase {
  type: 'text'
  text: {
    preview_url?: boolean
    body: string
  }
}

export interface MetaSendImageRequest extends MetaOutboundMessageBase {
  type: 'image'
  image: {
    link: string
    caption?: string
  }
}

export interface MetaSendVideoRequest extends MetaOutboundMessageBase {
  type: 'video'
  video: {
    link: string
    caption?: string
  }
}

export interface MetaSendAudioRequest extends MetaOutboundMessageBase {
  type: 'audio'
  audio: {
    link: string
  }
}

export interface MetaSendDocumentRequest extends MetaOutboundMessageBase {
  type: 'document'
  document: {
    link: string
    caption?: string
    filename?: string
  }
}

export type MetaSendMediaRequest =
  | MetaSendImageRequest
  | MetaSendVideoRequest
  | MetaSendAudioRequest
  | MetaSendDocumentRequest

export interface MetaSendResponse {
  messaging_product: 'whatsapp'
  contacts: Array<{ input: string; wa_id: string }>
  messages: Array<{ id: string }>
}

// --- Template Message Types ---

export interface MetaTemplateComponent {
  type: 'header' | 'body' | 'button'
  parameters?: MetaTemplateParameter[]
  sub_type?: 'quick_reply' | 'url'
  index?: string
}

export interface MetaTemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video'
  text?: string
  currency?: {
    fallback_value: string
    code: string
    amount_1000: number
  }
  date_time?: {
    fallback_value: string
  }
  image?: { link: string }
  document?: { link: string }
  video?: { link: string }
}

export interface MetaSendTemplateRequest extends MetaOutboundMessageBase {
  type: 'template'
  template: {
    name: string
    language: {
      code: string
    }
    components?: MetaTemplateComponent[]
  }
}

// --- Media Download Types ---

export interface MetaMediaUrlResponse {
  messaging_product: 'whatsapp'
  url: string
  mime_type: string
  sha256: string
  file_size: number
  id: string
}

// --- Twilio WhatsApp Types ---

/** Twilio inbound WhatsApp webhook (form-encoded, same as SMS but with whatsapp: prefix) */
export interface TwilioWhatsAppInbound {
  MessageSid: string
  AccountSid: string
  From: string     // e.g., "whatsapp:+15551234567"
  To: string       // e.g., "whatsapp:+15559876543"
  Body: string
  NumMedia: string
  MediaUrl0?: string
  MediaContentType0?: string
  MediaUrl1?: string
  MediaContentType1?: string
  MediaUrl2?: string
  MediaContentType2?: string
  ProfileName?: string
}

export interface TwilioSendMessageResponse {
  sid: string
  status: string
  error_code: number | null
  error_message: string | null
}

// --- MIME type mapping for media messages ---

export const MIME_TO_META_TYPE: Record<string, MetaMessageType> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/3gpp': 'video',
  'audio/aac': 'audio',
  'audio/mp4': 'audio',
  'audio/mpeg': 'audio',
  'audio/amr': 'audio',
  'audio/ogg': 'audio',
  'application/pdf': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
}
