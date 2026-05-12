import Foundation

// MARK: - OnboardStepRequest

private struct OnboardStepRequest: Encodable {
    let step: String
    let data: [String: String]?
}

// MARK: - ChannelUpdateRequest

private struct ChannelUpdateRequest: Encodable {
    let channels: ChannelConfig
}

// MARK: - ProviderTemplateListResponse

struct ProviderTemplateListResponse: Decodable {
    let templates: [ProviderTemplate]
}

// MARK: - HubOnboardAPI

/// Service wrapping hub onboarding and provider management API endpoints.
/// All paths are hub-scoped: `/api/hubs/:hubId/...`
final class HubOnboardAPI {
    private let api: APIService

    init(api: APIService) {
        self.api = api
    }

    // MARK: - Onboarding

    /// Start or resume onboarding for a hub.
    func getOnboarding(hubId: String) async throws -> HubOnboardingState {
        return try await api.request(
            method: "GET",
            path: "/api/hubs/\(hubId)/onboard"
        )
    }

    /// Start onboarding with an optional template.
    func startOnboarding(hubId: String, templateId: String?) async throws -> HubOnboardingState {
        struct StartBody: Encodable { let templateId: String? }
        return try await api.request(
            method: "POST",
            path: "/api/hubs/\(hubId)/onboard",
            body: StartBody(templateId: templateId)
        )
    }

    /// Get onboarding progress.
    func getOnboardingStatus(hubId: String) async throws -> HubOnboardingState {
        return try await api.request(
            method: "GET",
            path: "/api/hubs/\(hubId)/onboard/status"
        )
    }

    /// Complete an onboarding step.
    func completeStep(hubId: String, step: String, data: [String: String]? = nil) async throws -> HubOnboardingState {
        let body = OnboardStepRequest(step: step, data: data)
        return try await api.request(
            method: "PUT",
            path: "/api/hubs/\(hubId)/onboard/step",
            body: body
        )
    }

    // MARK: - Provider Status

    /// Get the hub's provider settings and status.
    func getProviderSettings(hubId: String) async throws -> HubProviderSettings {
        return try await api.request(
            method: "GET",
            path: "/api/hubs/\(hubId)/provider-status"
        )
    }

    // MARK: - Usage

    /// Get usage stats for the hub.
    func getUsage(hubId: String) async throws -> HubUsage {
        return try await api.request(
            method: "GET",
            path: "/api/hubs/\(hubId)/usage"
        )
    }

    // MARK: - Channels

    /// Enable/disable communication channels for the hub.
    func updateChannels(hubId: String, channels: ChannelConfig) async throws {
        let body = ChannelUpdateRequest(channels: channels)
        let _: EmptyResponse = try await api.request(
            method: "PUT",
            path: "/api/hubs/\(hubId)/channels",
            body: body
        )
    }

    // MARK: - Provider Templates

    /// List available provider templates.
    func getProviderTemplates() async throws -> [ProviderTemplate] {
        let response: ProviderTemplateListResponse = try await api.request(
            method: "GET",
            path: "/api/provider-templates"
        )
        return response.templates
    }
}
