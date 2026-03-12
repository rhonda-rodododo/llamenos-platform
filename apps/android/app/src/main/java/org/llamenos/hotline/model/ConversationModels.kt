package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * A messaging conversation between a contact and the hotline.
 *
 * Client-specific shape optimized for local UI. The generated
 * ConversationResponse (org.llamenos.protocol.ConversationResponse) represents
 * the full API shape with different field names (contactIdentifierHash,
 * assignedTo, messageCount). This type uses UI-friendly field names.
 */
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

/**
 * An encrypted message within a conversation.
 *
 * Message content is E2EE: a random symmetric key encrypts the plaintext,
 * then the key is ECIES-wrapped in [recipientEnvelopes] for each authorized
 * reader (assigned volunteer + admins).
 */
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

/**
 * Paginated response from GET /api/conversations.
 */
@Serializable
data class ConversationsListResponse(
    val conversations: List<Conversation>,
    val total: Int,
)

/**
 * Paginated response from GET /api/conversations/:id/messages.
 */
@Serializable
data class MessagesListResponse(
    val messages: List<ConversationMessage>,
    val total: Int,
)

/**
 * Request body for sending an encrypted reply.
 * Uses the generated SendMessageBody type.
 */
typealias SendMessageRequest = org.llamenos.protocol.SendMessageBody

/**
 * Envelope structure for the send-message request body.
 * Uses the generated SendMessageBodyReaderEnvelope type.
 */
typealias CreateMessageEnvelope = org.llamenos.protocol.SendMessageBodyReaderEnvelope

/**
 * Decrypted message for UI display.
 *
 * This is the client-side representation after ECIES unwrap + XChaCha20-Poly1305
 * decryption. It is never serialized or sent over the wire.
 */
data class DecryptedMessage(
    val id: String,
    val text: String,
    val direction: String,
    val channelType: String,
    val createdAt: String,
    val isRead: Boolean,
)
