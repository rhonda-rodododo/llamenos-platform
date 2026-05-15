import SwiftUI

/// Non-dismissable screen shown after a remote device wipe.
/// The user cannot navigate away — the app is effectively dead.
struct DeviceWipeReceiptView: View {
    let reason: String

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            Image(systemName: "lock.shield.fill")
                .font(.system(size: 80))
                .foregroundStyle(Color.brandDestructive)

            Text(NSLocalizedString("device_wipe_title", comment: "Access Revoked"))
                .font(.brand(.title))
                .multilineTextAlignment(.center)

            Text(NSLocalizedString(
                "device_wipe_message",
                comment: "Your access to this device has been revoked. All local data has been securely erased."
            ))
            .font(.brand(.body))
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)

            Text(reasonDisplay)
                .font(.brand(.subheadline))
                .foregroundStyle(.tertiary)

            Text(NSLocalizedString(
                "device_wipe_contact_admin",
                comment: "Contact your hub administrator for assistance."
            ))
            .font(.brand(.footnote))
            .foregroundStyle(.tertiary)
            .padding(.top, 8)

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.brandBackground)
        .interactiveDismissDisabled()
        .accessibilityIdentifier("device-wipe-receipt")
    }

    private var reasonDisplay: String {
        switch reason {
        case "user-erasure":
            return NSLocalizedString("device_wipe_reason_user_erasure", comment: "Account erasure")
        case "device-revocation":
            return NSLocalizedString("device_wipe_reason_device_revocation", comment: "Device revoked")
        case "admin-erasure":
            return NSLocalizedString("device_wipe_reason_admin_erasure", comment: "Account removed by administrator")
        default:
            return reason
        }
    }
}
