package org.llamenos.hotline.model

import kotlinx.serialization.Serializable
import org.llamenos.protocol.ReportTypeDefinition

/**
 * API response for GET /api/settings/cms/report-types.
 *
 * Uses the protocol-generated [ReportTypeDefinition] for the report type shape.
 * Distinct from [org.llamenos.hotline.model.ReportTypesResponse] in AdminModels
 * which returns report categories from the legacy /api/settings/report-types endpoint.
 */
@Serializable
data class CmsReportTypesResponse(
    val reportTypes: List<ReportTypeDefinition>,
)

/**
 * Request body for POST /reports when using a typed report.
 *
 * Extends the base CreateReportRequest with reportTypeId and
 * encrypted field values (JSON-serialized map of field name -> value).
 */
@Serializable
data class CreateTypedReportRequest(
    val title: String,
    val category: String? = null,
    val reportTypeId: String,
    val encryptedContent: String,
    val readerEnvelopes: List<ReportEnvelope>,
)
