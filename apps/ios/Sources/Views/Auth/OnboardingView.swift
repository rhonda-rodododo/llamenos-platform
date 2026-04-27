import SwiftUI

/// Onboarding view placeholder.
/// In the v3 device key model, there is no nsec to display for backup.
/// Device keys are generated atomically with PIN encryption.
/// Multi-device support uses device linking (QR + ECDH) instead.
/// This file is retained as a stub to avoid breaking localization references.
struct OnboardingView: View {
    @Environment(Router.self) private var router

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "key.fill")
                .font(.system(size: 40))
                .foregroundStyle(.orange)

            Text(NSLocalizedString("onboarding_title", comment: "Your Device Identity"))
                .font(.brand(.title))
                .fontWeight(.bold)

            Text(NSLocalizedString(
                "onboarding_v3_subtitle",
                comment: "Your device keys are generated securely on this device and protected by your PIN."
            ))
            .font(.brand(.subheadline))
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)

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
            .accessibilityIdentifier("continue-to-pin")
        }
        .padding(.horizontal, 24)
    }
}
