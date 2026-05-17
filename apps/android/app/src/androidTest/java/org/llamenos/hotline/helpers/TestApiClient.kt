package org.llamenos.hotline.helpers

import android.util.Base64
import android.util.Log
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/**
 * Real API client for E2E test data seeding.
 *
 * Authenticates via Ed25519 bearer tokens (dev-mode bypass) and calls
 * real API endpoints — the same code path as production. Replaces backdoor
 * `test-*` endpoints for CMS setup, shift creation, and hub membership.
 *
 * In ENVIRONMENT=development, the backend's auth middleware accepts any
 * registered pubkey with a valid token format (pubkey + timestamp + any
 * token string). The dev-mode bypass only requires:
 * 1. A registered pubkey in the database
 * 2. A valid token format (pubkey + timestamp + any 128-char hex string)
 * 3. Token freshness within 5 minutes
 */
class TestApiClient(
    private val baseUrl: String,
    private val testSecret: String,
) {
    companion object {
        private const val TAG = "TestApiClient"
        private const val CONNECT_TIMEOUT_MS = 30_000
        private const val READ_TIMEOUT_MS = 30_000

        private val json = Json { ignoreUnknownKeys = true }

        /**
         * Bootstrap an admin-authenticated TestApiClient.
         *
         * Registers the admin identity via test-secret (one-time bootstrap),
         * then uses real Ed25519 auth for all subsequent calls. Same pattern
         * as backend BDD tests' api-helpers.ts.
         *
         * @param baseUrl The hub base URL (e.g. http://192.168.50.95:3000)
         * @param testSecret The E2E test secret for bootstrap endpoints
         * @param hubId The hub to register the admin in
         * @param adminPubkey The admin's signing pubkey hex
         */
        fun bootstrapAdmin(
            baseUrl: String,
            testSecret: String,
            hubId: String,
            adminPubkey: String,
        ): TestApiClient {
            val client = TestApiClient(baseUrl, testSecret)

            // Register admin via test-secret (bootstrap — before auth is possible)
            SimulationClient.registerTestIdentity(
                pubkey = adminPubkey,
                hubId = hubId,
                role = "role-admin",
            )

            client.adminPubkeyHex = adminPubkey
            Log.i(TAG, "Admin bootstrapped: ${adminPubkey.take(16)}... in hub $hubId")
            return client
        }
    }

    // ─── Auth State ────────────────────────────────────────────────────

    /** The admin pubkey used for authenticated API calls. */
    var adminPubkeyHex: String? = null
        private set

    /**
     * Set the admin identity for authenticated API calls.
     * Must be a pubkey already registered in the database.
     */
    fun setAdminIdentity(pubkey: String) {
        adminPubkeyHex = pubkey
    }

    // ─── Response Types ────────────────────────────────────────────────

    @Serializable
    data class EntityTypeResponse(
        val id: String = "",
        val name: String = "",
        val category: String = "",
        val defaultStatus: String = "",
    )

    @Serializable
    data class EntityTypeListResponse(
        val entityTypes: List<EntityTypeResponse> = emptyList(),
    )

    @Serializable
    data class RecordResponse(
        val id: String = "",
    )

    @Serializable
    data class ReportTypeResponse(
        val id: String = "",
        val name: String = "",
    )

    @Serializable
    data class ReportTypeListResponse(
        val reportTypes: List<ReportTypeResponse> = emptyList(),
    )

    @Serializable
    data class ConversationResponse(
        val id: String = "",
    )

    @Serializable
    data class CmsSetupResult(
        val ok: Boolean = false,
        val entityTypeCount: Int = 0,
        val sampleRecordId: String? = null,
    )

    // ─── HTTP Helpers ──────────────────────────────────────────────────

    /**
     * Build the Authorization header for dev-mode bypass.
     *
     * Format: Bearer {"pubkey":"...","timestamp":...,"token":"..."}
     * In development mode, the backend accepts any 128-char hex token
     * for registered pubkeys (signature verification is bypassed).
     */
    private fun buildAuthHeader(): String {
        val pubkey = adminPubkeyHex
            ?: throw IllegalStateException("No admin identity set — call bootstrapAdmin first")
        val timestamp = System.currentTimeMillis()
        // Dev-mode bypass: dummy 128-char hex signature
        val token = "0".repeat(128)
        return """Bearer {"pubkey":"$pubkey","timestamp":$timestamp,"token":"$token"}"""
    }

    /**
     * Authenticated GET request.
     */
    fun authGet(path: String): String {
        return request("GET", path, body = null, useAuth = true)
    }

    /**
     * Authenticated POST request with JSON body.
     */
    fun authPost(path: String, body: String): String {
        return request("POST", path, body, useAuth = true)
    }

    /**
     * Authenticated PATCH request with JSON body.
     */
    fun authPatch(path: String, body: String): String {
        return request("PATCH", path, body, useAuth = true)
    }

    /**
     * Authenticated PUT request with JSON body.
     */
    fun authPut(path: String, body: String): String {
        return request("PUT", path, body, useAuth = true)
    }

    /**
     * Authenticated DELETE request.
     */
    fun authDelete(path: String): String {
        return request("DELETE", path, body = null, useAuth = true)
    }

    /**
     * Test-secret POST (for simulation endpoints that remain).
     */
    fun testPost(path: String, body: String): String {
        return request("POST", path, body, useAuth = false)
    }

    /**
     * Core HTTP request method with auth or test-secret headers.
     */
    private fun request(
        method: String,
        path: String,
        body: String?,
        useAuth: Boolean,
    ): String {
        val url = URL("$baseUrl$path")
        Log.d(TAG, "$method $url")

        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.setRequestProperty("Content-Type", "application/json")

            if (useAuth) {
                conn.setRequestProperty("Authorization", buildAuthHeader())
            } else {
                conn.setRequestProperty("X-Test-Secret", testSecret)
            }

            if (body != null) {
                conn.doOutput = true
                conn.outputStream.use { os ->
                    os.write(body.toByteArray(Charsets.UTF_8))
                }
            }

            val code = conn.responseCode
            val responseBody = if (code in 200..299) {
                conn.inputStream.bufferedReader().use { it.readText() }
            } else {
                val errorBody = try {
                    conn.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                } catch (_: IOException) { "" }
                Log.e(TAG, "$method $path returned HTTP $code: $errorBody")
                throw SimulationException("$method $path failed with HTTP $code: $errorBody")
            }

            Log.d(TAG, "Response ($code): ${responseBody.take(500)}")
            return responseBody
        } finally {
            conn.disconnect()
        }
    }

    // ─── CMS Seeding Methods ──────────────────────────────────────────

    /**
     * Enable case management for the given hub (or globally).
     * Endpoint: PUT /api/hubs/{hubId}/settings/cms/case-management
     */
    fun enableCaseManagement(hubId: String) {
        val path = if (hubId.isNotEmpty()) {
            "/api/hubs/$hubId/settings/cms/case-management"
        } else {
            "/api/settings/cms/case-management"
        }
        authPut(path, """{"enabled":true}""")
        // Also enable globally so non-hub-scoped checks pass
        if (hubId.isNotEmpty()) {
            try {
                authPut("/api/settings/cms/case-management", """{"enabled":true}""")
            } catch (e: Exception) {
                Log.w(TAG, "Global CMS enable failed (non-fatal): ${e.message}")
            }
        }
    }

    /**
     * Grant the volunteer role full CMS permissions.
     * Endpoint: PATCH /api/settings/roles/role-volunteer
     */
    fun grantVolunteerCmsPermissions() {
        val permissions = """
            ["calls:answer","calls:read-active",
            "notes:create","notes:read-own","notes:update-own","notes:reply",
            "conversations:claim","conversations:send","conversations:read-assigned",
            "conversations:claim-sms","conversations:claim-whatsapp",
            "conversations:claim-signal","conversations:claim-rcs","conversations:claim-web",
            "shifts:read-own","bans:report",
            "reports:read-all","reports:read-assigned","reports:send-message",
            "files:upload","files:download-own",
            "cases:create","cases:read-all","cases:update","cases:assign",
            "events:read","events:create","evidence:upload","evidence:download",
            "hubs:read","settings:read",
            "hubs:configure","telephony:view-providers"]
        """.trimIndent().replace("\n", "")
        authPatch("/api/settings/roles/role-volunteer", """{"permissions":$permissions}""")
    }

    /**
     * Create an entity type in the given hub.
     * Endpoint: POST /api/hubs/{hubId}/settings/cms/entity-types
     */
    fun createEntityType(hubId: String, entityTypeJson: String): EntityTypeResponse {
        val path = if (hubId.isNotEmpty()) {
            "/api/hubs/$hubId/settings/cms/entity-types"
        } else {
            "/api/settings/cms/entity-types"
        }
        return try {
            val response = authPost(path, entityTypeJson)
            json.decodeFromString<EntityTypeResponse>(response)
        } catch (e: Exception) {
            // Ignore duplicates — entity type may already exist in this hub
            Log.w(TAG, "createEntityType failed (may be duplicate): ${e.message}")
            EntityTypeResponse()
        }
    }

    /**
     * Get entity types for a hub.
     * Endpoint: GET /api/hubs/{hubId}/settings/cms/entity-types
     */
    fun getEntityTypes(hubId: String): List<EntityTypeResponse> {
        val path = if (hubId.isNotEmpty()) {
            "/api/hubs/$hubId/settings/cms/entity-types"
        } else {
            "/api/settings/cms/entity-types"
        }
        val response = authGet(path)
        return json.decodeFromString<EntityTypeListResponse>(response).entityTypes
    }

    /**
     * Create a case/event record.
     * Endpoint: POST /api/hubs/{hubId}/records
     */
    fun createRecord(
        hubId: String,
        entityTypeId: String,
        statusHash: String,
        assignedTo: List<String> = emptyList(),
        isEvent: Boolean = false,
    ): RecordResponse {
        val pubkey = adminPubkeyHex ?: ""
        val summaryContent = if (isEvent) {
            """{"title":"Test Event","summary":"BDD test event"}"""
        } else {
            """{"title":"Test Case","summary":"BDD test case"}"""
        }
        val encryptedSummary = Base64.encodeToString(
            summaryContent.toByteArray(Charsets.UTF_8),
            Base64.NO_WRAP,
        )
        // Dummy HPKE envelope — backend accepts structure without content validation
        val envelope = """{"pubkey":"$pubkey","ct":"${"a".repeat(64)}","enc":"$pubkey"}"""
        val assignedToJson = assignedTo.joinToString(",") { "\"$it\"" }

        val body = """{
            "entityTypeId":"$entityTypeId",
            "statusHash":"$statusHash",
            "assignedTo":[$assignedToJson],
            "blindIndexes":{},
            "encryptedSummary":"$encryptedSummary",
            "summaryEnvelopes":[$envelope]
        }""".trimIndent().replace("\n", "")

        val path = if (hubId.isNotEmpty()) {
            "/api/hubs/$hubId/records"
        } else {
            "/api/records"
        }
        val response = authPost(path, body)
        return json.decodeFromString<RecordResponse>(response)
    }

    /**
     * Create a report type.
     * Endpoint: POST /api/hubs/{hubId}/settings/cms/report-types
     */
    fun createReportType(hubId: String, reportTypeJson: String): ReportTypeResponse {
        val path = if (hubId.isNotEmpty()) {
            "/api/hubs/$hubId/settings/cms/report-types"
        } else {
            "/api/settings/cms/report-types"
        }
        return try {
            val response = authPost(path, reportTypeJson)
            json.decodeFromString<ReportTypeResponse>(response)
        } catch (e: Exception) {
            Log.w(TAG, "createReportType failed (may be duplicate): ${e.message}")
            // Try to find existing
            try {
                val listPath = if (hubId.isNotEmpty()) {
                    "/api/hubs/$hubId/settings/cms/report-types"
                } else {
                    "/api/settings/cms/report-types"
                }
                val listResponse = authGet(listPath)
                val list = json.decodeFromString<ReportTypeListResponse>(listResponse)
                list.reportTypes.firstOrNull { it.name == "general_report" } ?: ReportTypeResponse()
            } catch (_: Exception) {
                ReportTypeResponse()
            }
        }
    }

    /**
     * Create a triage-eligible report (conversation with report metadata).
     * Endpoint: POST /api/hubs/{hubId}/reports
     *
     * The triage queue filters by reportTypeId matching a report type with
     * allowCaseConversion=true. Creating a report with that reportTypeId
     * makes it visible in the triage queue.
     */
    fun createTriageReport(hubId: String, reportTypeId: String?): String? {
        val pubkey = adminPubkeyHex ?: ""
        val envelope = """{"pubkey":"$pubkey","ct":"${"a".repeat(64)}","enc":"$pubkey"}"""
        val encryptedContent = Base64.encodeToString(
            """{"text":"Test triage report content"}""".toByteArray(Charsets.UTF_8),
            Base64.NO_WRAP,
        )

        val reportTypeField = if (reportTypeId != null) {
            ""","reportTypeId":"$reportTypeId""""
        } else ""

        val body = """{
            "title":"Test Triage Report",
            "category":"general"$reportTypeField,
            "encryptedContent":"$encryptedContent",
            "readerEnvelopes":[$envelope]
        }""".trimIndent().replace("\n", "")

        val path = if (hubId.isNotEmpty()) {
            "/api/hubs/$hubId/reports"
        } else {
            "/api/reports"
        }

        return try {
            val response = authPost(path, body)
            val conv = json.decodeFromString<ConversationResponse>(response)
            conv.id
        } catch (e: Exception) {
            Log.w(TAG, "createTriageReport failed: ${e.message}")
            null
        }
    }

    /**
     * Composite: set up CMS via real API calls.
     * Replaces SimulationClient.setupCms() with the same sequence.
     *
     * Steps:
     * 0. Grant volunteer role CMS permissions
     * 1. Enable case management
     * 2. Create entity types (arrest_case + protest_event)
     * 3. Fetch entity types
     * 4. Create sample records per entity type
     * 5. Create report type (general_report with allowCaseConversion)
     * 6. Create triage report
     */
    fun setupCmsViaApi(pubkey: String? = null, hubId: String): CmsSetupResult {
        Log.i(TAG, "setupCmsViaApi: pubkey=${pubkey?.take(16)}, hubId=$hubId")

        // Step 0: Grant volunteer CMS permissions
        try {
            grantVolunteerCmsPermissions()
        } catch (e: Exception) {
            Log.w(TAG, "grantVolunteerCmsPermissions failed: ${e.message}")
        }

        // Step 1: Enable case management
        try {
            enableCaseManagement(hubId)
        } catch (e: Exception) {
            Log.w(TAG, "enableCaseManagement failed: ${e.message}")
        }

        // Step 2: Create entity types
        val arrestCaseJson = buildArrestCaseEntityType()
        createEntityType(hubId, arrestCaseJson)

        val protestEventJson = buildProtestEventEntityType()
        createEntityType(hubId, protestEventJson)

        // Step 3: Fetch entity types
        val entityTypes = try {
            getEntityTypes(hubId)
        } catch (e: Exception) {
            Log.w(TAG, "getEntityTypes failed: ${e.message}")
            emptyList()
        }

        // Step 4: Create sample records per entity type
        var sampleRecordId: String? = null
        val assignedTo = if (pubkey != null) listOf(pubkey) else emptyList()
        for (et in entityTypes) {
            if (et.id.isEmpty()) continue
            try {
                val record = createRecord(
                    hubId = hubId,
                    entityTypeId = et.id,
                    statusHash = et.defaultStatus.ifEmpty {
                        if (et.category == "event") "planned" else "reported"
                    },
                    assignedTo = assignedTo,
                    isEvent = et.category == "event",
                )
                if (sampleRecordId == null && record.id.isNotEmpty()) {
                    sampleRecordId = record.id
                }
            } catch (e: Exception) {
                Log.w(TAG, "createRecord failed for ${et.name}: ${e.message}")
            }
        }

        // Step 5: Create report type
        val reportTypeJson = buildGeneralReportType()
        val reportType = createReportType(hubId, reportTypeJson)

        // Step 6: Create triage report
        val reportTypeId = reportType.id.ifEmpty { null }
        createTriageReport(hubId, reportTypeId)

        val result = CmsSetupResult(
            ok = true,
            entityTypeCount = entityTypes.size,
            sampleRecordId = sampleRecordId,
        )
        Log.i(TAG, "setupCmsViaApi complete: $result")
        return result
    }

    // ─── Shift Management ─────────────────────────────────────────────

    /**
     * Create a shift covering all days with the given volunteer.
     * Endpoint: POST /api/hubs/{hubId}/shifts
     */
    fun createShift(pubkey: String, hubId: String) {
        val shiftId = UUID.randomUUID().toString()
        // encryptedName is required — use a base64-encoded dummy value
        val encryptedName = Base64.encodeToString(
            "test-shift".toByteArray(Charsets.UTF_8),
            Base64.NO_WRAP,
        )
        val body = """{
            "id":"$shiftId",
            "encryptedName":"$encryptedName",
            "startTime":"00:00",
            "endTime":"23:59",
            "days":[0,1,2,3,4,5,6],
            "userPubkeys":["$pubkey"]
        }""".trimIndent().replace("\n", "")

        val path = if (hubId.isNotEmpty()) {
            "/api/hubs/$hubId/shifts"
        } else {
            "/api/shifts"
        }
        authPost(path, body)
        Log.d(TAG, "Created shift $shiftId for ${pubkey.take(16)}... in hub $hubId")
    }

    // ─── Hub Membership ───────────────────────────────────────────────

    /**
     * Add a user as a volunteer member of a hub.
     * Endpoint: POST /api/hubs/{hubId}/members
     */
    fun addHubMember(pubkey: String, hubId: String, x25519Pubkey: String? = null) {
        val body = """{"pubkey":"$pubkey","roleIds":["role-volunteer"]}"""
        val path = "/api/hubs/$hubId/members"
        authPost(path, body)
        Log.d(TAG, "Added ${pubkey.take(16)}... as member of hub $hubId")
    }

    // ─── Entity Type JSON Builders ────────────────────────────────────

    private fun buildArrestCaseEntityType(): String {
        val id = UUID.randomUUID().toString()
        val f1 = UUID.randomUUID().toString()
        val f2 = UUID.randomUUID().toString()
        val f3 = UUID.randomUUID().toString()
        return """{
            "id":"$id",
            "name":"arrest_case",
            "label":"Arrest Case",
            "labelPlural":"Arrest Cases",
            "description":"BDD test entity type",
            "category":"case",
            "color":"#ef4444",
            "statuses":[
                {"value":"reported","label":"Reported","color":"#f59e0b","order":1},
                {"value":"confirmed","label":"Confirmed","color":"#3b82f6","order":2},
                {"value":"in_custody","label":"In Custody","color":"#ef4444","order":3},
                {"value":"released","label":"Released","color":"#22c55e","order":4},
                {"value":"case_closed","label":"Case Closed","color":"#6b7280","order":5,"isClosed":true}
            ],
            "defaultStatus":"reported",
            "closedStatuses":["case_closed"],
            "fields":[
                {"id":"$f1","name":"arrest_datetime","label":"Arrest Date/Time","type":"date","required":true,"order":1,"accessLevel":"all","indexable":false,"indexType":"none","visibleToUsers":true,"editableByUsers":true,"hubEditable":true},
                {"id":"$f2","name":"location","label":"Location","type":"text","required":false,"order":2,"accessLevel":"all","indexable":false,"indexType":"none","visibleToUsers":true,"editableByUsers":true,"hubEditable":true},
                {"id":"$f3","name":"charges","label":"Charges","type":"textarea","required":false,"order":3,"accessLevel":"all","indexable":false,"indexType":"none","visibleToUsers":true,"editableByUsers":true,"hubEditable":true}
            ],
            "numberPrefix":"JS",
            "numberingEnabled":true
        }""".trimIndent().replace("\n", "")
    }

    private fun buildProtestEventEntityType(): String {
        val id = UUID.randomUUID().toString()
        val f1 = UUID.randomUUID().toString()
        val f2 = UUID.randomUUID().toString()
        return """{
            "id":"$id",
            "name":"protest_event",
            "label":"Protest Event",
            "labelPlural":"Protest Events",
            "description":"BDD test event entity type",
            "category":"event",
            "color":"#3b82f6",
            "statuses":[
                {"value":"planned","label":"Planned","color":"#f59e0b","order":1},
                {"value":"active","label":"Active","color":"#22c55e","order":2},
                {"value":"completed","label":"Completed","color":"#6b7280","order":3,"isClosed":true}
            ],
            "defaultStatus":"planned",
            "closedStatuses":["completed"],
            "fields":[
                {"id":"$f1","name":"event_date","label":"Event Date","type":"date","required":true,"order":1,"accessLevel":"all","indexable":false,"indexType":"none","visibleToUsers":true,"editableByUsers":true,"hubEditable":true},
                {"id":"$f2","name":"location","label":"Location","type":"text","required":false,"order":2,"accessLevel":"all","indexable":false,"indexType":"none","visibleToUsers":true,"editableByUsers":true,"hubEditable":true}
            ],
            "numberPrefix":"EVT",
            "numberingEnabled":true
        }""".trimIndent().replace("\n", "")
    }

    private fun buildGeneralReportType(): String {
        return """{
            "name":"general_report",
            "label":"General Report",
            "labelPlural":"General Reports",
            "description":"BDD test report type",
            "allowCaseConversion":true,
            "mobileOptimized":true,
            "statuses":[
                {"value":"new","label":"New","color":"#f59e0b","order":1},
                {"value":"reviewed","label":"Reviewed","color":"#3b82f6","order":2},
                {"value":"closed","label":"Closed","color":"#6b7280","order":3,"isClosed":true}
            ],
            "defaultStatus":"new",
            "closedStatuses":["closed"],
            "fields":[]
        }""".trimIndent().replace("\n", "")
    }
}
