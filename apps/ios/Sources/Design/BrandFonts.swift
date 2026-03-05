import SwiftUI

extension Font {
    static func brand(_ style: Font.TextStyle) -> Font {
        switch style {
        case .largeTitle: return .custom("DM Sans", size: 34, relativeTo: .largeTitle).weight(.bold)
        case .title: return .custom("DM Sans", size: 28, relativeTo: .title).weight(.bold)
        case .title2: return .custom("DM Sans", size: 22, relativeTo: .title2).weight(.semibold)
        case .title3: return .custom("DM Sans", size: 20, relativeTo: .title3).weight(.semibold)
        case .headline: return .custom("DM Sans", size: 17, relativeTo: .headline).weight(.semibold)
        case .body: return .custom("DM Sans", size: 17, relativeTo: .body)
        case .callout: return .custom("DM Sans", size: 16, relativeTo: .callout)
        case .subheadline: return .custom("DM Sans", size: 15, relativeTo: .subheadline).weight(.medium)
        case .footnote: return .custom("DM Sans", size: 13, relativeTo: .footnote)
        case .caption: return .custom("DM Sans", size: 12, relativeTo: .caption)
        case .caption2: return .custom("DM Sans", size: 11, relativeTo: .caption2)
        default: return .custom("DM Sans", size: 17, relativeTo: .body)
        }
    }

    static func brandMono(_ style: Font.TextStyle) -> Font {
        .system(style, design: .monospaced)
    }
}
