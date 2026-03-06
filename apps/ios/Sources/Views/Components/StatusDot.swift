import SwiftUI

struct StatusDot: View {
    enum Status { case active, warning, inactive, error }

    let status: Status
    var animated: Bool = true

    @State private var isPulsing = false

    var body: some View {
        Circle()
            .fill(dotColor)
            .frame(width: 8, height: 8)
            .scaleEffect(isPulsing && animated && status == .active ? 1.3 : 1.0)
            .opacity(isPulsing && animated && status == .active ? 0.7 : 1.0)
            .animation(
                animated && status == .active
                    ? .easeInOut(duration: 1.2).repeatForever(autoreverses: true)
                    : .default,
                value: isPulsing
            )
            .onAppear {
                if animated && status == .active {
                    isPulsing = true
                }
            }
    }

    private var dotColor: Color {
        switch status {
        case .active: return .statusActive
        case .warning: return .statusWarning
        case .inactive: return .brandMutedForeground
        case .error: return .statusDanger
        }
    }
}
