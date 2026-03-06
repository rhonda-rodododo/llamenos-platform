import SwiftUI

struct CopyConfirmationBanner: View {
    let message: String

    init(_ message: String = "Copied to clipboard") {
        self.message = message
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Color.statusActive)
            Text(message)
                .font(.brand(.subheadline))
                .foregroundStyle(Color.brandForeground)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            Capsule()
                .fill(Color.brandCard)
                .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
        )
        .overlay(
            Capsule()
                .stroke(Color.brandBorder, lineWidth: 1)
        )
        .padding(.bottom, 16)
    }
}
