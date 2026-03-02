package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * A report — a specialized conversation with structured metadata.
 *
 * Reports extend the conversation concept with a title, category, and
 * optional custom field values. They can be linked to a call record.
 * Report content (messages) follows the same E2EE envelope pattern as
 * regular conversation messages.
 */
@Serializable
data class Report(
    val id: String,
    val channelType: String = "reports",
    val contactHash: String? = null,
    val assignedTo: String? = null,
    val status: String,
    val createdAt: String,
    val updatedAt: String? = null,
    val lastMessageAt: String? = null,
    val messageCount: Int = 0,
    val metadata: ReportMetadata? = null,
)

/**
 * Report-specific metadata embedded in the conversation.
 */
@Serializable
data class ReportMetadata(
    val type: String = "report",
    val reportTitle: String? = null,
    val reportCategory: String? = null,
    val linkedCallId: String? = null,
    val reportId: String? = null,
)

/**
 * Paginated reports list response from GET /reports.
 */
@Serializable
data class ReportsListResponse(
    val conversations: List<Report>,
    val total: Int = 0,
)

/**
 * Report categories response from GET /reports/categories.
 */
@Serializable
data class ReportCategoriesResponse(
    val categories: List<String>,
)
