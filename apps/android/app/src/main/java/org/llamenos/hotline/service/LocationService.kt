package org.llamenos.hotline.service

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.Serializable
import org.llamenos.hotline.api.ApiService
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Result of a reverse geocoding lookup — mirrors the LocationResult schema
 * from packages/protocol/schemas/geocoding.ts.
 */
@Serializable
data class LocationResult(
    val address: String,
    val displayName: String? = null,
    val lat: Double,
    val lon: Double,
    val countryCode: String? = null,
)

/**
 * Errors from [LocationService].
 */
sealed class LocationError(message: String) : Exception(message) {
    /** Location permission has been denied or restricted. */
    data object Denied : LocationError("Location permission denied")

    /** Reverse geocoding returned no result. */
    data object NoResult : LocationError("Could not resolve location")
}

/**
 * Captures a one-shot device location via FusedLocationProviderClient and
 * reverse-geocodes the coordinates via the worker's /api/geocoding/reverse endpoint.
 *
 * Usage:
 *   val result = locationService.captureAndResolve()
 *
 * Requires ACCESS_FINE_LOCATION or ACCESS_COARSE_LOCATION permission at runtime.
 */
@Singleton
class LocationService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
) {

    private val fusedClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    /**
     * Captures GPS coordinates and reverse-geocodes them to a [LocationResult].
     * Throws [LocationError.Denied] if neither fine nor coarse location permission is granted.
     * Throws [LocationError.NoResult] if the geocoding server returns no match.
     */
    suspend fun captureAndResolve(): LocationResult {
        val hasFine = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasFine && !hasCoarse) throw LocationError.Denied

        val priority = if (hasFine) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY
        val cts = CancellationTokenSource()

        val location = kotlinx.coroutines.suspendCancellableCoroutine { cont ->
            cont.invokeOnCancellation { cts.cancel() }
            fusedClient.getCurrentLocation(priority, cts.token)
                .addOnSuccessListener { loc ->
                    if (loc != null) cont.resume(loc, null)
                    else cont.resumeWithException(LocationError.NoResult)
                }
                .addOnFailureListener { e -> cont.resumeWithException(e) }
        }

        return reverseGeocode(location.latitude, location.longitude)
    }

    // MARK: - Private

    @Serializable
    private data class ReverseBody(val lat: Double, val lon: Double)

    private suspend fun reverseGeocode(lat: Double, lon: Double): LocationResult {
        val result: LocationResult? = apiService.request(
            method = "POST",
            path = "/api/geocoding/reverse",
            body = ReverseBody(lat = lat, lon = lon),
        )
        return result ?: throw LocationError.NoResult
    }
}
