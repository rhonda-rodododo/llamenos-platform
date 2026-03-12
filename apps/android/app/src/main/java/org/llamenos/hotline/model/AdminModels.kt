package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * A volunteer registered in the system.
 *
 * Client-specific type for admin views. The generated VolunteerResponse
 * (org.llamenos.protocol.VolunteerResponse) has a different shape optimized
 * for the API response. This type uses UI-friendly field names.
 */
@Serializable
data class Volunteer(
    val id: String,
    val pubkey: String,
    val displayName: String? = null,
    val role: String,
    val status: String,
    val createdAt: String,
)

/**
 * Paginated response from GET /api/admin/volunteers.
 */
@Serializable
data class VolunteersListResponse(
    val volunteers: List<Volunteer>,
    val total: Int,
)

/**
 * A ban list entry for the client.
 * Extends the generated BanResponse with client-specific field names.
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
 * and `timestamp`.
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
 * field names (usedBy instead of claimedBy, roleIDS instead of role).
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
 */
@Serializable
data class CreateInviteRequest(
    val role: String,
)

// ---- Volunteer CRUD ----

/**
 * Request body for creating a volunteer via POST /api/admin/volunteers.
 */
@Serializable
data class CreateVolunteerRequest(
    val name: String,
    val phone: String,
    val role: String = "role-volunteer",
)

/**
 * Response from creating a volunteer. Contains the volunteer data
 * and a one-time nsec that must be given to the volunteer.
 */
@Serializable
data class CreateVolunteerResponse(
    val volunteer: Volunteer,
    val nsec: String,
)

// ---- Bulk Ban Import ----

/**
 * Request body for bulk importing bans via POST /api/admin/bans/bulk.
 */
@Serializable
data class BulkBanRequest(
    val phones: List<String>,
    val reason: String? = null,
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
    val volunteers: List<Volunteer> = emptyList(),
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
 */
@Serializable
data class CallSettingsRequest(
    val ringTimeout: Int,
    val maxCallDuration: Int,
    val parallelRingCount: Int,
)

/**
 * Response from GET /api/settings/call.
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
 */
@Serializable
data class IvrLanguagesRequest(
    val languages: Map<String, Boolean>,
)

/**
 * Response from GET /api/settings/ivr-languages.
 */
@Serializable
data class IvrLanguagesResponse(
    val languages: Map<String, Boolean> = emptyMap(),
)

// ---- Spam Settings ----

/**
 * Request body for PUT /api/settings/spam.
 */
@Serializable
data class SpamSettingsRequest(
    val maxCallsPerHour: Int,
    val voiceCaptchaEnabled: Boolean,
    val knownNumberBypass: Boolean,
)

/**
 * Response from GET /api/settings/spam.
 */
@Serializable
data class SpamSettingsResponse(
    val maxCallsPerHour: Int = 10,
    val voiceCaptchaEnabled: Boolean = false,
    val knownNumberBypass: Boolean = true,
)

// ---- System Health ----

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
    val volunteers: VolunteerInfo,
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
data class VolunteerInfo(
    val totalActive: Int,
    val onlineNow: Int,
    val onShift: Int,
    val shiftCoverage: Int,
)
