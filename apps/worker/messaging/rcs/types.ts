/**
 * Google RCS Business Messaging (RBM) API types.
 * Based on https://developers.google.com/business-communications/rcs-business-messaging/reference/rest
 */

// Webhook payload from Google RBM
export interface RBMWebhookPayload {
  message?: RBMUserMessage
  event?: RBMUserEvent
  agentId: string
  senderId: string   // User's phone number (E.164)
}

export interface RBMUserMessage {
  messageId: string
  sendTime: string
  text?: string
  userFile?: {
    payload: {
      mimeType: string
      fileSizeBytes: number
      fileUri: string
      fileName: string
    }
  }
  location?: {
    latitude: number
    longitude: number
    label?: string
  }
  suggestionResponse?: {
    postbackData: string
    text: string
    type: 'REPLY' | 'ACTION'
  }
}

export interface RBMUserEvent {
  eventId: string
  sendTime: string
  eventType: 'DELIVERED' | 'READ' | 'IS_TYPING'
}

// Outbound message types
export interface RBMSendMessageRequest {
  contentMessage: RBMContentMessage
}

export interface RBMContentMessage {
  text?: string
  contentInfo?: {
    fileUrl: string
    thumbnailUrl?: string
    forceRefresh?: boolean
  }
  richCard?: RBMRichCard
  suggestions?: RBMSuggestion[]
}

export interface RBMRichCard {
  standaloneCard?: {
    cardOrientation: 'HORIZONTAL' | 'VERTICAL'
    thumbnailImageAlignment?: 'LEFT' | 'RIGHT'
    cardContent: RBMCardContent
  }
  carouselCard?: {
    cardWidth: 'SMALL' | 'MEDIUM'
    cardContents: RBMCardContent[]
  }
}

export interface RBMCardContent {
  title?: string
  description?: string
  media?: {
    height: 'SHORT' | 'MEDIUM' | 'TALL'
    contentInfo: {
      fileUrl: string
      thumbnailUrl?: string
      forceRefresh?: boolean
    }
  }
  suggestions?: RBMSuggestion[]
}

export interface RBMSuggestion {
  reply?: {
    text: string
    postbackData: string
  }
  action?: {
    text: string
    postbackData: string
    dialAction?: { phoneNumber: string }
    openUrlAction?: { url: string }
    shareLocationAction?: Record<string, never>
  }
}

// OAuth2 token response
export interface GoogleOAuthTokenResponse {
  access_token: string
  expires_in: number
  token_type: string
}

// Service account key
export interface GoogleServiceAccountKey {
  type: 'service_account'
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
  auth_provider_x509_cert_url: string
  client_x509_cert_url: string
}

// RBM API response
export interface RBMApiResponse {
  name?: string
  error?: {
    code: number
    message: string
    status: string
  }
}
