package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

// ---- Re-exports of generated types ----

/**
 * Re-export generated BulkBanBody from protocol package.
 */
typealias BulkBanRequest = org.llamenos.protocol.BulkBanBody


// ---- System Health ----
// The generated SystemHealthResponse and nested types (Server, Service, Calls, Storage,
// Backup, Volunteers) use ServerStatus enum, Double for numeric fields, and different
// nullability from the client types below. Keeping client-specific types to avoid
// cascading UI changes (StatusBadge expects String, formatUptime expects Int, etc.).

/**
 * Aggregate system health response from GET /api/system/health.
 * Client-only composite type — not in the generated API surface.
 */
@Serializable
data class SystemHealth(
    val server: ServerHealth,
    val services: List<ServiceStatus>,
    val calls: CallMetrics,
    val storage: StorageInfo,
    val backup: BackupInfo,
    val volunteers: UserInfo,
    val timestamp: String,
)

@Serializable
data class ServerHealth(
    val status: String,
    val uptime: Int,
    val version: String,
)

@Serializable
data class ServiceStatus(
    val name: String,
    val status: String,
    val details: String? = null,
)

@Serializable
data class CallMetrics(
    val today: Int,
    val active: Int,
    val avgResponseSeconds: Int,
    val missed: Int,
)

@Serializable
data class StorageInfo(
    val dbSize: String,
    val blobStorage: String,
)

@Serializable
data class BackupInfo(
    val lastBackup: String?,
    val backupSize: String,
    val lastVerify: String?,
)

@Serializable
data class UserInfo(
    val totalActive: Int,
    val onlineNow: Int,
    val onShift: Int,
    val shiftCoverage: Int,
)

// ---- Client-specific types ----

/**
 * A user registered in the system.
 *
 * Client-specific type for admin views. The generated UserResponse
 * (org.llamenos.protocol.UserResponse) has a different shape optimized
 * for the API response (uses pubkey-based identity, roles as List<String>,
 * has callPreference/spokenLanguages/etc.). This type uses UI-friendly
 * field names (id, displayName, role as singular String, status).
 */
@Serializable
data class User(
    val id: String,
    val pubkey: String,
    val displayName: String? = null,
    val role: String,
    val status: String,
    val createdAt: String,
)

/**
 * Paginated response from GET /api/users.
 */
@Serializable
data class UsersListResponse(
    val users: List<User>,
    val total: Int,
)

/**
 * A ban list entry for the client.
 * The generated BanResponse/Ban uses 'phone', 'bannedBy', 'bannedAt' fields
 * while this client type uses 'identifierHash', 'createdBy', 'createdAt'.
 */
@Serializable
data class BanEntry(
    val id: String,
    val identifierHash: String,
    val reason: String? = null,
    val createdBy: String,
    val createdAt: String,
)

/**
 * Paginated response from GET /api/admin/bans.
 * The generated BanListResponse has bans: List<Ban> without pagination.
 */
@Serializable
data class BanListResponse(
    val bans: List<BanEntry>,
    val total: Int,
)

/**
 * Request body for adding a ban via POST /api/admin/bans.
 * Client-specific shape — the generated CreateBanBody uses `phone`
 * instead of `identifier`.
 */
@Serializable
data class AddBanRequest(
    val identifier: String,
    val reason: String? = null,
)

/**
 * A hash-chained audit log entry.
 *
 * Client-specific shape with field names matching the UI. The generated
 * AuditEntryResponse uses `event` and `createdAt` instead of `action`
 * and `timestamp`, and uses JsonObject? for details instead of String?.
 */
@Serializable
data class AuditEntry(
    val id: String,
    val action: String,
    val actorPubkey: String,
    val details: String? = null,
    val entryHash: String,
    val previousEntryHash: String? = null,
    val timestamp: String,
)

/**
 * Paginated response from GET /api/admin/audit.
 * The generated AuditListResponse uses Double for pagination fields.
 */
@Serializable
data class AuditLogResponse(
    val entries: List<AuditEntry>,
    val total: Int,
    val page: Int,
)

/**
 * An invite code for onboarding new volunteers.
 * Client-specific shape — the generated InviteResponse has different
 * field names (usedBy instead of claimedBy, roleIDS instead of role,
 * and includes name/phone fields not in the client type).
 */
@Serializable
data class Invite(
    val id: String,
    val code: String,
    val role: String,
    val createdBy: String,
    val claimedBy: String? = null,
    val expiresAt: String,
    val createdAt: String,
)

/**
 * Paginated response from GET /api/admin/invites.
 */
@Serializable
data class InvitesListResponse(
    val invites: List<Invite>,
    val total: Int,
)

/**
 * Request body for creating an invite.
 * Client-specific shape — the generated CreateInviteBody requires
 * name, phone, and roleIDS (List<String>) while this only needs role.
 */
@Serializable
data class CreateInviteRequest(
    val role: String,
)

// ---- User CRUD ----

/**
 * Request body for creating a user via POST /api/users.
 * Client-specific shape — the generated CreateUserBody has many more
 * fields (pubkey, encryptedSecretKey, specializations, etc.).
 */
@Serializable
data class CreateUserRequest(
    val name: String,
    val phone: String,
    val role: String = "role-volunteer",
)

/**
 * Response from creating a user. Contains the user data
 * and a one-time nsec that must be given to the user.
 * Client-only type — no generated equivalent.
 */
@Serializable
data class CreateUserResponse(
    val user: User,
    val nsec: String,
)

// ---- Shift Admin ----

/**
 * Request body for creating/updating a shift.
 * Client-specific shape — the generated CreateShiftBody uses different
 * field names (volunteerPubkeys instead of volunteerIds) and types
 * (List<Long> instead of List<Int> for days).
 */
@Serializable
data class CreateShiftRequest(
    val name: String,
    val startTime: String,
    val endTime: String,
    val days: List<Int> = listOf(1, 2, 3, 4, 5),
    val volunteerIds: List<String> = emptyList(),
)

/**
 * Detailed shift response including volunteer list (admin view).
 */
@Serializable
data class AdminShiftDetail(
    val id: String,
    val name: String,
    val startTime: String,
    val endTime: String,
    val days: List<Int> = emptyList(),
    val volunteers: List<User> = emptyList(),
    val volunteerCount: Int = 0,
)

/**
 * Response from GET /api/admin/shifts listing all shifts (admin view).
 */
@Serializable
data class AdminShiftsListResponse(
    val shifts: List<AdminShiftDetail>,
)

/**
 * Request to set the fallback ring group.
 * Client-specific shape — the generated FallbackGroup uses
 * volunteerPubkeys instead of volunteerIds.
 */
@Serializable
data class FallbackGroupRequest(
    val volunteerIds: List<String>,
)

// ---- Custom Fields ----

/**
 * Response from GET /api/admin/custom-fields.
 */
@Serializable
data class CustomFieldsResponse(
    val fields: List<CustomFieldDefinition>,
)

/**
 * Request body for updating all custom fields via PUT /api/admin/custom-fields.
 */
@Serializable
data class UpdateCustomFieldsRequest(
    val fields: List<CustomFieldDefinition>,
)

// ---- Report Categories (Settings) ----

/**
 * A report category with an ID and name, managed via admin settings.
 */
@Serializable
data class ReportCategory(
    val id: String,
    val name: String,
    val createdAt: String? = null,
)

/**
 * Response from GET /api/settings/report-types.
 */
@Serializable
data class ReportTypesResponse(
    val categories: List<ReportCategory>,
)

/**
 * Request body for POST /api/settings/report-types.
 */
@Serializable
data class CreateReportCategoryRequest(
    val name: String,
)

// ---- Telephony Settings ----

/**
 * Request body for PUT /api/settings/telephony.
 * Client-specific simplified shape — the generated TelephonyProvider
 * supports multiple providers with many more fields.
 */
@Serializable
data class TelephonySettingsRequest(
    val provider: String,
    val accountSid: String,
    val authToken: String,
    val phoneNumber: String,
)

/**
 * Response from GET /api/settings/telephony.
 * Client-specific simplified shape — the generated TelephonyProvider
 * is a union type for all provider configurations.
 */
@Serializable
data class TelephonySettingsResponse(
    val provider: String = "twilio",
    val accountSid: String = "",
    val authToken: String = "",
    val phoneNumber: String = "",
)

// ---- Call Settings ----

/**
 * Request body for PUT /api/settings/call.
 * Client-specific shape — the generated CallSettings uses Long and
 * has different field names (queueTimeoutSeconds, voicemailMaxSeconds).
 */
@Serializable
data class CallSettingsRequest(
    val ringTimeout: Int,
    val maxCallDuration: Int,
    val parallelRingCount: Int,
)

/**
 * Response from GET /api/settings/call.
 * Client-specific shape — the generated CallSettings has different
 * field names and optional fields.
 */
@Serializable
data class CallSettingsResponse(
    val ringTimeout: Int = 30,
    val maxCallDuration: Int = 60,
    val parallelRingCount: Int = 3,
)

// ---- IVR Language Settings ----

/**
 * Request body for PUT /api/settings/ivr-languages.
 * Client-specific shape — uses Map<String, Boolean> for toggle state.
 * The generated IvrLanguages uses languages: List<String>? for enabled languages.
 */
@Serializable
data class IvrLanguagesRequest(
    val languages: Map<String, Boolean>,
)

/**
 * Response from GET /api/settings/ivr-languages.
 * Client-specific shape — uses Map<String, Boolean> for toggle state.
 */
@Serializable
data class IvrLanguagesResponse(
    val languages: Map<String, Boolean> = emptyMap(),
)

// ---- Spam Settings ----

/**
 * Request body for PUT /api/settings/spam.
 * Client-specific shape — uses Int and different field names from the
 * generated SpamSettings (which uses Long? and different naming).
 */
@Serializable
data class SpamSettingsRequest(
    val maxCallsPerHour: Int,
    val voiceCaptchaEnabled: Boolean,
    val knownNumberBypass: Boolean,
)

/**
 * Response from GET /api/settings/spam.
 * Client-specific shape with non-nullable defaults.
 */
@Serializable
data class SpamSettingsResponse(
    val maxCallsPerHour: Int = 10,
    val voiceCaptchaEnabled: Boolean = false,
    val knownNumberBypass: Boolean = true,
)
