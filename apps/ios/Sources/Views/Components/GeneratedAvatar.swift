import SwiftUI

struct GeneratedAvatar: View {
    let hash: String
    var size: CGFloat = 40

    var body: some View {
        ZStack {
            Circle()
                .fill(avatarColor)
                .frame(width: size, height: size)

            Text(initials)
                .font(.system(size: size * 0.35, weight: .semibold, design: .monospaced))
                .foregroundStyle(.white)
        }
    }

    private var avatarColor: Color {
        guard hash.count >= 6 else { return .brandMutedForeground }
        let hexPrefix = String(hash.suffix(from: hash.index(hash.startIndex, offsetBy: max(0, hash.count >= 10 ? 4 : 0))).prefix(6))
        let hue = hexPrefix.unicodeScalars.reduce(0) { sum, char in sum + Int(char.value) } % 360
        return Color(hue: Double(hue) / 360.0, saturation: 0.55, brightness: 0.75)
    }

    private var initials: String {
        guard hash.count >= 2 else { return "?" }
        let start = hash.hasPrefix("npub1") ? hash.index(hash.startIndex, offsetBy: 5) : hash.startIndex
        return String(hash[start...].prefix(2)).uppercased()
    }
}
