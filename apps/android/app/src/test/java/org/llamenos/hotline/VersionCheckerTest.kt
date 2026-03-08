package org.llamenos.hotline

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.api.AuthInterceptor
import org.llamenos.hotline.api.RetryInterceptor
import org.llamenos.hotline.api.VersionChecker
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.crypto.KeystoreService

/**
 * Unit tests for [VersionChecker] — verifies the client-side API version
 * compatibility logic against mocked server responses.
 *
 * Uses OkHttp [MockWebServer] to simulate `/api/config` responses with
 * different `apiVersion` and `minApiVersion` values.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class VersionCheckerTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var mockWebServer: MockWebServer
    private lateinit var keyValueStore: InMemoryKeyValueStore
    private lateinit var apiService: ApiService
    private lateinit var versionChecker: VersionChecker

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        mockWebServer = MockWebServer()
        mockWebServer.start()

        keyValueStore = InMemoryKeyValueStore()
        // Set hub URL to point to mock server
        keyValueStore.store(KeystoreService.KEY_HUB_URL, mockWebServer.url("/").toString().trimEnd('/'))

        val cryptoService = CryptoService()
        val authInterceptor = AuthInterceptor(cryptoService)
        val retryInterceptor = RetryInterceptor()
        apiService = ApiService(authInterceptor, retryInterceptor, keyValueStore)
        versionChecker = VersionChecker(apiService)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        mockWebServer.shutdown()
    }

    @Test
    fun `check returns UpToDate when client version matches server`() = runTest {
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"hotlineName":"Test","apiVersion":${VersionChecker.API_VERSION},"minApiVersion":${VersionChecker.API_VERSION}}""")
                .setHeader("Content-Type", "application/json"),
        )

        val status = versionChecker.check()
        assertEquals(VersionChecker.VersionStatus.UpToDate, status)
    }

    @Test
    fun `check returns ForceUpdate when client is below minApiVersion`() = runTest {
        val highMinVersion = VersionChecker.API_VERSION + 5
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"hotlineName":"Test","apiVersion":$highMinVersion,"minApiVersion":$highMinVersion}""")
                .setHeader("Content-Type", "application/json"),
        )

        val status = versionChecker.check()
        assertTrue(status is VersionChecker.VersionStatus.ForceUpdate)
        assertEquals(highMinVersion, (status as VersionChecker.VersionStatus.ForceUpdate).minVersion)
    }

    @Test
    fun `check returns UpdateAvailable when newer version exists but not required`() = runTest {
        val newerVersion = VersionChecker.API_VERSION + 1
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{"hotlineName":"Test","apiVersion":$newerVersion,"minApiVersion":${VersionChecker.API_VERSION}}""")
                .setHeader("Content-Type", "application/json"),
        )

        val status = versionChecker.check()
        assertTrue(status is VersionChecker.VersionStatus.UpdateAvailable)
        assertEquals(newerVersion, (status as VersionChecker.VersionStatus.UpdateAvailable).latestVersion)
    }

    @Test
    fun `check returns Unknown on network error`() = runTest {
        // Shut down the mock server to simulate network failure
        mockWebServer.shutdown()

        val status = versionChecker.check()
        assertEquals(VersionChecker.VersionStatus.Unknown, status)
    }

    @Test
    fun `check returns Unknown on server error response`() = runTest {
        mockWebServer.enqueue(
            MockResponse()
                .setResponseCode(500)
                .setBody("Internal Server Error"),
        )

        val status = versionChecker.check()
        assertEquals(VersionChecker.VersionStatus.Unknown, status)
    }
}
