import Foundation

// MARK: - OnboardingStep

/// The wizard steps for hub communications onboarding.
enum OnboardingStep: String, CaseIterable, Identifiable {
    case template
    case channels
    case provider
    case phoneNumber
    case channelSetup
    case summary
    case complete

    var id: String { rawValue }

    var stepNumber: Int {
        switch self {
        case .template: return 1
        case .channels: return 2
        case .provider: return 3
        case .phoneNumber: return 4
        case .channelSetup: return 5
        case .summary: return 6
        case .complete: return 7
        }
    }

    static let totalSteps = 7
}

// MARK: - HubCommunicationsViewModel

/// ViewModel for hub communications settings and onboarding wizard.
/// Uses @Observable macro (iOS 17+) per project conventions.
@Observable
final class HubCommunicationsViewModel {
    private let onboardAPI: HubOnboardAPI
    private let providerService: ProviderSetupService
    private let hubContext: HubContext

    // MARK: - State

    /// Whether the hub has provider setup complete.
    var providerSetupComplete: Bool = false

    /// Current provider type (if configured).
    var providerType: ProviderType?

    /// Provider connection status.
    var providerStatus: ProviderStatus = .disconnected

    /// Hub onboarding state from the API.
    var onboardingState: HubOnboardingState?

    /// Provider settings from the API.
    var providerSettings: HubProviderSettings?

    /// Current usage stats.
    var usage: HubUsage?

    /// Available provider templates.
    var templates: [ProviderTemplate] = []

    /// Selected template during onboarding.
    var selectedTemplate: ProviderTemplate?

    /// Channel toggles during onboarding or settings.
    var channelVoice: Bool = true
    var channelSms: Bool = true
    var channelEmail: Bool = false
    var channelSignal: Bool = false
    var channelWhatsApp: Bool = false
    var channelTelegram: Bool = false
    var channelRcs: Bool = false

    /// Current onboarding wizard step.
    var currentStep: OnboardingStep = .template

    /// Whether the onboarding sheet is presented.
    var showOnboardingSheet: Bool = false

    /// Loading states.
    var isLoading: Bool = false
    var isSavingChannels: Bool = false
    var isCompletingStep: Bool = false

    /// Error message to display.
    var error: String?

    /// Success feedback message.
    var successMessage: String?

    // MARK: - Init

    init(onboardAPI: HubOnboardAPI, providerService: ProviderSetupService, hubContext: HubContext) {
        self.onboardAPI = onboardAPI
        self.providerService = providerService
        self.hubContext = hubContext
    }

    var hubId: String? { hubContext.activeHubId }

    // MARK: - Data Loading

    /// Load hub provider settings, usage, and onboarding state.
    func loadAll() async {
        guard let hubId else { return }
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            async let settingsTask = onboardAPI.getProviderSettings(hubId: hubId)
            async let usageTask = onboardAPI.getUsage(hubId: hubId)

            let (settings, usageResult) = try await (settingsTask, usageTask)

            providerSettings = settings
            usage = usageResult
            providerSetupComplete = settings.providerSetupComplete
            providerType = settings.providerType
            providerStatus = settings.providerSetupComplete ? .connected : .disconnected

            // Sync channel toggles from server state
            syncChannelsFromSettings(settings.channels)

            // If not set up, load onboarding state
            if !settings.providerSetupComplete {
                do {
                    let state = try await onboardAPI.getOnboardingStatus(hubId: hubId)
                    onboardingState = state
                    if let step = OnboardingStep(rawValue: state.currentStep) {
                        currentStep = step
                    }
                    syncChannelsFromOnboarding(state.channelConfig)
                } catch {
                    // No onboarding started yet — that's fine
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Load provider templates.
    func loadTemplates() async {
        do {
            templates = try await onboardAPI.getProviderTemplates()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Onboarding Actions

    /// Start onboarding, optionally with a template.
    func startOnboarding(templateId: String? = nil) async {
        guard let hubId else { return }
        isCompletingStep = true
        error = nil
        defer { isCompletingStep = false }

        do {
            let state = try await onboardAPI.startOnboarding(hubId: hubId, templateId: templateId)
            onboardingState = state
            if let step = OnboardingStep(rawValue: state.currentStep) {
                currentStep = step
            }
            syncChannelsFromOnboarding(state.channelConfig)
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Select a template and start onboarding with it.
    func selectTemplate(_ template: ProviderTemplate) async {
        selectedTemplate = template
        // Apply template defaults to channel toggles
        for channel in template.defaultChannels {
            setChannel(channel, enabled: true)
        }
        await startOnboarding(templateId: template.id)
    }

    /// Start from scratch (no template).
    func startFromScratch() async {
        selectedTemplate = nil
        await startOnboarding(templateId: nil)
    }

    /// Complete the current onboarding step and advance.
    func completeCurrentStep() async {
        guard let hubId else { return }
        isCompletingStep = true
        error = nil
        defer { isCompletingStep = false }

        do {
            let state = try await onboardAPI.completeStep(hubId: hubId, step: currentStep.rawValue)
            onboardingState = state

            if state.isComplete {
                currentStep = .complete
                providerSetupComplete = true
                showOnboardingSheet = false
                successMessage = NSLocalizedString("hub_onboarding_setup_complete", comment: "Setup complete")
                // Reload settings
                await loadAll()
            } else if let step = OnboardingStep(rawValue: state.currentStep) {
                currentStep = step
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Navigate to a specific step (for back navigation).
    func goToStep(_ step: OnboardingStep) {
        currentStep = step
    }

    /// Go back one step in the wizard.
    func goBack() {
        let allSteps = OnboardingStep.allCases
        guard let currentIndex = allSteps.firstIndex(of: currentStep), currentIndex > 0 else { return }
        currentStep = allSteps[currentIndex - 1]
    }

    /// Whether we can go back from the current step.
    var canGoBack: Bool {
        currentStep != .template
    }

    // MARK: - Channel Management

    /// Update channels on the server.
    func saveChannels() async {
        guard let hubId else { return }
        isSavingChannels = true
        error = nil
        defer { isSavingChannels = false }

        let config = ChannelConfig(
            email: channelEmail,
            rcs: channelRcs,
            signal: channelSignal,
            sms: channelSms,
            telegram: channelTelegram,
            voice: channelVoice,
            whatsapp: channelWhatsApp
        )

        do {
            try await onboardAPI.updateChannels(hubId: hubId, channels: config)
            // Also update provider settings channels locally
            if let settings = providerSettings {
                let updatedChannels = SharedChannelConfig(
                    email: channelEmail,
                    rcs: channelRcs,
                    signal: channelSignal,
                    sms: channelSms,
                    telegram: channelTelegram,
                    voice: channelVoice,
                    whatsapp: channelWhatsApp
                )
                providerSettings = HubProviderSettings(
                    channels: updatedChannels,
                    providerSetupComplete: settings.providerSetupComplete,
                    providerType: settings.providerType,
                    quotas: settings.quotas,
                    subAccountConfigID: settings.subAccountConfigID,
                    subAccountEnabled: settings.subAccountEnabled,
                    usage: settings.usage
                )
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Private Helpers

    private func syncChannelsFromSettings(_ channels: SharedChannelConfig) {
        channelVoice = channels.voice
        channelSms = channels.sms
        channelEmail = channels.email
        channelSignal = channels.signal
        channelWhatsApp = channels.whatsapp
        channelTelegram = channels.telegram
        channelRcs = channels.rcs
    }

    private func syncChannelsFromOnboarding(_ config: SharedChannelConfig) {
        channelVoice = config.voice
        channelSms = config.sms
        channelEmail = config.email
        channelSignal = config.signal
        channelWhatsApp = config.whatsapp
        channelTelegram = config.telegram
        channelRcs = config.rcs
    }

    private func setChannel(_ channel: HubChannelType, enabled: Bool) {
        switch channel {
        case .voice: channelVoice = enabled
        case .sms: channelSms = enabled
        case .email: channelEmail = enabled
        case .signal: channelSignal = enabled
        case .whatsapp: channelWhatsApp = enabled
        case .telegram: channelTelegram = enabled
        case .rcs: channelRcs = enabled
        }
    }

    /// List of currently enabled channels for display.
    var enabledChannels: [HubChannelType] {
        var result: [HubChannelType] = []
        if channelVoice { result.append(.voice) }
        if channelSms { result.append(.sms) }
        if channelEmail { result.append(.email) }
        if channelSignal { result.append(.signal) }
        if channelWhatsApp { result.append(.whatsapp) }
        if channelTelegram { result.append(.telegram) }
        if channelRcs { result.append(.rcs) }
        return result
    }
}
