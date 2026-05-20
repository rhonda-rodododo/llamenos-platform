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
// These are now imported directly from the protocol-generated types.
// EntityTypeDefinition is re-exported from org.llamenos.protocol.
// EntityFieldDefinition is aliased to EntityTypeDefinitionField for backward compat.

typealias EntityTypeDefinition = org.llamenos.protocol.EntityTypeDefinition
typealias EntityFieldDefinition = org.llamenos.protocol.SharedEntityTypeDefinitionField

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
