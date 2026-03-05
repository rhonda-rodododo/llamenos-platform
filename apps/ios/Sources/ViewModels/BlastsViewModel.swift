import Foundation

// MARK: - BlastsViewModel

@Observable
final class BlastsViewModel {
    private let apiService: APIService

    var blasts: [Blast] = []
    var subscriberStats: BlastSubscriberStats?
    var isLoading = false
    var isSending = false
    var errorMessage: String?
    var showCreateSheet = false

    init(apiService: APIService) {
        self.apiService = apiService
    }

    // MARK: - Load Blasts

    func loadBlasts() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        do {
            let response: BlastsListResponse = try await apiService.request(
                method: "GET",
                path: "/api/blasts"
            )
            blasts = response.blasts
        } catch {
            if blasts.isEmpty {
                errorMessage = error.localizedDescription
            }
        }

        isLoading = false
    }

    // MARK: - Load Subscriber Stats

    func loadSubscriberStats() async {
        do {
            subscriberStats = try await apiService.request(
                method: "GET",
                path: "/api/blasts/subscribers/stats"
            )
        } catch {
            // Non-critical — stats may not be available
        }
    }

    // MARK: - Create Blast

    func createBlast(name: String, message: String, channels: [String]) async -> Bool {
        isSending = true
        defer { isSending = false }

        do {
            let channelContent = Dictionary(uniqueKeysWithValues: channels.map { ($0, message) })
            let body = CreateBlastRequest(
                name: name,
                content: ["en": channelContent],
                targetChannels: channels,
                targetTags: [],
                targetLanguages: ["en"]
            )
            let _: Blast = try await apiService.request(
                method: "POST",
                path: "/api/blasts",
                body: body
            )
            await loadBlasts()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    // MARK: - Send Blast

    func sendBlast(id: String) async {
        isSending = true
        defer { isSending = false }

        do {
            let _: EmptyResponse = try await apiService.request(
                method: "POST",
                path: "/api/blasts/\(id)/send"
            )
            await loadBlasts()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Refresh

    func refresh() async {
        await loadBlasts()
        await loadSubscriberStats()
    }
}
