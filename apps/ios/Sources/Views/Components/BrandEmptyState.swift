import SwiftUI

struct BrandEmptyState: View {
    let icon: String
    let title: String
    let message: String
    var action: (() -> Void)? = nil
    var actionLabel: String? = nil

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 48))
                .foregroundStyle(Color.brandMutedForeground)

            Text(title)
                .font(.brand(.headline))
                .foregroundStyle(Color.brandForeground)

            Text(message)
                .font(.brand(.subheadline))
                .foregroundStyle(Color.brandMutedForeground)
                .multilineTextAlignment(.center)

            if let action, let actionLabel {
                Button(action: action) {
                    Text(actionLabel)
                        .font(.brand(.subheadline))
                        .fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .tint(.brandPrimary)
            }
        }
        .padding(32)
    }
}
