package org.llamenos.hotline

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Test
import org.llamenos.hotline.api.RetryInterceptor

/**
 * Unit tests for RetryInterceptor retry logic.
 *
 * Uses a [FakeChain] that returns configurable HTTP status codes
 * to verify retry behavior without actual network calls.
 */
class RetryInterceptorTest {

    private val interceptor = RetryInterceptor()

    @Test
    fun `200 response is returned immediately without retry`() {
        val chain = FakeChain(listOf(200))
        val response = interceptor.intercept(chain)

        assertEquals(200, response.code)
        assertEquals(1, chain.callCount)
    }

    @Test
    fun `404 client error is not retried`() {
        val chain = FakeChain(listOf(404))
        val response = interceptor.intercept(chain)

        assertEquals(404, response.code)
        assertEquals(1, chain.callCount)
    }

    @Test
    fun `401 unauthorized is retried with short backoff`() {
        val chain = FakeChain(listOf(401, 200))
        val response = interceptor.intercept(chain)

        assertEquals(200, response.code)
        assertEquals(2, chain.callCount)
    }

    @Test
    fun `401 exhausts retries and returns 401`() {
        val chain = FakeChain(listOf(401, 401, 401))
        val response = interceptor.intercept(chain)

        assertEquals(401, response.code)
        assertEquals(3, chain.callCount)
    }

    @Test
    fun `500 server error retries and succeeds on second attempt`() {
        val chain = FakeChain(listOf(500, 200))
        val response = interceptor.intercept(chain)

        assertEquals(200, response.code)
        assertEquals(2, chain.callCount)
    }

    @Test
    fun `502 bad gateway retries and succeeds on third attempt`() {
        val chain = FakeChain(listOf(502, 503, 200))
        val response = interceptor.intercept(chain)

        assertEquals(200, response.code)
        assertEquals(3, chain.callCount)
    }

    @Test
    fun `exhausts retries and returns last error response`() {
        val chain = FakeChain(listOf(500, 502, 503))
        val response = interceptor.intercept(chain)

        assertEquals(503, response.code)
        assertEquals(3, chain.callCount)
    }

    @Test
    fun `429 too many requests is retried`() {
        val chain = FakeChain(listOf(429, 200))
        val response = interceptor.intercept(chain)

        assertEquals(200, response.code)
        assertEquals(2, chain.callCount)
    }

    @Test
    fun `408 request timeout is retried`() {
        val chain = FakeChain(listOf(408, 200))
        val response = interceptor.intercept(chain)

        assertEquals(200, response.code)
        assertEquals(2, chain.callCount)
    }

    /**
     * Fake OkHttp chain that returns responses with preconfigured status codes.
     * Each call to [proceed] returns the next status code in the list.
     */
    private class FakeChain(private val statusCodes: List<Int>) : Interceptor.Chain {
        var callCount = 0
            private set

        private val request = Request.Builder()
            .url("https://hub.example.com/api/test")
            .build()

        override fun request(): Request = request

        override fun proceed(request: Request): Response {
            val code = statusCodes.getOrElse(callCount) { statusCodes.last() }
            callCount++
            return Response.Builder()
                .request(request)
                .protocol(Protocol.HTTP_2)
                .code(code)
                .message("Status $code")
                .body("{}".toResponseBody("application/json".toMediaType()))
                .build()
        }

        // Required overrides with no-op implementations
        override fun connection() = null
        override fun call() = throw UnsupportedOperationException()
        override fun connectTimeoutMillis() = 30000
        override fun readTimeoutMillis() = 30000
        override fun writeTimeoutMillis() = 30000
        override fun withConnectTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
        override fun withReadTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
        override fun withWriteTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
    }
}
