import SwiftUI

// MARK: - SecureTextField

/// A non-copyable text display for sensitive data like device signing keys. Disables all
/// text interaction (copy, paste, select, drag) so the signing key cannot be accidentally
/// or maliciously extracted via the clipboard.
///
/// The text is displayed in a monospaced font with word wrapping. The field is
/// read-only and non-interactive — it exists purely for visual display of the
/// signing key during onboarding backup confirmation.
struct SecureTextField: View {
    let text: String
    let label: String

    init(_ text: String, label: String = "") {
        self.text = text
        self.label = label
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !label.isEmpty {
                Text(label)
                    .font(.brand(.caption))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                    .accessibilityHidden(true)
            }

            SecureTextContent(text: text)
                .accessibilityIdentifier("device-key-display")
                .accessibilityLabel(NSLocalizedString("device_key_display_label", comment: "Your signing key"))
                // Deliberately vague accessibility value to prevent screen reader from
                // reading the full signing key aloud in a shared space.
                .accessibilityValue(NSLocalizedString("device_key_display_value", comment: "Signing key is displayed. Keep this private."))
        }
    }
}

// MARK: - SecureTextContent

/// The inner text display with all copy/paste/selection disabled.
private struct SecureTextContent: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.brandMono(.body))
            .foregroundStyle(.primary)
            .lineLimit(nil)
            .multilineTextAlignment(.leading)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.brandCard)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.brandAccent.opacity(0.6), lineWidth: 1)
            )
            // Disable all text interaction to prevent copy/paste
            .textSelection(.disabled)
            // Prevent drag
            .contentShape(.interaction, Rectangle())
    }
}

// MARK: - Preview

#if DEBUG
#Preview("SecureTextField") {
    SecureTextField(
        "ed25519_seed:0000000000000000000000000000000000000000000000000000000000000001", // gitleaks:allow
        label: NSLocalizedString("onboarding_device_key_label", comment: "Your Signing Key")
    )
    .padding()
}
#endif
