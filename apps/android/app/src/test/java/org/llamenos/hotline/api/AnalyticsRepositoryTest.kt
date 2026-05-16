package org.llamenos.hotline.api

import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AnalyticsRepositoryTest {

    private lateinit var apiService: ApiService
    private lateinit var repo: AnalyticsRepository

    @Before
    fun setUp() {
        apiService = mockk(relaxed = true)
        repo = AnalyticsRepository(apiService)
    }

    // ── URL path construction ─────────────────────────────────────────

    // Note: apiService.request() is an inline function and cannot be mocked by MockK.
    // We short-circuit by having hp() throw before request() is ever called,
    // then assert on the captured path argument.

    @Test
    fun `getPersonalStats constructs hub-prefixed analytics-me path`() = runTest {
        val pathSlot = slot<String>()
        every { apiService.hp(capture(pathSlot)) } throws RuntimeException("short-circuit")
        try { repo.getPersonalStats() } catch (_: RuntimeException) {}
        assertTrue("Path should contain /analytics/me: ${pathSlot.captured}",
            pathSlot.captured.contains("/analytics/me"))
    }

    @Test
    fun `getCallMetrics constructs analytics-calls path`() = runTest {
        val pathSlot = slot<String>()
        every { apiService.hp(capture(pathSlot)) } throws RuntimeException("short-circuit")
        try { repo.getCallMetrics() } catch (_: RuntimeException) {}
        assertTrue("Path should contain /analytics/calls: ${pathSlot.captured}",
            pathSlot.captured.contains("/analytics/calls"))
    }

    @Test
    fun `getCallMetrics passes date range as query params`() = runTest {
        val pathSlot = slot<String>()
        every { apiService.hp(capture(pathSlot)) } throws RuntimeException("short-circuit")
        try { repo.getCallMetrics(from = "2026-05-01T00:00:00Z", to = "2026-05-07T23:59:59Z") } catch (_: RuntimeException) {}
        assertTrue("Path should contain from param: ${pathSlot.captured}", pathSlot.captured.contains("from="))
        assertTrue("Path should contain to param: ${pathSlot.captured}", pathSlot.captured.contains("to="))
    }

    // ── Formatting helpers ────────────────────────────────────────────

    @Test
    fun `formatDuration formats seconds into Xm Ys`() {
        assertEquals("2m 30s", repo.formatDuration(150.0))
    }

    @Test
    fun `formatDuration formats sub-minute as seconds only`() {
        assertEquals("45s", repo.formatDuration(45.0))
    }

    @Test
    fun `formatDuration handles zero`() {
        assertEquals("0s", repo.formatDuration(0.0))
    }

    @Test
    fun `formatAnswerRate formats fraction as percent string`() {
        assertEquals("85%", repo.formatAnswerRate(0.85))
        assertEquals("100%", repo.formatAnswerRate(1.0))
        assertEquals("0%", repo.formatAnswerRate(0.0))
    }
}
