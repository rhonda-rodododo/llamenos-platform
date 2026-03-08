import SwiftUI

/// Non-blocking banner shown when a newer app version is available but not required.
/// The user can dismiss it and continue using the app. Includes an App Store link.
struct UpdateBanner: View {
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.down.app")
                .foregroundStyle(.blue)
                .accessibilityHidden(true)

            Text(NSLocalizedString("updates_update_available_message", comment: "A new version is available"))
                .font(.subheadline)
                .lineLimit(2)

            Spacer()

            if let url = URL(string: "https://apps.apple.com/app/id\(AppConstants.appStoreId)") {
                Link(NSLocalizedString("updates_update_required_button", comment: "Update"), destination: url)
                    .font(.subheadline.bold())
            }

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .accessibilityLabel(NSLocalizedString("updates_update_available_dismiss", comment: "Dismiss"))
            .accessibilityIdentifier("dismiss-update-banner")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.blue.opacity(0.08))
        .accessibilityIdentifier("update-available-banner")
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Update Banner") {
    VStack {
        UpdateBanner(onDismiss: {})
        Spacer()
    }
}
#endif
