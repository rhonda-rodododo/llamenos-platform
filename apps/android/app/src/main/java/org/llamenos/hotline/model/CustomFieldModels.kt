package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * Client-side custom field definition with String type/context fields.
 *
 * The generated CustomFieldDefinition (org.llamenos.protocol.CustomFieldDefinition)
 * uses enum types (Context, CustomFieldDefinitionType) and has different field names
 * (editableByUsers vs editableByVolunteers). This client type uses String for the
 * type and context fields to simplify UI construction.
 *
 * Renamed from CustomFieldDefinition to CustomFieldDef to avoid collision with
 * the generated type.
 */
@Serializable
data class CustomFieldDef(
    val id: String,
    val name: String,
    val label: String,
    val type: String,
    val required: Boolean,
    val options: List<String>? = null,
    val validation: FieldValidation? = null,
    val visibleToVolunteers: Boolean,
    val editableByVolunteers: Boolean,
    val context: String,
    val order: Int,
)

/**
 * Optional validation constraints for custom fields.
 */
@Serializable
data class FieldValidation(
    val minLength: Int? = null,
    val maxLength: Int? = null,
    val min: Int? = null,
    val max: Int? = null,
)
