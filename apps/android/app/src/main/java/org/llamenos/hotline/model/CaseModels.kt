package org.llamenos.hotline.model

import kotlinx.serialization.Serializable
import org.llamenos.protocol.AssignBody
import org.llamenos.protocol.CreateInteractionBody
import org.llamenos.protocol.CreateRecordBody
import org.llamenos.protocol.Evidence
import org.llamenos.protocol.Interaction
import org.llamenos.protocol.Record
import org.llamenos.protocol.RecordContact
import org.llamenos.protocol.UpdateRecordBody

// ── Type aliases for codegen types with different names ──────────────────────

typealias CaseRecord = Record
typealias EvidenceItem = Evidence
typealias AssignRecordRequest = AssignBody
typealias CreateRecordRequest = CreateRecordBody
typealias UpdateRecordRequest = UpdateRecordBody
typealias CreateInteractionRequest = CreateInteractionBody

// ── Entity type definitions ─────────────────────────────────────────────────
// The generated EntityTypeDefinition uses enum types (CreateEntityTypeBodyCategoryEnum,
// DefaultAccessLevel, AccessLevel) and Long for order. These client types use
// String for enums and Int for order for simpler UI construction.

@Serializable
data class EntityTypeDefinition(
    val id: String,
    val hubId: String = "",
    val name: String = "",
    val label: String = "",
    val labelPlural: String = "",
    val description: String = "",
    val icon: String? = null,
    val color: String? = null,
    val category: String = "case",
    val templateId: String? = null,
    val templateVersion: String? = null,
    val fields: List<EntityFieldDefinition> = emptyList(),
    val statuses: List<EnumOption> = emptyList(),
    val defaultStatus: String = "",
    val closedStatuses: List<String> = emptyList(),
    val severities: List<EnumOption>? = null,
    val defaultSeverity: String? = null,
    val contactRoles: List<EnumOption>? = null,
    val numberPrefix: String? = null,
    val numberingEnabled: Boolean = false,
    val defaultAccessLevel: String = "assigned",
    val piiFields: List<String> = emptyList(),
    val allowSubRecords: Boolean = false,
    val allowFileAttachments: Boolean = true,
    val allowInteractionLinks: Boolean = true,
    val showInNavigation: Boolean = true,
    val showInDashboard: Boolean = false,
    val isArchived: Boolean = false,
    val isSystem: Boolean = false,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class EnumOption(
    val value: String,
    val label: String,
    val color: String? = null,
    val icon: String? = null,
    val order: Int = 0,
    val isDefault: Boolean? = null,
    val isClosed: Boolean? = null,
    val isDeprecated: Boolean? = null,
)

@Serializable
data class EntityFieldDefinition(
    val id: String = "",
    val name: String = "",
    val label: String = "",
    val type: String = "text",
    val required: Boolean = false,
    val section: String? = null,
    val helpText: String? = null,
    val order: Int = 0,
    val accessLevel: String = "all",
)

// ── API Response Wrappers ───────────────────────────────────────────────────

@Serializable
data class RecordsListResponse(
    val records: List<Record>,
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val hasMore: Boolean = false,
)

@Serializable
data class EntityTypesResponse(
    val entityTypes: List<EntityTypeDefinition>,
)

@Serializable
data class InteractionsResponse(
    val interactions: List<Interaction>,
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val hasMore: Boolean = false,
)

@Serializable
data class RecordContactsResponse(
    val contacts: List<RecordContact>,
)

@Serializable
data class AssignResponse(
    val assignedTo: List<String>,
)
