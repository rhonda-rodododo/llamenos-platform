package org.llamenos.hotline.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.CertificatePinner
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.llamenos.hotline.crypto.KeyValueStore
import org.llamenos.hotline.crypto.KeystoreService
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

class ApiException(val code: Int, override val message: String) : Exception("HTTP $code: $message")

/**
 * REST API client for the llamenos Worker backend.
 *
 * Uses OkHttp with [AuthInterceptor] for automatic Schnorr authentication.
 * All requests are executed on [Dispatchers.IO] to avoid blocking the main thread.
 *
 * Serialization uses kotlinx.serialization with lenient JSON parsing
 * (unknown keys are ignored for forward compatibility).
 */
@Singleton
class ApiService @Inject constructor(
    authInterceptor: AuthInterceptor,
    retryInterceptor: RetryInterceptor,
    @PublishedApi internal val keystoreService: KeyValueStore,
) {

    @PublishedApi
    internal var client: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(retryInterceptor)
        .addInterceptor(authInterceptor)
        .certificatePinner(certificatePinner)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    companion object {
        /**
         * Certificate pinner for llamenos API domains.
         *
         * Pin hashes are shared with iOS — see docs/security/CERTIFICATE_PINS.md.
         * TODO: Replace placeholder pins after first production deployment to app.llamenos.org.
         * Run the extraction commands in CERTIFICATE_PINS.md and update these values.
         */
        val certificatePinner: CertificatePinner = CertificatePinner.Builder()
            // Primary pin — Cloudflare intermediate CA (from docs/security/CERTIFICATE_PINS.md)
            .add("*.llamenos.org", "sha256/REPLACE_AFTER_DEPLOYMENT")
            // Backup pin — Cloudflare root CA (from docs/security/CERTIFICATE_PINS.md)
            .add("*.llamenos.org", "sha256/REPLACE_AFTER_DEPLOYMENT")
            .build()
    }

    @PublishedApi
    internal val json: Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }

    /**
     * Execute an HTTP request and deserialize the response body.
     *
     * @param T The expected response type (must be @Serializable)
     * @param method HTTP method (GET, POST, PUT, DELETE, PATCH)
     * @param path API path (e.g., "/api/v1/identity")
     * @param body Optional request body (will be JSON-serialized)
     * @return Deserialized response of type T
     * @throws ApiException on non-2xx responses
     * @throws IOException on network errors
     */
    suspend inline fun <reified T> request(
        method: String,
        path: String,
        body: Any? = null,
    ): T = withContext(Dispatchers.IO) {
        val baseUrl = getBaseUrl()
        val url = "$baseUrl$path"

        val mediaType = "application/json; charset=utf-8".toMediaType()
        val requestBody = body?.let { bodyValue ->
            val serializer = serializer(bodyValue::class.java)
            @Suppress("UNCHECKED_CAST")
            json.encodeToString(serializer as kotlinx.serialization.SerializationStrategy<Any>, bodyValue)
                .toRequestBody(mediaType)
        }

        val httpMethod = method.uppercase()
        val request = Request.Builder()
            .url(url)
            .method(
                httpMethod,
                when {
                    requestBody != null -> requestBody
                    httpMethod in listOf("POST", "PUT", "PATCH") -> "".toRequestBody(mediaType)
                    else -> null
                }
            )
            .build()

        val response = client.newCall(request).execute()

        if (!response.isSuccessful) {
            val errorBody = response.body?.string() ?: response.message
            throw ApiException(response.code, errorBody)
        }

        val responseBody = response.body?.string()
            ?: throw ApiException(response.code, "Empty response body")

        json.decodeFromString<T>(responseBody)
    }

    /**
     * Execute a request that returns no meaningful body (e.g., DELETE).
     */
    suspend fun requestNoContent(
        method: String,
        path: String,
        body: Any? = null,
    ): Unit = withContext(Dispatchers.IO) {
        val baseUrl = getBaseUrl()
        val url = "$baseUrl$path"

        val mediaType = "application/json; charset=utf-8".toMediaType()
        val requestBody = body?.let { bodyValue ->
            val serializer = serializer(bodyValue::class.java)
            @Suppress("UNCHECKED_CAST")
            json.encodeToString(serializer as kotlinx.serialization.SerializationStrategy<Any>, bodyValue)
                .toRequestBody(mediaType)
        }

        val httpMethod = method.uppercase()
        val request = Request.Builder()
            .url(url)
            .method(
                httpMethod,
                when {
                    requestBody != null -> requestBody
                    httpMethod in listOf("POST", "PUT", "PATCH") -> "".toRequestBody(mediaType)
                    else -> null
                }
            )
            .build()

        val response = client.newCall(request).execute()

        if (!response.isSuccessful) {
            val errorBody = response.body?.string() ?: response.message
            throw ApiException(response.code, errorBody)
        }
    }

    /**
     * Get the configured hub URL from secure storage.
     */
    @PublishedApi
    internal fun getBaseUrl(): String {
        return keystoreService.retrieve(KeystoreService.KEY_HUB_URL)
            ?: throw IllegalStateException("Hub URL not configured")
    }
}
