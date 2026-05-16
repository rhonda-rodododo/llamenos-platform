package org.llamenos.hotline.api

import kotlinx.serialization.Serializable
import org.llamenos.protocol.CallMetricsResponse
import org.llamenos.protocol.ConversationMetricsResponse
import org.llamenos.protocol.HourlyDistributionResponse
import org.llamenos.protocol.PersonalStatsResponse
import org.llamenos.protocol.ShiftMetricsResponse
import org.llamenos.protocol.UserStatsResponse
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class AnalyticsDateRange(
    val from: String? = null,
    val to: String? = null,
)

/** Encapsulates all analytics API calls. Hub-scoped via apiService.hp(). */
@Singleton
class AnalyticsRepository @Inject constructor(
    private val apiService: ApiService,
) {
    /** Personal stats for the authenticated user in the active hub. */
    suspend fun getPersonalStats(from: String? = null, to: String? = null): PersonalStatsResponse {
        val query = buildQuery(from, to)
        return apiService.request("GET", apiService.hp("/api/analytics/me$query"))
    }

    /** Hub-level call metrics (answer rate, volume, duration). */
    suspend fun getCallMetrics(from: String? = null, to: String? = null): CallMetricsResponse {
        val query = buildQuery(from, to)
        return apiService.request("GET", apiService.hp("/api/analytics/calls$query"))
    }

    /** Hub-level conversation metrics by channel. */
    suspend fun getConversationMetrics(from: String? = null, to: String? = null): ConversationMetricsResponse {
        val query = buildQuery(from, to)
        return apiService.request("GET", apiService.hp("/api/analytics/conversations$query"))
    }

    /** Hub-level shift coverage metrics. */
    suspend fun getShiftMetrics(): ShiftMetricsResponse {
        return apiService.request("GET", apiService.hp("/api/analytics/shifts"))
    }

    /** Per-user activity stats sorted by calls answered. */
    suspend fun getUserStats(from: String? = null, to: String? = null): UserStatsResponse {
        val query = buildQuery(from, to)
        return apiService.request("GET", apiService.hp("/api/analytics/users$query"))
    }

    /** Hourly call distribution (24 buckets). */
    suspend fun getHourlyDistribution(from: String? = null, to: String? = null): HourlyDistributionResponse {
        val query = buildQuery(from, to)
        return apiService.request("GET", apiService.hp("/api/analytics/hours$query"))
    }

    private fun buildQuery(from: String?, to: String?): String {
        val params = buildList {
            if (from != null) add("from=${java.net.URLEncoder.encode(from, "UTF-8")}")
            if (to != null) add("to=${java.net.URLEncoder.encode(to, "UTF-8")}")
        }
        return if (params.isEmpty()) "" else "?${params.joinToString("&")}"
    }

    /** Format seconds as "Xm Ys" or "Ys" for display. */
    fun formatDuration(seconds: Double): String {
        val totalSecs = seconds.toInt()
        val mins = totalSecs / 60
        val secs = totalSecs % 60
        return if (mins > 0) "${mins}m ${secs}s" else "${secs}s"
    }

    /** Format answer rate as percentage string. */
    fun formatAnswerRate(rate: Double): String = "${(rate * 100).toInt()}%"
}
