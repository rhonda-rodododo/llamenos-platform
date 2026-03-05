import SwiftUI

extension Color {
    // Primary teal/cyan — matches web oklch(0.70 0.13 195) dark / oklch(0.45 0.12 195) light
    static let brandPrimary = Color("BrandPrimary")
    // Accent amber/gold — matches web oklch(0.78 0.14 70)
    static let brandAccent = Color("BrandAccent")

    // Direct color values for use without asset catalog
    static let brandTeal = Color(red: 0x51 / 255.0, green: 0xAF / 255.0, blue: 0xAE / 255.0)
    static let brandCyan = Color(red: 0x5B / 255.0, green: 0xC5 / 255.0, blue: 0xC5 / 255.0)
    static let brandDarkTeal = Color(red: 0x2D / 255.0, green: 0x9B / 255.0, blue: 0x9B / 255.0)
    static let brandNavy = Color(red: 0x02 / 255.0, green: 0x0A / 255.0, blue: 0x12 / 255.0)
}
