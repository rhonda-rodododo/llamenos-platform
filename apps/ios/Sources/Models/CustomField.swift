import Foundation

// MARK: - CustomFieldDefinition
// Client-only: generated `ProtocolCustomFieldDefinition` uses `CustomFieldDefinitionType`
// for type, `Context` for context, `Double` for order/maxFiles/maxFileSize, and
// `editableByUsers`/`visibleToUsers` (vs our `editableByVolunteers`/`visibleToVolunteers`).
// Uses nested enums for type safety.

/// Definition of a custom field attached to notes, matching the protocol spec (Appendix B).
/// Fetched from `GET /api/settings/custom-fields`.
struct CustomFieldDefinition: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let label: String
    let type: FieldType
    let required: Bool
    let options: [String]?
    let validation: FieldValidation?
    let visibleToVolunteers: Bool
    let editableByVolunteers: Bool
    let context: FieldContext
    let allowFileUpload: Bool?
    let acceptedFileTypes: [String]?
    let order: Int
    let createdAt: String?

    // MARK: - FieldType
    // Client-only: generated `CustomFieldDefinitionType` has same cases plus `file`
    // and `location`. This client enum is a subset for custom field forms.

    enum FieldType: String, Codable, Sendable {
        case text
        case number
        case select
        case checkbox
        case textarea
    }

    // MARK: - FieldContext
    // Client-only: generated `Context` enum has `all`, `callNotes`, `conversationNotes`,
    // `reports`. This client enum uses `both` instead of `all`.

    enum FieldContext: String, Codable, Sendable {
        case callNotes = "call-notes"
        case reports
        case both
    }

    // MARK: - FieldValidation

    struct FieldValidation: Codable, Sendable {
        let minLength: Int?
        let maxLength: Int?
        let min: Int?
        let max: Int?
    }
}

// MARK: - CustomFieldsResponse

/// API response from `GET /api/settings/custom-fields`.
struct CustomFieldsResponse: Codable, Sendable {
    let fields: [CustomFieldDefinition]
}
