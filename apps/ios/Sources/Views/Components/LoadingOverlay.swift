import SwiftUI

// MARK: - LoadingOverlay

/// Full-screen semi-transparent loading indicator. Covers the entire screen to block
/// user interaction during async operations (PIN verification, network requests, etc.).
///
/// Usage:
/// ```swift
/// .overlay {
///     if isLoading {
///         LoadingOverlay(message: "Verifying...")
///     }
/// }
/// ```
struct LoadingOverlay: View {
    let message: String?

    init(message: String? = nil) {
        self.message = message
    }

    var body: some View {
        ZStack {
            // Semi-transparent background that blocks interaction
            Color.black.opacity(0.3)
                .ignoresSafeArea()

            // Centered loading card
            VStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .scaleEffect(1.2)
                    .tint(.brandPrimary)

                if let message {
                    Text(message)
                        .font(.brand(.subheadline))
                        .foregroundStyle(Color.brandForeground)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(24)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(.ultraThinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.brandBorder, lineWidth: 1)
            )
        }
        .accessibilityIdentifier("loading-overlay")
        .accessibilityLabel(message ?? NSLocalizedString("loading", comment: "Loading"))
        .accessibilityAddTraits(.isModal)
        // Prevent taps from passing through
        .allowsHitTesting(true)
        .transition(.opacity.animation(.easeInOut(duration: 0.2)))
    }
}

// MARK: - View Extension

extension View {
    /// Conditionally show a loading overlay on top of this view.
    func loadingOverlay(isPresented: Bool, message: String? = nil) -> some View {
        self.overlay {
            if isPresented {
                LoadingOverlay(message: message)
            }
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Loading Overlay") {
    ZStack {
        Color.blue.opacity(0.2).ignoresSafeArea()
        Text("Background Content")
            .font(.brand(.largeTitle))
    }
    .overlay {
        LoadingOverlay(message: NSLocalizedString("loading_verifying_pin", comment: "Verifying PIN..."))
    }
}

#Preview("Loading Overlay - No Message") {
    ZStack {
        Color.green.opacity(0.2).ignoresSafeArea()
        Text("Background Content")
    }
    .overlay {
        LoadingOverlay()
    }
}
#endif
