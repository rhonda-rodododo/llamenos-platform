import SwiftUI
import UserNotifications

/// The main entry point for the Llamenos iOS app. Manages the app lifecycle,
/// injects the root `AppState` into the environment, handles background
/// lock timeout (M26: user-configurable), screenshot protection (M28),
/// push notifications (APNs), and deep linking.
@main
struct LlamenosApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    @Environment(\.scenePhase) private var scenePhase
    @State private var hubContext: HubContext
    @State private var appState: AppState
    @State private var router = Router()

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

        let ctx = HubContext()
        _hubContext = State(initialValue: ctx)
        _appState = State(initialValue: AppState(hubContext: ctx))
    }
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
                            .environment(hubContext)
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
                // Register for push notifications
                requestPushNotificationPermission()
                // Inject appState into the delegate so it can forward push tokens
                appDelegate.appState = appState
            }
            .onOpenURL { url in
                handleDeepLink(url)
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

    // MARK: - Push Notifications

    /// Request notification authorization and register for remote notifications.
    private func requestPushNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error {
                print("[APNs] Authorization error: \(error.localizedDescription)")
                return
            }
            if granted {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }

    // MARK: - Deep Linking

    /// Handle `llamenos://` deep link URLs and navigate to the appropriate screen.
    private func handleDeepLink(_ url: URL) {
        guard url.scheme == "llamenos" else { return }
        guard appState.authStatus == .unlocked else { return }

        let host = url.host ?? ""
        let pathComponents = url.pathComponents.filter { $0 != "/" }

        switch host {
        case "cases":
            if let caseId = pathComponents.first {
                router.navigate(to: .caseDetail(id: caseId))
            } else {
                router.navigate(to: .cases)
            }
        case "notes":
            if let noteId = pathComponents.first {
                router.navigate(to: .noteDetail(id: noteId))
            } else {
                router.navigate(to: .notes)
            }
        case "calls":
            if let callId = pathComponents.first {
                router.navigate(to: .callDetail(id: callId))
            } else {
                router.navigate(to: .callHistory)
            }
        case "conversations":
            if let conversationId = pathComponents.first {
                router.navigate(to: .conversationDetail(id: conversationId))
            } else {
                router.navigate(to: .conversations)
            }
        case "reports":
            if let reportId = pathComponents.first {
                router.navigate(to: .reportDetail(id: reportId))
            } else {
                router.navigate(to: .reports)
            }
        case "settings":
            router.navigate(to: .settings)
        case "admin":
            if appState.isAdmin {
                router.navigate(to: .admin)
            }
        default:
            break
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

// MARK: - AppDelegate (Push Notifications)

/// UIKit-based AppDelegate for handling APNs push notification callbacks.
/// SwiftUI's `@UIApplicationDelegateAdaptor` bridges this into the app lifecycle.
final class AppDelegate: NSObject, UIApplicationDelegate {
    /// Injected by LlamenosApp on appear so the delegate can forward push tokens.
    var appState: AppState?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let tokenHex = deviceToken.map { String(format: "%02x", $0) }.joined()
        print("[APNs] Device token registered: \(tokenHex.prefix(12))...")

        guard let appState else { return }
        Task {
            do {
                try await appState.wakeKeyService.registerDevice(pushToken: tokenHex)
            } catch {
                print("[APNs] Device registration failed: \(error.localizedDescription)")
            }
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[APNs] Registration failed: \(error.localizedDescription)")
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        guard let appState else {
            completionHandler(.noData)
            return
        }

        // Decrypt the ECIES-encrypted wake payload if present
        guard let encryptedHex = userInfo["encrypted"] as? String else {
            completionHandler(.noData)
            return
        }

        do {
            let decryptedJSON = try appState.wakeKeyService.decryptWakePayload(encryptedHex: encryptedHex)
            print("[APNs] Decrypted wake payload: \(decryptedJSON.prefix(80))...")

            // Parse the decrypted payload and post a local notification
            if let data = decryptedJSON.data(using: .utf8),
               let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let content = UNMutableNotificationContent()
                content.title = payload["title"] as? String
                    ?? NSLocalizedString("notification_incoming_call", comment: "Incoming Call")
                content.body = payload["body"] as? String
                    ?? NSLocalizedString("notification_call_body", comment: "A caller needs assistance")
                content.sound = .default

                // Switch to the notified hub before posting the local notification
                if let hubId = payload["hubId"] as? String {
                    Task { @MainActor in
                        appState.hubContext.setActiveHub(hubId)
                    }
                    content.userInfo["hubId"] = hubId
                }

                // Attach deep link data for navigation on tap
                if let type = payload["type"] as? String {
                    content.userInfo["deepLinkType"] = type
                }
                if let entityId = payload["entityId"] as? String {
                    content.userInfo["deepLinkEntityId"] = entityId
                }

                let request = UNNotificationRequest(
                    identifier: UUID().uuidString,
                    content: content,
                    trigger: nil
                )
                UNUserNotificationCenter.current().add(request)
            }

            completionHandler(.newData)
        } catch {
            print("[APNs] Wake payload decryption failed: \(error.localizedDescription)")
            completionHandler(.failed)
        }
    }
}

// MARK: - UNUserNotificationCenterDelegate (Notification Tap Routing)

extension AppDelegate: UNUserNotificationCenterDelegate {
    /// Called when the user taps a delivered notification while the app is foregrounded or from the lock screen.
    /// Reads `hubId` from `userInfo`, switches the active hub, then navigates to the entity.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo

        if let hubId = userInfo["hubId"] as? String {
            appState?.hubContext.setActiveHub(hubId)
        }

        if let deepLinkType = userInfo["deepLinkType"] as? String,
           let entityId = userInfo["deepLinkEntityId"] as? String {
            Task { @MainActor in
                // TODO: navigate via router — requires router access from AppDelegate.
                // LlamenosApp posts a Notification or uses a shared NavigationBus to bridge this.
                _ = (deepLinkType, entityId)
            }
        }

        completionHandler()
    }

    /// Allow notifications to display as banners even when the app is in the foreground.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
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
