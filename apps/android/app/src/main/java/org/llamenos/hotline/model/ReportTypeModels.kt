package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * A report type definition from the CMS settings.
 *
 * Each report type defines a template with custom fields, statuses,
 * and metadata (icon, color, category). Mobile-optimized types are
 * surfaced in the report type picker on Android.
 */
@Serializable
data class ReportTypeDefinition(
    val id: String,
    val name: String,
    val label: String,
    val labelPlural: String,
    val description: String = "",
    val icon: String? = null,
    val color: String? = null,
    val category: String = "report",
    val fields: List<ReportFieldDefinition> = emptyList(),
    val statuses: List<StatusOption> = emptyList(),
    val defaultStatus: String = "submitted",
    val allowFileAttachments: Boolean = true,
    val allowCaseConversion: Boolean = false,
    val mobileOptimized: Boolean = false,
    val isArchived: Boolean = false,
)

/**
 * A field within a report type template.
 *
 * Drives dynamic form rendering — each field type maps to a Compose widget
 * (OutlinedTextField, ExposedDropdownMenuBox, FilterChip row, Checkbox, DatePicker).
 */
@Serializable
data class ReportFieldDefinition(
    val id: String,
    val name: String,
    val label: String,
    val type: String, // text, textarea, number, select, multiselect, checkbox, date, file
    val required: Boolean = false,
    val options: List<FieldOption>? = null,
    val section: String? = null,
    val helpText: String? = null,
    val order: Int = 0,
    val accessLevel: String = "all",
    val supportAudioInput: Boolean = false,
)

/**
 * An option within a select or multiselect field.
 */
@Serializable
data class FieldOption(
    val value: String,
    val label: String,
)

/**
 * A status option for a report type's workflow.
 */
@Serializable
data class StatusOption(
    val value: String,
    val label: String,
    val color: String? = null,
)

/**
 * API response for GET /api/settings/cms/report-types.
 *
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
