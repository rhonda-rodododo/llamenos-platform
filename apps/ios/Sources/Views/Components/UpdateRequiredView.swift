import SwiftUI

/// Full-screen blocking view shown when the app's API version is too old
/// to communicate with the server. The user must update to continue.
/// Includes an App Store link and a "Contact admin" fallback with the hub URL.
struct UpdateRequiredView: View {
    let hubURL: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "exclamationmark.arrow.circlepath")
                .font(.system(size: 64))
                .foregroundStyle(.orange)
                .accessibilityHidden(true)

            Text(NSLocalizedString("updates_update_required_title", comment: "Update Required"))
                .font(.title2.bold())

            Text(NSLocalizedString("updates_update_required_message", comment: "Your app is out of date"))
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            if let url = URL(string: "https://apps.apple.com/app/id\(AppConstants.appStoreId)") {
                Link(NSLocalizedString("updates_update_required_button", comment: "Update Now"), destination: url)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
            }

            Spacer()

            // Fallback: show hub URL so the user can contact their admin
            if let hubURL, !hubURL.isEmpty {
                VStack(spacing: 8) {
                    Text(NSLocalizedString("updates_contact_admin", comment: "Contact your administrator"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(hubURL)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .textSelection(.enabled)
                }
                .padding(.bottom, 32)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        .accessibilityIdentifier("update-required-screen")
    }
}

// MARK: - App Constants

enum AppConstants {
    /// Apple App Store ID. Replace with the real ID after first App Store submission.
    static let appStoreId = "6450000000"
}

// MARK: - Preview

#if DEBUG
#Preview("Update Required") {
    UpdateRequiredView(hubURL: "https://hub.llamenos.org")
}
#endif
