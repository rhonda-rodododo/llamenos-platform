import SwiftUI

// MARK: - PINPadView

/// Custom PIN entry pad using a button grid. No TextField or system keyboard is used,
/// avoiding keyboard-related testing issues (Detox, XCUITest) and preventing
/// autocorrect/paste/suggest from interfering with PIN entry.
///
/// The pad supports 6-8 digit PINs and calls `onComplete` when the PIN reaches
/// `maxLength`. Each button has an `accessibilityIdentifier` matching the project
/// convention (e.g., "pin-1", "pin-backspace").
struct PINPadView: View {
    @Binding var pin: String
    let maxLength: Int
    let onComplete: (String) -> Void
    var shake: Binding<Bool>?

    @State private var shakeOffset: CGFloat = 0
    @State private var dotScales: [CGFloat] = []
    @State private var previousPinCount: Int = 0

    init(
        pin: Binding<String>,
        maxLength: Int = 8,
        shake: Binding<Bool>? = nil,
        onComplete: @escaping (String) -> Void
    ) {
        self._pin = pin
        self.maxLength = maxLength
        self.shake = shake
        self.onComplete = onComplete
    }

    private let buttons: [[String]] = [
        ["1", "2", "3"],
        ["4", "5", "6"],
        ["7", "8", "9"],
        ["", "0", "backspace"],
    ]

    private let buttonSize: CGFloat = 64
    private let buttonSpacing: CGFloat = 16
    private let rowSpacing: CGFloat = 12

    var body: some View {
        VStack(spacing: 16) {
            // PIN dots indicator
            HStack(spacing: 12) {
                ForEach(0..<maxLength, id: \.self) { index in
                    let isFilled = index < pin.count
                    Circle()
                        .fill(isFilled ? Color.brandPrimary : Color.clear)
                        .overlay(
                            Circle()
                                .stroke(isFilled ? Color.brandPrimary : Color.brandBorder, lineWidth: 1.5)
                        )
                        .frame(width: 14, height: 14)
                        .scaleEffect(index < dotScales.count ? dotScales[index] : 1.0)
                        .animation(.easeInOut(duration: 0.15), value: pin.count)
                }
            }
            .offset(x: shakeOffset)
            .accessibilityIdentifier("pin-dots")
            .padding(.bottom, 4)

            // Number grid
            VStack(spacing: rowSpacing) {
                ForEach(buttons, id: \.self) { row in
                    HStack(spacing: buttonSpacing) {
                        ForEach(row, id: \.self) { label in
                            if label.isEmpty {
                                // Empty spacer cell
                                Color.clear
                                    .frame(width: buttonSize, height: buttonSize)
                            } else if label == "backspace" {
                                // Backspace button
                                Button {
                                    handleBackspace()
                                } label: {
                                    Image(systemName: "delete.left")
                                        .font(.title3)
                                        .foregroundStyle(.primary)
                                        .frame(width: buttonSize, height: buttonSize)
                                }
                                .accessibilityIdentifier("pin-backspace")
                                .accessibilityLabel(NSLocalizedString("pin_backspace", comment: "Delete last digit"))
                                .disabled(pin.isEmpty)
                            } else {
                                // Digit button
                                PINDigitButton(digit: label, size: buttonSize) {
                                    handleDigit(label)
                                }
                            }
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("pin-pad")
        .onAppear {
            dotScales = Array(repeating: 1.0, count: maxLength)
            previousPinCount = pin.count
        }
        .onChange(of: pin.count) { oldValue, newValue in
            // Animate scale-up when a dot becomes filled
            if newValue > oldValue, newValue <= maxLength, newValue - 1 < dotScales.count {
                let filledIndex = newValue - 1
                withAnimation(.spring(response: 0.2, dampingFraction: 0.5)) {
                    dotScales[filledIndex] = 1.3
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                        dotScales[filledIndex] = 1.0
                    }
                }
            }
        }
        .onChange(of: shake?.wrappedValue ?? false) { _, newValue in
            if newValue {
                Haptics.error()
                withAnimation(Animation.linear(duration: 0.08).repeatCount(5, autoreverses: true)) {
                    shakeOffset = 10
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    shakeOffset = 0
                    shake?.wrappedValue = false
                }
            }
        }
    }

    // MARK: - Actions

    private func handleDigit(_ digit: String) {
        guard pin.count < maxLength else { return }
        Haptics.impact(.light)
        pin.append(digit)
        if pin.count == maxLength {
            onComplete(pin)
        }
    }

    private func handleBackspace() {
        guard !pin.isEmpty else { return }
        Haptics.impact(.rigid)
        pin.removeLast()
    }
}

// MARK: - PINDigitButton

/// Individual digit button in the PIN pad with a circular background.
private struct PINDigitButton: View {
    let digit: String
    let size: CGFloat
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(digit)
                .font(.brand(.title2))
                .fontWeight(.medium)
                .foregroundStyle(Color.brandForeground)
                .frame(width: size, height: size)
                .background(
                    Circle()
                        .fill(Color.brandCard)
                )
                .overlay(
                    Circle()
                        .stroke(Color.brandBorder, lineWidth: 1)
                )
        }
        .accessibilityIdentifier("pin-\(digit)")
        .accessibilityLabel(digit)
    }
}

// MARK: - Preview

#if DEBUG
#Preview("PIN Pad - Empty") {
    struct PreviewWrapper: View {
        @State private var pin = ""
        var body: some View {
            PINPadView(pin: $pin, maxLength: 4) { _ in }
        }
    }
    return PreviewWrapper()
}

#Preview("PIN Pad - Partial") {
    struct PreviewWrapper: View {
        @State private var pin = "12"
        var body: some View {
            PINPadView(pin: $pin, maxLength: 6) { _ in }
        }
    }
    return PreviewWrapper()
}
#endif
