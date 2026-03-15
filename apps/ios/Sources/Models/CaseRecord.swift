import Foundation

// MARK: - CaseRecord

/// A case record from the CMS — an encrypted, structured entity stored in CaseDO.
/// Summary tier is decryptable by assigned volunteers; fields/PII by admins only.
struct CaseRecord: Codable, Identifiable, Sendable {
    let id: String
    let hubId: String?
    let entityTypeId: String
    let caseNumber: String?
    let statusHash: String
    let severityHash: String?
    let categoryHash: String?
    let assignedTo: [String]
    let blindIndexes: [String: String]?
    let encryptedSummary: String?
    let summaryEnvelopes: [CaseEnvelope]?
    let encryptedFields: String?
    let fieldEnvelopes: [CaseEnvelope]?
    let encryptedPII: String?
    let piiEnvelopes: [CaseEnvelope]?
    let contactCount: Int?
    let interactionCount: Int?
    let fileCount: Int?
    let reportCount: Int?
    let eventIds: [String]?
    let reportIds: [String]?
    let parentRecordId: String?
    let createdAt: String
    let updatedAt: String
    let closedAt: String?
    let createdBy: String?
}

// MARK: - CaseEnvelope

/// ECIES envelope for a record reader (pubkey + wrapped symmetric key + ephemeral pubkey).
struct CaseEnvelope: Codable, Sendable {
    let pubkey: String
    let wrappedKey: String
    let ephemeralPubkey: String
}

// MARK: - EntityTypeDefinition

/// Template-driven schema defining a case type: fields, statuses, severities, numbering.
struct CaseEntityTypeDefinition: Codable, Identifiable, Sendable {
    let id: String
    let hubId: String?
    let name: String
    let label: String
    let labelPlural: String
    let description: String?
    let icon: String?
    let color: String?
    let category: String?
    let templateId: String?
    let templateVersion: String?
    let fields: [CaseFieldDefinition]
    let statuses: [CaseEnumOption]
    let defaultStatus: String
    let closedStatuses: [String]?
    let severities: [CaseEnumOption]?
    let defaultSeverity: String?
    let categories: [CaseEnumOption]?
    let contactRoles: [CaseEnumOption]?
    let numberPrefix: String?
    let numberingEnabled: Bool?
    let defaultAccessLevel: String?
    let piiFields: [String]?
    let allowSubRecords: Bool?
    let allowFileAttachments: Bool?
    let allowInteractionLinks: Bool?
    let showInNavigation: Bool?
    let showInDashboard: Bool?
    let accessRoles: [String]?
    let editRoles: [String]?
    let isArchived: Bool?
    let isSystem: Bool?
    let createdAt: String?
    let updatedAt: String?
}

// MARK: - CaseEnumOption

/// An option for status, severity, category, or contact role enums.
struct CaseEnumOption: Codable, Identifiable, Equatable, Sendable {
    let value: String
    let label: String
    let color: String?
    let icon: String?
    let order: Int?
    let isDefault: Bool?
    let isClosed: Bool?
    let isDeprecated: Bool?

    var id: String { value }
}

// MARK: - CaseFieldDefinition

/// A field within an entity type schema.
struct CaseFieldDefinition: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let label: String
    let type: String
    let required: Bool?
    let options: [CaseFieldOption]?
    let lookupId: String?
    let validation: CaseFieldValidation?
    let section: String?
    let helpText: String?
    let placeholder: String?
    let defaultValue: String?
    let order: Int?
    let indexable: Bool?
    let indexType: String?
    let accessLevel: String?
    let accessRoles: [String]?
    let visibleToVolunteers: Bool?
    let editableByVolunteers: Bool?
    let templateId: String?
    let hubEditable: Bool?

    var fieldType: CaseFieldType {
        CaseFieldType(rawValue: type) ?? .text
    }
}

/// Field type enum matching the protocol field types.
enum CaseFieldType: String, Sendable {
    case text, textarea, number, select, multiselect, checkbox, date, file
}

/// Key-label option for select/multiselect fields.
struct CaseFieldOption: Codable, Sendable {
    let key: String
    let label: String
}

/// Validation constraints for a field.
struct CaseFieldValidation: Codable, Sendable {
    let minLength: Int?
    let maxLength: Int?
    let min: Int?
    let max: Int?
    let pattern: String?
}

// CaseInteraction and Interaction are defined in the generated Types.swift (protocol codegen).
// Add Identifiable conformance for SwiftUI ForEach compatibility.
extension CaseInteraction: Identifiable {}
extension Interaction: Identifiable {}

// MARK: - RecordContact

/// A contact linked to a case record with a role.
struct RecordContact: Codable, Identifiable, Sendable {
    let contactId: String
    let role: String
    let addedAt: String?
    let addedBy: String?
    let encryptedSummary: String?
    let summaryEnvelopes: [CaseEnvelope]?

    var id: String { contactId }
}

// MARK: - EvidenceItem

/// Evidence metadata for a file attached to a case.
struct EvidenceItem: Codable, Identifiable, Sendable {
    let id: String
    let caseId: String
    let fileId: String
    let filename: String
    let mimeType: String
    let sizeBytes: Int?
    let classification: String
    let integrityHash: String
    let hashAlgorithm: String?
    let source: String?
    let sourceDescription: String?
    let encryptedDescription: String?
    let descriptionEnvelopes: [CaseEnvelope]?
    let uploadedAt: String
    let uploadedBy: String?
    let custodyEntryCount: Int?
}

// MARK: - API Response Wrappers

struct RecordsListResponse: Codable, Sendable {
    let records: [CaseRecord]
    let total: Int
    let page: Int?
    let limit: Int?
    let hasMore: Bool?
}

struct EntityTypesResponse: Codable, Sendable {
    let entityTypes: [CaseEntityTypeDefinition]
}

// InteractionsResponse and EvidenceListResponse are defined in generated Types.swift.

struct RecordContactsResponse: Codable, Sendable {
    let contacts: [RecordContact]
}

struct CaseManagementEnabledResponse: Codable, Sendable {
    let enabled: Bool
}

// MARK: - Request Bodies

struct UpdateRecordRequest: Codable, Sendable {
    let statusHash: String?
    let severityHash: String?
}

struct AssignRecordRequest: Codable, Sendable {
    let pubkeys: [String]
}

struct CreateInteractionRequest: Codable, Sendable {
    let interactionType: String
    let encryptedContent: String?
    let contentEnvelopes: [CaseEnvelope]?
    let interactionTypeHash: String
}
