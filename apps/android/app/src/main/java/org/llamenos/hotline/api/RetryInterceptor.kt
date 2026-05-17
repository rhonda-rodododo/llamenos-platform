package org.llamenos.hotline.api

import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * OkHttp [Interceptor] that retries transient HTTP errors with exponential backoff.
 *
 * Retried status codes:
 * - 401 (Unauthorized) — short backoff (200ms base). Handles the startup race where
 *   device keys are generated locally but backend registration hasn't propagated yet.
 * - 408 (Request Timeout), 429 (Too Many Requests), 500, 502, 503, 504 (server errors)
 *   — standard backoff (1s base).
 *
 * Respects `Retry-After` header from 429 responses (capped at 30s).
 *
 * Non-retryable errors (other 4xx client errors, network IOException) are propagated immediately.
 */
@Singleton
class RetryInterceptor @Inject constructor() : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        var lastResponse: Response? = null

        for (attempt in 0 until MAX_RETRIES) {
            // Close previous response body to avoid resource leaks
            lastResponse?.close()

            try {
                val response = chain.proceed(request)

                if (!isRetryable(response.code) || attempt == MAX_RETRIES - 1) {
                    return response
                }

                lastResponse = response

                val delayMs = retryDelay(response, attempt)
                Thread.sleep(delayMs)
            } catch (e: IOException) {
                if (attempt == MAX_RETRIES - 1) throw e

                val delayMs = BASE_DELAY_MS * (1L shl attempt)
                Thread.sleep(delayMs)
            }
        }

        // Should not reach here, but satisfy compiler
        return lastResponse ?: throw IOException("Retry exhausted with no response")
    }

    private fun isRetryable(code: Int): Boolean =
        code in RETRYABLE_CODES || code in AUTH_RETRYABLE_CODES

    private fun retryDelay(response: Response, attempt: Int): Long {
        // Respect Retry-After header for 429 responses
        if (response.code == 429) {
            val retryAfter = response.header("Retry-After")?.toLongOrNull()
            if (retryAfter != null) {
                return (retryAfter * 1000).coerceAtMost(MAX_RETRY_AFTER_MS)
            }
        }

        // Auth errors use shorter backoff — the startup race resolves within ~500ms
        if (response.code in AUTH_RETRYABLE_CODES) {
            return AUTH_BASE_DELAY_MS * (1L shl attempt)
        }

        return BASE_DELAY_MS * (1L shl attempt)
    }

    companion object {
        private const val MAX_RETRIES = 3
        private const val BASE_DELAY_MS = 1000L
        private const val AUTH_BASE_DELAY_MS = 200L
        private const val MAX_RETRY_AFTER_MS = 30_000L

        private val RETRYABLE_CODES = setOf(408, 429, 500, 502, 503, 504)
        private val AUTH_RETRYABLE_CODES = setOf(401)
    }
}
