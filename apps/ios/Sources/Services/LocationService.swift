import CoreLocation
import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Captures a one-shot device location and resolves it to a human-readable address
/// via the worker's reverse geocoding endpoint.
///
/// Usage:
///   let service = LocationService(apiService: apiService)
///   let result = try await service.captureAndResolve()
@MainActor
final class LocationService: NSObject, CLLocationManagerDelegate {
    private let apiService: APIService
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation, Error>?

    init(apiService: APIService) {
        self.apiService = apiService
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    /// Captures GPS coordinates and reverse-geocodes them to a LocationResult.
    /// Requests `whenInUse` permission if not yet granted.
    /// Throws `LocationError.denied` if the user has denied/restricted access.
    func captureAndResolve() async throws -> LocationResult {
        let coordinates = try await captureCoordinates()
        return try await reverseGeocode(lat: coordinates.coordinate.latitude,
                                        lon: coordinates.coordinate.longitude)
    }

    // MARK: - Private

    private func captureCoordinates() async throws -> CLLocation {
        let status = manager.authorizationStatus
        guard status != .denied && status != .restricted else {
            throw LocationError.denied
        }
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            manager.requestLocation()
        }
    }

    private func reverseGeocode(lat: Double, lon: Double) async throws -> LocationResult {
        struct Body: Encodable { let lat: Double; let lon: Double }
        let body = Body(lat: lat, lon: lon)
        let response: LocationResult? = try await apiService.request(method: "POST", path: "/api/geocoding/reverse", body: body)
        guard let response else { throw LocationError.noResult }
        return response
    }

    // MARK: - CLLocationManagerDelegate

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.first else { return }
        Task { @MainActor in
            continuation?.resume(returning: location)
            continuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            continuation?.resume(throwing: error)
            continuation = nil
        }
    }
}

enum LocationError: LocalizedError {
    case denied
    case noResult

    var errorDescription: String? {
        switch self {
        case .denied: return NSLocalizedString("location_permission_denied", comment: "Location permission denied")
        case .noResult: return NSLocalizedString("location_no_result", comment: "Could not resolve location")
        }
    }
}

// MARK: - Open in Maps

/// Opens the location in Organic Maps if installed, otherwise Apple Maps.
func openLocationInMaps(lat: Double, lon: Double, label: String) {
    let encodedLabel = label.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
    let omURL = URL(string: "om://map?v=1&ll=\(lat),\(lon)&n=\(encodedLabel)")!
#if canImport(UIKit)
    if UIApplication.shared.canOpenURL(omURL) {
        UIApplication.shared.open(omURL)
    } else {
        let appleMapsURL = URL(string: "maps://maps.apple.com/?ll=\(lat),\(lon)&q=\(encodedLabel)")!
        UIApplication.shared.open(appleMapsURL)
    }
#endif
}
