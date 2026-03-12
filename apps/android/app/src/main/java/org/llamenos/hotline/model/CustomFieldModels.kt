package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * Admin-defined custom field definition for notes.
 *
 * Custom fields allow organizations to capture structured data alongside
 * free-text notes. The [type] determines the input widget:
 * - "text" -> single-line text field
 * - "number" -> numeric input
 * - "select" -> dropdown with [options]
 * - "checkbox" -> toggle switch
 * - "textarea" -> multi-line text area
 * - "file" -> file attachment (not yet implemented on mobile)
 *
 * [context] determines where the field appears (e.g., "note", "call").
 *
 * Note: The generated CustomFieldResponse covers the API response shape.
 * This client type extends it with additional client-specific fields
 * (id, validation, editableByVolunteers) for local UI usage.
 */
@Serializable
data class CustomFieldDefinition(
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
