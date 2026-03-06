import SwiftUI

// MARK: - SecureTextField

/// A non-copyable text display for sensitive data like nsec keys. Disables all
/// text interaction (copy, paste, select, drag) so the nsec cannot be accidentally
/// or maliciously extracted via the clipboard.
///
/// The text is displayed in a monospaced font with word wrapping. The field is
/// read-only and non-interactive — it exists purely for visual display of the
/// nsec during onboarding backup confirmation.
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
                .accessibilityIdentifier("nsec-display")
                .accessibilityLabel(NSLocalizedString("nsec_display_label", comment: "Your secret key"))
                // Deliberately vague accessibility value to prevent screen reader from
                // reading the full nsec aloud in a shared space.
                .accessibilityValue(NSLocalizedString("nsec_display_value", comment: "Secret key is displayed. Keep this private."))
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
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(.systemGray6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color(.systemGray4), lineWidth: 1)
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
        "nsec1qqqsyqcyq5rqwzqfhg9scnmcesgvse3s43jy5wdxkfhmyzxhldqqu69m0z",
        label: NSLocalizedString("onboarding_nsec_label", comment: "Your Secret Key")
    )
    .padding()
}
#endif
