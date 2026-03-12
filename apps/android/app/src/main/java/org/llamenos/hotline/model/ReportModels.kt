package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * A report — a specialized conversation with structured metadata.
 *
 * Client-specific shape for the reports UI. The generated ReportResponse
 * (org.llamenos.protocol.ReportResponse) has a different shape with
 * E2EE fields (encryptedContent, readerEnvelopes).
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

/**
 * Request body for POST /reports (create a new report).
 */
@Serializable
data class CreateReportRequest(
    val title: String,
    val category: String? = null,
    val encryptedContent: String,
    val readerEnvelopes: List<ReportEnvelope>,
)

/**
 * ECIES envelope for a report reader.
 */
@Serializable
data class ReportEnvelope(
    val pubkey: String,
    val wrappedKey: String,
    val ephemeralPubkey: String,
)

/**
 * Request body for POST /reports/:id/assign.
 * Maps to the generated AssignReportBody type.
 */
typealias AssignReportRequest = org.llamenos.protocol.AssignReportBody

/**
 * Request body for PATCH /reports/:id (status update).
 */
@Serializable
data class UpdateReportRequest(
    val status: String,
)
