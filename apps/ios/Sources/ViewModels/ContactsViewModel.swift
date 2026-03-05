import Foundation

// MARK: - ContactsViewModel

@Observable
final class ContactsViewModel {
    private let apiService: APIService

    var contacts: [ContactSummary] = []
    var total: Int = 0
    var currentPage: Int = 1
    var searchQuery: String = ""
    var isLoading = false
    var errorMessage: String?

    var hasMore: Bool { contacts.count < total }

    init(apiService: APIService) {
        self.apiService = apiService
    }

    // MARK: - Load Contacts

    func loadContacts() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        do {
            let response: ContactsListResponse = try await apiService.request(
                method: "GET",
                path: "/api/contacts?page=1&limit=50"
            )
            contacts = response.contacts
            total = response.total
            currentPage = 1
        } catch {
            if contacts.isEmpty {
                errorMessage = error.localizedDescription
            }
        }

        isLoading = false
    }

    // MARK: - Load More (Pagination)

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        isLoading = true

        let nextPage = currentPage + 1
        do {
            let query = searchQuery.isEmpty ? "" : "&search=\(searchQuery)"
            let response: ContactsListResponse = try await apiService.request(
                method: "GET",
                path: "/api/contacts?page=\(nextPage)&limit=50\(query)"
            )
            contacts.append(contentsOf: response.contacts)
            total = response.total
            currentPage = nextPage
        } catch {
            // Silently fail for pagination
        }

        isLoading = false
    }

    // MARK: - Search

    func search() async {
        isLoading = true
        errorMessage = nil

        do {
            let query = searchQuery.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? searchQuery
            let response: ContactsListResponse = try await apiService.request(
                method: "GET",
                path: "/api/contacts?page=1&limit=50&search=\(query)"
            )
            contacts = response.contacts
            total = response.total
            currentPage = 1
        } catch {
            if contacts.isEmpty {
                errorMessage = error.localizedDescription
            }
        }

        isLoading = false
    }

    // MARK: - Refresh

    func refresh() async {
        searchQuery = ""
        await loadContacts()
    }
}

// MARK: - ContactTimelineViewModel

@Observable
final class ContactTimelineViewModel {
    private let apiService: APIService
    let contactHash: String

    var events: [ContactTimelineEvent] = []
    var total: Int = 0
    var isLoading = false
    var errorMessage: String?

    init(apiService: APIService, contactHash: String) {
        self.apiService = apiService
        self.contactHash = contactHash
    }

    func loadTimeline() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        do {
            let response: ContactTimelineResponse = try await apiService.request(
                method: "GET",
                path: "/api/contacts/\(contactHash)/timeline?limit=100"
            )
            events = response.events
            total = response.total
        } catch {
            if events.isEmpty {
                errorMessage = error.localizedDescription
            }
        }

        isLoading = false
    }

    func refresh() async {
        await loadTimeline()
    }
}
