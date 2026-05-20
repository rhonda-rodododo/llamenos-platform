package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

// ── Generated re-exports ────────────────────────────────────────────────────

typealias SendMessageRequest = org.llamenos.protocol.SendMessageBody
typealias CreateMessageEnvelope = org.llamenos.protocol.SharedAdminEnvelope

// ── Client-specific types ───────────────────────────────────────────────────
// The generated conversation types use different field names
// (contactIdentifierHash, assignedTo, messageCount as Double).
// These client types use UI-friendly names (contactHash, unreadCount, etc.).

@Serializable
data class Conversation(
    val id: String,
    val channelType: String,
    val contactHash: String,
    val assignedVolunteerPubkey: String? = null,
    val status: String,
    val lastMessageAt: String? = null,
    val unreadCount: Int = 0,
    val createdAt: String,
)

@Serializable
data class ConversationMessage(
    val id: String,
    val conversationId: String,
    val direction: String,
    val encryptedContent: String,
    val recipientEnvelopes: List<org.llamenos.protocol.RecipientEnvelope>,
    val channelType: String,
    val createdAt: String,
    val readAt: String? = null,
)

@Serializable
data class ConversationsListResponse(
    val conversations: List<Conversation>,
    val total: Int,
)

@Serializable
data class MessagesListResponse(
    val messages: List<ConversationMessage>,
    val total: Int,
)

/**
 * Decrypted message for UI display.
 * Client-only — never serialized or sent over the wire.
 */
data class DecryptedMessage(
    val id: String,
    val text: String,
    val direction: String,
    val channelType: String,
    val createdAt: String,
    val isRead: Boolean,
)
