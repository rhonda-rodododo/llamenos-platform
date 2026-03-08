package org.llamenos.hotline

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.llamenos.hotline.crypto.KeyValueStore
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Privacy-first crash reporter that captures uncaught exceptions to app-private storage
 * and optionally uploads them to a GlitchTip/Sentry-compatible endpoint.
 *
 * Key privacy guarantees:
 * - Crash reporting is strictly opt-in — user must explicitly consent.
 * - No PII is ever included in crash reports (no user IDs, keys, names, or phone numbers).
 * - Reports contain only: error type, stack trace, app version, OS version, device model.
 * - The Sentry DSN is fetched from the hub server config, not hardcoded.
 *
 * Crash logs are stored locally in `files/crashes/` within the app's private storage.
 * On next launch, if consent is granted, pending logs are uploaded then deleted.
 */
@Singleton
class CrashReporter @Inject constructor(
    @ApplicationContext private val context: Context,
    private val keystoreService: KeyValueStore,
) {

    private var previousHandler: Thread.UncaughtExceptionHandler? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    /**
     * Whether the user has consented to sending crash reports.
     * Default: false (opt-in).
     */
    var crashReportingEnabled: Boolean
        get() = prefs.getBoolean(KEY_CONSENT, false)
        set(value) = prefs.edit().putBoolean(KEY_CONSENT, value).apply()

    /**
     * Install as the default uncaught exception handler.
     * Chains to the previous handler (Android's default) after logging.
     */
    fun install() {
        previousHandler = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                writeCrashLog(thread, throwable)
            } catch (_: Exception) {
                // If crash logging itself fails, don't recurse
            }

            // Chain to previous handler (Android's default kills the process)
            previousHandler?.uncaughtException(thread, throwable)
        }
    }

    /**
     * Get stored crash logs, newest first.
     * Returns at most [MAX_CRASH_FILES] entries.
     */
    fun getCrashLogs(): List<File> {
        return crashDir().listFiles()
            ?.sortedByDescending { it.lastModified() }
            ?.take(MAX_CRASH_FILES)
            ?: emptyList()
    }

    /**
     * Delete all stored crash logs.
     */
    fun clearCrashLogs() {
        crashDir().listFiles()?.forEach { it.delete() }
    }

    /**
     * Upload any pending crash logs to the configured GlitchTip/Sentry endpoint.
     * Only uploads if [crashReportingEnabled] is true and a DSN is configured.
     * Successfully uploaded logs are deleted after upload.
     *
     * @return the number of reports successfully uploaded
     */
    suspend fun uploadPendingCrashLogs(): Int {
        if (!crashReportingEnabled) return 0

        val dsn = getSentryDsn() ?: return 0
        val logs = getCrashLogs()
        if (logs.isEmpty()) return 0

        val endpoint = parseSentryDsn(dsn) ?: return 0
        var uploaded = 0

        for (log in logs) {
            try {
                val content = log.readText()
                val payload = buildSentryEnvelope(content, dsn)
                val success = sendToSentry(endpoint, payload, dsn)
                if (success) {
                    log.delete()
                    uploaded++
                }
            } catch (_: Exception) {
                // Skip this log, try the next one
            }
        }

        return uploaded
    }

    /**
     * Try to upload pending crash logs in the background.
     * Called from Application.onCreate() — fire and forget.
     */
    fun uploadPendingInBackground() {
        if (!crashReportingEnabled || getCrashLogs().isEmpty()) return

        scope.launch {
            try {
                uploadPendingCrashLogs()
            } catch (_: Exception) {
                // Silently fail — crash reporting should never crash the app
            }
        }
    }

    private fun writeCrashLog(thread: Thread, throwable: Throwable) {
        val dir = crashDir()
        dir.mkdirs()

        // Prune old crash files
        val existing = dir.listFiles()?.sortedByDescending { it.lastModified() } ?: emptyList()
        if (existing.size >= MAX_CRASH_FILES) {
            existing.drop(MAX_CRASH_FILES - 1).forEach { it.delete() }
        }

        val timestamp = SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US).format(Date())
        val file = File(dir, "crash_$timestamp.txt")

        val sw = StringWriter()
        val pw = PrintWriter(sw)

        pw.println("=== Llamenos Crash Report ===")
        pw.println("Timestamp: ${Date()}")
        pw.println("Thread: ${thread.name} (id=${thread.id})")
        pw.println("Device: ${Build.MANUFACTURER} ${Build.MODEL}")
        pw.println("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        pw.println("App: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
        pw.println()
        pw.println("--- Stack Trace ---")
        throwable.printStackTrace(pw)
        pw.flush()

        file.writeText(sw.toString())
    }

    /**
     * Get the Sentry/GlitchTip DSN from the hub server configuration.
     * Returns null if no DSN is configured.
     */
    private fun getSentryDsn(): String? {
        return keystoreService.getString(KEY_SENTRY_DSN)
    }

    /**
     * Set the Sentry/GlitchTip DSN (called when config is fetched from the hub).
     */
    fun setSentryDsn(dsn: String?) {
        if (dsn.isNullOrBlank()) {
            keystoreService.remove(KEY_SENTRY_DSN)
        } else {
            keystoreService.putString(KEY_SENTRY_DSN, dsn)
        }
    }

    /**
     * Parse a Sentry DSN into the store endpoint URL.
     * DSN format: https://<key>@<host>/<project_id>
     * Endpoint: https://<host>/api/<project_id>/store/
     */
    private fun parseSentryDsn(dsn: String): String? {
        return try {
            val url = java.net.URL(dsn)
            val key = url.userInfo ?: return null
            val host = url.host
            val port = if (url.port > 0) ":${url.port}" else ""
            val projectId = url.path.trimStart('/')
            "${url.protocol}://$host$port/api/$projectId/store/?sentry_key=$key&sentry_version=7"
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Build a Sentry-compatible JSON event payload from a crash log.
     * Only includes technical information — never PII.
     */
    private fun buildSentryEnvelope(crashLog: String, dsn: String): String {
        // Extract structured info from the crash log text
        val lines = crashLog.lines()
        val exceptionLine = lines.firstOrNull { it.startsWith("--- Stack Trace ---") }
        val stackIndex = lines.indexOf(exceptionLine ?: "")
        val stackTrace = if (stackIndex >= 0) {
            lines.drop(stackIndex + 1).joinToString("\n")
        } else {
            crashLog
        }

        // Extract the first exception line from stack trace
        val firstExceptionLine = stackTrace.lines().firstOrNull()?.trim() ?: "Unknown"
        val (exceptionType, exceptionValue) = if (":" in firstExceptionLine) {
            val parts = firstExceptionLine.split(":", limit = 2)
            parts[0].trim() to parts[1].trim()
        } else {
            firstExceptionLine to ""
        }

        val eventId = UUID.randomUUID().toString().replace("-", "")

        // Build Sentry JSON event — minimal, no PII
        return """
        {
            "event_id": "$eventId",
            "timestamp": "${SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(Date())}",
            "platform": "java",
            "level": "fatal",
            "logger": "CrashReporter",
            "server_name": "",
            "release": "${BuildConfig.VERSION_NAME}",
            "environment": "${if (BuildConfig.DEBUG) "development" else "production"}",
            "tags": {
                "os.name": "Android",
                "os.version": "${Build.VERSION.RELEASE}",
                "device.model": "${Build.MANUFACTURER} ${Build.MODEL}",
                "device.arch": "${Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown"}"
            },
            "exception": {
                "values": [{
                    "type": "${exceptionType.replace("\"", "\\\"")}",
                    "value": "${exceptionValue.replace("\"", "\\\"").replace("\n", "\\n").take(500)}",
                    "stacktrace": {
                        "frames": []
                    }
                }]
            },
            "extra": {
                "raw_crash_log": "${stackTrace.replace("\"", "\\\"").replace("\n", "\\n").take(8000)}"
            }
        }
        """.trimIndent()
    }

    /**
     * Send the Sentry event payload to the store endpoint.
     */
    private fun sendToSentry(endpoint: String, payload: String, dsn: String): Boolean {
        val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()

        val request = Request.Builder()
            .url(endpoint)
            .post(payload.toRequestBody("application/json".toMediaType()))
            .header("Content-Type", "application/json")
            .build()

        return try {
            client.newCall(request).execute().use { response ->
                response.isSuccessful
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun crashDir(): File = File(context.filesDir, CRASH_DIR)

    companion object {
        private const val CRASH_DIR = "crashes"
        private const val MAX_CRASH_FILES = 10
        private const val PREFS_NAME = "crash_reporter_prefs"
        private const val KEY_CONSENT = "crash_reporting_enabled"
        private const val KEY_SENTRY_DSN = "sentry_dsn"
    }
}
