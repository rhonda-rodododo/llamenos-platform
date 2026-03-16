package org.llamenos.hotline.model

import kotlinx.serialization.Serializable
import org.llamenos.protocol.AssignBody
import org.llamenos.protocol.CaseInteraction
import org.llamenos.protocol.CreateInteractionBody
import org.llamenos.protocol.CreateRecordBody
import org.llamenos.protocol.Evidence
import org.llamenos.protocol.EvidenceListResponse
import org.llamenos.protocol.Interaction
import org.llamenos.protocol.InteractionListResponse
import org.llamenos.protocol.Record
import org.llamenos.protocol.RecordContact
import org.llamenos.protocol.UpdateRecordBody

// ---- Type aliases for codegen types with different names ----

/** Alias: codegen [Record] corresponds to the old hand-written CaseRecord. */
typealias CaseRecord = Record

/** Alias: codegen [Evidence] corresponds to the old hand-written EvidenceItem. */
typealias EvidenceItem = Evidence

/** Alias: codegen [AssignBody] corresponds to the old hand-written AssignRecordRequest. */
typealias AssignRecordRequest = AssignBody

/** Alias: codegen [CreateRecordBody] corresponds to the old hand-written CreateRecordRequest. */
typealias CreateRecordRequest = CreateRecordBody

/** Alias: codegen [UpdateRecordBody] corresponds to the old hand-written UpdateRecordRequest. */
typealias UpdateRecordRequest = UpdateRecordBody

/** Alias: codegen [CreateInteractionBody] corresponds to the old hand-written CreateInteractionRequest. */
typealias CreateInteractionRequest = CreateInteractionBody

// ---- Re-exports of codegen types that share the same name ----
// These are re-exported so existing `import org.llamenos.hotline.model.X` imports continue to work.
// NOTE: Kotlin does not allow re-exporting via typealias when the alias name == original name
// in a different package. So consumers should import directly from org.llamenos.protocol instead.

// ---- Lenient entity type definition ----
// The codegen EntityTypeDefinition now has defaults on all fields (Epic 354: Zod schemas
// updated with .optional().default() + Kotlin post-processor enhanced for enum/SerialName defaults).
// These hand-written versions remain because they use simple String for enums (vs codegen's
// EntityCategory/DefaultAccessLevel enum classes) and Int for order (vs codegen's Long).
// A full migration would require updating all consuming screens to handle enum types.
// Future: migrate consuming code to use codegen types directly, then delete these.

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

// ---- API Response Wrappers ----
// These wrap codegen types for API response deserialization.
// The codegen does not generate paginated list wrappers for all endpoints.

/**
 * Paginated records list response from GET /api/records.
 */
@Serializable
data class RecordsListResponse(
    val records: List<Record>,
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val hasMore: Boolean = false,
)

/**
 * Entity types list response from GET /api/settings/cms/entity-types.
 */
@Serializable
data class EntityTypesResponse(
    val entityTypes: List<EntityTypeDefinition>,
)

/**
 * Interactions list response from GET /api/records/:id/interactions.
 * Uses the codegen [Interaction] type (the list response variant).
 */
@Serializable
data class InteractionsResponse(
    val interactions: List<Interaction>,
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val hasMore: Boolean = false,
)

/**
 * Contacts linked to a record from GET /api/records/:id/contacts.
 */
@Serializable
data class RecordContactsResponse(
    val contacts: List<RecordContact>,
)

/**
 * Response from POST /api/records/:id/assign and POST /api/records/:id/unassign.
 */
@Serializable
data class AssignResponse(
    val assignedTo: List<String>,
)
