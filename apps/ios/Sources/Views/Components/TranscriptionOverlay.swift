import SwiftUI

// MARK: - TranscriptionOverlay

/// Floating overlay that displays live transcription text during an active call.
/// Shows a compact, semi-transparent panel at the bottom of the screen with
/// real-time speech-to-text output. Includes controls to stop transcription
/// and copy the transcript.
struct TranscriptionOverlay: View {
    let transcriptionService: TranscriptionService
    let onDismiss: () -> Void

    @State private var isExpanded: Bool = true
    @State private var showCopied: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 0) {
                // Header bar with controls
                headerBar

                if isExpanded {
                    // Transcript content
                    transcriptContent
                }
            }
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(0.15), radius: 8, y: -2)
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .accessibilityIdentifier("transcription-overlay")
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack(spacing: 10) {
            // Status indicator
            HStack(spacing: 6) {
                statusDot
                Text(statusText)
                    .font(.brand(.caption))
                    .fontWeight(.medium)
                    .foregroundStyle(Color.brandForeground)
            }
            .accessibilityIdentifier("transcription-status")

            Spacer()

            // Copy button
            if !transcriptionService.liveTranscript.isEmpty {
                Button {
                    UIPasteboard.general.string = transcriptionService.liveTranscript
                    showCopied = true
                    Task {
                        try? await Task.sleep(for: .seconds(2))
                        showCopied = false
                    }
                } label: {
                    Image(systemName: showCopied ? "checkmark" : "doc.on.doc")
                        .font(.system(size: 14))
                        .foregroundStyle(showCopied ? .green : Color.brandMutedForeground)
                }
                .accessibilityIdentifier("transcription-copy")
            }

            // Collapse/expand toggle
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                Image(systemName: isExpanded ? "chevron.down" : "chevron.up")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color.brandMutedForeground)
            }
            .accessibilityIdentifier("transcription-toggle-expand")

            // Stop/dismiss button
            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Color.brandMutedForeground)
            }
            .accessibilityIdentifier("transcription-dismiss")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: - Transcript Content

    private var transcriptContent: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    if transcriptionService.liveTranscript.isEmpty {
                        Text(NSLocalizedString("transcription_no_speech_detected", comment: "No speech detected"))
                            .font(.brand(.subheadline))
                            .foregroundStyle(Color.brandMutedForeground)
                            .italic()
                            .padding(.horizontal, 14)
                    } else {
                        Text(transcriptionService.liveTranscript)
                            .font(.brand(.subheadline))
                            .foregroundStyle(Color.brandForeground)
                            .padding(.horizontal, 14)
                            .id("transcript-bottom")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
            }
            .frame(maxHeight: 150)
            .onChange(of: transcriptionService.liveTranscript) { _, _ in
                withAnimation {
                    proxy.scrollTo("transcript-bottom", anchor: .bottom)
                }
            }
        }
    }

    // MARK: - Status Indicators

    @ViewBuilder
    private var statusDot: some View {
        switch transcriptionService.state {
        case .transcribing:
            Circle()
                .fill(.red)
                .frame(width: 8, height: 8)
                .overlay(
                    Circle()
                        .stroke(.red.opacity(0.4), lineWidth: 2)
                        .scaleEffect(1.5)
                )
        case .stopped:
            Circle()
                .fill(.gray)
                .frame(width: 8, height: 8)
        case .error:
            Circle()
                .fill(.orange)
                .frame(width: 8, height: 8)
        default:
            Circle()
                .fill(.gray)
                .frame(width: 8, height: 8)
        }
    }

    private var statusText: String {
        switch transcriptionService.state {
        case .idle:
            return NSLocalizedString("transcription_starting_transcription", comment: "")
        case .requestingPermission:
            return NSLocalizedString("transcription_starting_transcription", comment: "")
        case .transcribing:
            return NSLocalizedString("transcription_transcription_active", comment: "")
        case .stopped:
            return NSLocalizedString("transcription_transcription_stopped", comment: "")
        case .error(let message):
            return message
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Transcription Overlay") {
    ZStack {
        Color.brandBackground.ignoresSafeArea()

        TranscriptionOverlay(
            transcriptionService: {
                let service = TranscriptionService()
                return service
            }(),
            onDismiss: {}
        )
    }
}
#endif
