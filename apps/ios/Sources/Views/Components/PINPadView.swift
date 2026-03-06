import SwiftUI

// MARK: - PINPadView

/// Custom PIN entry pad using a button grid. No TextField or system keyboard is used,
/// avoiding keyboard-related testing issues (Detox, XCUITest) and preventing
/// autocorrect/paste/suggest from interfering with PIN entry.
///
/// The pad supports 4-6 digit PINs and calls `onComplete` when the PIN reaches
/// `maxLength`. Each button has an `accessibilityIdentifier` matching the project
/// convention (e.g., "pin-1", "pin-backspace").
struct PINPadView: View {
    @Binding var pin: String
    let maxLength: Int
    let onComplete: (String) -> Void

    init(pin: Binding<String>, maxLength: Int = 4, onComplete: @escaping (String) -> Void) {
        self._pin = pin
        self.maxLength = maxLength
        self.onComplete = onComplete
    }

    private let buttons: [[String]] = [
        ["1", "2", "3"],
        ["4", "5", "6"],
        ["7", "8", "9"],
        ["", "0", "backspace"],
    ]

    var body: some View {
        VStack(spacing: 24) {
            // PIN dots indicator
            HStack(spacing: 12) {
                ForEach(0..<maxLength, id: \.self) { index in
                    Circle()
                        .fill(index < pin.count ? Color.primary : Color.clear)
                        .overlay(
                            Circle()
                                .stroke(Color.secondary, lineWidth: 1.5)
                        )
                        .frame(width: 16, height: 16)
                        .animation(.easeInOut(duration: 0.15), value: pin.count)
                }
            }
            .accessibilityIdentifier("pin-dots")
            .padding(.bottom, 8)

            // Number grid
            VStack(spacing: 16) {
                ForEach(buttons, id: \.self) { row in
                    HStack(spacing: 24) {
                        ForEach(row, id: \.self) { label in
                            if label.isEmpty {
                                // Empty spacer cell
                                Color.clear
                                    .frame(width: 72, height: 72)
                            } else if label == "backspace" {
                                // Backspace button
                                Button {
                                    handleBackspace()
                                } label: {
                                    Image(systemName: "delete.left")
                                        .font(.title2)
                                        .foregroundStyle(.primary)
                                        .frame(width: 72, height: 72)
                                }
                                .accessibilityIdentifier("pin-backspace")
                                .accessibilityLabel(NSLocalizedString("pin_backspace", comment: "Delete last digit"))
                                .disabled(pin.isEmpty)
                            } else {
                                // Digit button
                                PINDigitButton(digit: label) {
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
    }

    // MARK: - Actions

    private func handleDigit(_ digit: String) {
        guard pin.count < maxLength else { return }
        pin.append(digit)
        if pin.count == maxLength {
            onComplete(pin)
        }
    }

    private func handleBackspace() {
        guard !pin.isEmpty else { return }
        pin.removeLast()
    }
}

// MARK: - PINDigitButton

/// Individual digit button in the PIN pad with a circular background.
private struct PINDigitButton: View {
    let digit: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(digit)
                .font(.brand(.title))
                .fontWeight(.medium)
                .foregroundStyle(.primary)
                .frame(width: 72, height: 72)
                .background(
                    Circle()
                        .fill(Color(.systemGray6))
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
            PINPadView(pin: $pin, maxLength: 4) { completed in
                print("PIN entered: \(completed)")
            }
        }
    }
    return PreviewWrapper()
}

#Preview("PIN Pad - Partial") {
    struct PreviewWrapper: View {
        @State private var pin = "12"
        var body: some View {
            PINPadView(pin: $pin, maxLength: 6) { completed in
                print("PIN entered: \(completed)")
            }
        }
    }
    return PreviewWrapper()
}
#endif
