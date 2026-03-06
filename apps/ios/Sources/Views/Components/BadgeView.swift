import SwiftUI

struct BadgeView: View {
    let text: String
    var icon: String? = nil
    var color: Color = .brandPrimary
    var style: BadgeStyle = .filled

    enum BadgeStyle { case filled, outlined, subtle }

    var body: some View {
        HStack(spacing: 4) {
            if let icon {
                Image(systemName: icon)
                    .font(.caption2)
            }
            Text(text)
                .font(.brand(.caption2))
                .fontWeight(.medium)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .foregroundStyle(foregroundColor)
        .background(
            Capsule()
                .fill(backgroundColor)
        )
        .overlay(
            Capsule()
                .stroke(borderColor, lineWidth: style == .outlined ? 1 : 0)
        )
    }

    private var foregroundColor: Color {
        switch style {
        case .filled: return .brandPrimaryForeground
        case .outlined: return color
        case .subtle: return color
        }
    }

    private var backgroundColor: Color {
        switch style {
        case .filled: return color
        case .outlined: return .clear
        case .subtle: return color.opacity(0.12)
        }
    }

    private var borderColor: Color {
        switch style {
        case .outlined: return color
        default: return .clear
        }
    }
}
