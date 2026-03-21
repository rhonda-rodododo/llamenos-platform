import SwiftUI

/// Onboarding screen: displays the generated nsec for the user to back up.
/// Shows a "copy to clipboard" button, a confirmation checkbox, and a continue
/// button that proceeds to PIN setup. The nsec is displayed using `SecureTextField`
/// which prevents copy/paste/selection of the text itself.
struct OnboardingView: View {
    @Environment(AppState.self) private var appState
    @Environment(Router.self) private var router

    let nsec: String
    let npub: String

    @State private var hasConfirmedBackup: Bool = false
    @State private var hasCopied: Bool = false
    @State private var keyScale: CGFloat = 0.8

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                StepIndicator(totalSteps: 3, currentStep: 2)

                // Header
                VStack(spacing: 12) {
                    Image(systemName: "key.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(.orange)
                        .scaleEffect(keyScale)
                        .onAppear {
                            withAnimation(.spring(response: 0.6, dampingFraction: 0.6)) {
                                keyScale = 1.0
                            }
                        }
                        .accessibilityHidden(true)

                    Text(NSLocalizedString("onboarding_title", comment: "Your Secret Key"))
                        .font(.brand(.title))
                        .fontWeight(.bold)

                    Text(NSLocalizedString(
                        "onboarding_subtitle",
                        comment: "Write down your secret key and store it safely. You will need it to recover your account. This key will never be shown again."
                    ))
                    .font(.brand(.subheadline))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                }
                .padding(.top, 24)

                // Nsec display — M28: marked as privacy-sensitive to redact in screenshots
                SecureTextField(
                    nsec,
                    label: NSLocalizedString("onboarding_nsec_label", comment: "Secret Key (nsec)")
                )
                .privacySensitive()
                .padding(4)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.brandCard)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.brandAccent.opacity(0.5), lineWidth: 1)
                )

                // Copy button — copies to clipboard for one-time use
                Button {
                    UIPasteboard.general.string = nsec
                    hasCopied = true
                    // Auto-clear clipboard after 60 seconds for security
                    DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
                        if UIPasteboard.general.string == nsec {
                            UIPasteboard.general.string = ""
                        }
                    }
                } label: {
                    Label(
                        hasCopied
                            ? NSLocalizedString("onboarding_copied", comment: "Copied!")
                            : NSLocalizedString("onboarding_copy", comment: "Copy to Clipboard"),
                        systemImage: hasCopied ? "checkmark.circle.fill" : "doc.on.doc"
                    )
                    .font(.brand(.subheadline))
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(hasCopied ? Color.green.opacity(0.15) : Color.brandCard)
                    .foregroundStyle(hasCopied ? .green : Color.brandPrimary)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(hasCopied ? Color.green.opacity(0.3) : Color.brandBorder, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("copy-nsec")

                // Public key display (informational)
                VStack(alignment: .leading, spacing: 4) {
                    Text(NSLocalizedString("onboarding_npub_label", comment: "Your Public Key"))
                        .font(.brand(.caption))
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)

                    Text(npub)
                        .font(.brandMono(.caption))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .accessibilityIdentifier("npub-display")
                }

                // Warning
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(Color.brandAccent)
                        .font(.title3)

                    Text(NSLocalizedString(
                        "onboarding_warning",
                        comment: "If you lose this key, you will permanently lose access to your account. There is no recovery mechanism."
                    ))
                    .font(.brand(.footnote))
                    .foregroundStyle(.secondary)
                }
                .padding(16)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.brandAccent.opacity(0.15))
                )

                // Confirmation checkbox
                Button {
                    hasConfirmedBackup.toggle()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: hasConfirmedBackup ? "checkmark.square.fill" : "square")
                            .font(.title3)
                            .foregroundStyle(hasConfirmedBackup ? Color.brandPrimary : .secondary)

                        Text(NSLocalizedString(
                            "onboarding_confirm_backup",
                            comment: "I have saved my secret key in a safe place"
                        ))
                        .font(.brand(.subheadline))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                    }
                }
                .accessibilityIdentifier("confirm-backup")

                // Continue button
                Button {
                    router.showPINSet()
                } label: {
                    Text(NSLocalizedString("onboarding_continue", comment: "Continue"))
                        .font(.brand(.headline))
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.brandPrimary)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .disabled(!hasConfirmedBackup)
                .opacity(hasConfirmedBackup ? 1.0 : 0.5)
                .accessibilityIdentifier("continue-to-pin")

                Spacer(minLength: 40)
            }
            .padding(.horizontal, 24)
        }
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    router.goBack()
                } label: {
                    Image(systemName: "chevron.left")
                }
                .accessibilityIdentifier("back-button")
                .accessibilityLabel(NSLocalizedString("navigation_back", comment: "Back"))
            }
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Onboarding View") {
    NavigationStack {
        OnboardingView(
            nsec: "nsec1qqqsyqcyq5rqwzqfhg9scnmcesgvse3s43jy5wdxkfhmyzxhldqqu69m0z",
            npub: "npub1qqqsyqcyq5rqwzqfhg9scnmcesgvse3s43jy5wdxkfhmyzxhldqqsnefgh"
        )
        .environment(AppState(hubContext: HubContext()))
        .environment(Router())
    }
}
#endif
