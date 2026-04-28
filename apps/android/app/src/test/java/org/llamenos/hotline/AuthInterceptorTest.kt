package org.llamenos.hotline

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.llamenos.hotline.api.AuthInterceptor
import org.llamenos.hotline.crypto.CryptoService
import java.util.concurrent.TimeUnit

/**
 * Unit tests for [AuthInterceptor] (M30: synthetic 401 on signing failure).
 *
 * Verifies that the interceptor returns a synthetic 401 response instead of
 * dispatching an unauthenticated request when the CryptoService is locked
 * or signing fails.
 */
class AuthInterceptorTest {

    private lateinit var cryptoService: CryptoService
    private lateinit var interceptor: AuthInterceptor

    @Before
    fun setup() {
        cryptoService = CryptoService()
        interceptor = AuthInterceptor(cryptoService)
    }

    @Test
    fun `returns synthetic 401 when crypto service is locked`() {
        // CryptoService is not unlocked (no key loaded)
        val chain = FakeChain()
        val response = interceptor.intercept(chain)

        assertEquals(401, response.code)
        assertEquals("Authentication failed", response.message)
        assertEquals(0, chain.proceedCount) // Should NOT dispatch the request
    }

    @Test
    fun `returns synthetic 401 when native lib not loaded`() {
        // Even if we set test key state, nativeLibLoaded is false in JVM tests,
        // so createAuthTokenSync will throw IllegalStateException
        cryptoService.setTestKeyState(
            signing = "a".repeat(64),
            encryption = "b".repeat(64),
            device = "test-device-id",
        )

        val chain = FakeChain()
        val response = interceptor.intercept(chain)

        // The interceptor catches the exception and returns synthetic 401
        assertEquals(401, response.code)
        assertEquals("Authentication failed", response.message)
        assertEquals(0, chain.proceedCount) // Should NOT dispatch the request
    }

    @Test
    fun `synthetic 401 response has correct protocol and request`() {
        val chain = FakeChain()
        val response = interceptor.intercept(chain)

        assertEquals(Protocol.HTTP_1_1, response.protocol)
        assertEquals("https://hub.example.com/api/test", response.request.url.toString())
    }

    @Test
    fun `synthetic 401 response has empty body`() {
        val chain = FakeChain()
        val response = interceptor.intercept(chain)

        val body = response.body?.string()
        assertEquals("", body)
    }

    @Test
    fun `synthetic 401 has no authorization header on request`() {
        val chain = FakeChain()
        val response = interceptor.intercept(chain)

        // The original request should NOT have been modified
        assertNull(response.request.header("Authorization"))
    }

    /**
     * Fake OkHttp chain that counts proceed() calls.
     * Used to verify that the interceptor does NOT dispatch unauthenticated requests.
     */
    private class FakeChain : Interceptor.Chain {
        var proceedCount = 0
            private set

        private val request = Request.Builder()
            .url("https://hub.example.com/api/test")
            .build()

        override fun request(): Request = request

        override fun proceed(request: Request): Response {
            proceedCount++
            return Response.Builder()
                .request(request)
                .protocol(Protocol.HTTP_2)
                .code(200)
                .message("OK")
                .body("{}".toResponseBody("application/json".toMediaType()))
                .build()
        }

        override fun connection() = null
        override fun call() = throw UnsupportedOperationException()
        override fun connectTimeoutMillis() = 30000
        override fun readTimeoutMillis() = 30000
        override fun writeTimeoutMillis() = 30000
        override fun withConnectTimeout(timeout: Int, unit: TimeUnit) = this
        override fun withReadTimeout(timeout: Int, unit: TimeUnit) = this
        override fun withWriteTimeout(timeout: Int, unit: TimeUnit) = this
    }
}
