import SwiftUI

/// The main entry point for the Llamenos iOS app. Manages the app lifecycle,
/// injects the root `AppState` into the environment, handles background
/// lock timeout (M26: user-configurable), and screenshot protection (M28).
@main
struct LlamenosApp: App {
    init() {
        let largeTitleAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont(name: "DMSans-Bold", size: 34) ?? UIFont.systemFont(ofSize: 34, weight: .bold)
        ]
        let inlineTitleAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont(name: "DMSans-SemiBold", size: 17) ?? UIFont.systemFont(ofSize: 17, weight: .semibold)
        ]
        let navBarAppearance = UINavigationBarAppearance()
        navBarAppearance.configureWithDefaultBackground()
        navBarAppearance.largeTitleTextAttributes = largeTitleAttrs
        navBarAppearance.titleTextAttributes = inlineTitleAttrs

        UINavigationBar.appearance().standardAppearance = navBarAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navBarAppearance
        UINavigationBar.appearance().compactAppearance = navBarAppearance
    }

    @Environment(\.scenePhase) private var scenePhase
    @State private var appState = AppState()
    @State private var router = Router()
    @State private var backgroundTimestamp: Date?

    /// M28: Whether to show the privacy overlay (app switcher / inactive state).
    @State private var showPrivacyOverlay: Bool = false

    /// M26: User-configurable auto-lock timeout. Persisted via @AppStorage (UserDefaults).
    /// Default 300s (5 minutes) — balances security with usability for volunteers mid-shift.
    @AppStorage("autoLockTimeout") private var lockTimeout: TimeInterval = 300

    var body: some Scene {
        WindowGroup {
            ZStack {
                // Force-update screen blocks the entire app
                if appState.showForceUpdate {
                    UpdateRequiredView(hubURL: appState.authService.hubURL)
                } else {
                    VStack(spacing: 0) {
                        // Soft-update banner (dismissible)
                        if appState.showUpdateBanner {
                            UpdateBanner(onDismiss: {
                                appState.showUpdateBanner = false
                            })
                        }

                        ContentView()
                            .environment(appState)
                            .environment(router)
                    }
                }
            }
            .onAppear {
                // Sync router to initial auth state (onChange only fires on subsequent changes)
                router.resetForAuthStatus(appState.authStatus)
                // Check API version compatibility on launch
                appState.checkVersionCompatibility()
                // Install crash reporting handlers and upload pending reports
                appState.crashReportingService.install()
                appState.crashReportingService.uploadPendingInBackground()
            }
            .onChange(of: scenePhase) { oldPhase, newPhase in
                handleScenePhaseChange(from: oldPhase, to: newPhase)
            }
            .onChange(of: appState.authStatus) { _, newStatus in
                router.resetForAuthStatus(newStatus)
            }
            .overlay {
                // M28: Privacy overlay — hides sensitive content in app switcher
                if showPrivacyOverlay {
                    PrivacyOverlayView()
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.15), value: showPrivacyOverlay)
        }
    }

    // MARK: - Scene Phase Handling

    private func handleScenePhaseChange(from oldPhase: ScenePhase, to newPhase: ScenePhase) {
        switch newPhase {
        case .background:
            // Record when the app entered background for lock timeout calculation
            backgroundTimestamp = Date()
            showPrivacyOverlay = true

        case .active:
            // Check if the lock timeout has elapsed while in background
            if let timestamp = backgroundTimestamp {
                let elapsed = Date().timeIntervalSince(timestamp)
                if elapsed > lockTimeout && appState.authStatus == .unlocked {
                    appState.lockApp()
                }
            }
            backgroundTimestamp = nil
            showPrivacyOverlay = false

        case .inactive:
            // M28: Show privacy overlay when entering app switcher
            showPrivacyOverlay = true

        @unknown default:
            break
        }
    }
}

// MARK: - Privacy Overlay (M28)

/// Full-screen overlay shown when the app enters the background or app switcher.
/// Prevents screenshots of sensitive content (notes, keys) in the multitasking view.
private struct PrivacyOverlayView: View {
    var body: some View {
        ZStack {
            Color(.systemBackground)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(.secondary)

                Text(NSLocalizedString("privacy_overlay_title", comment: "Llamenos"))
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityIdentifier("privacy-overlay")
    }
}
