import SwiftUI

// MARK: - AdminTranscriptionSettingsView

/// Admin view for configuring transcription settings. Controls global
/// transcription enable/disable and volunteer opt-out permissions.
struct AdminTranscriptionSettingsView: View {
    @Bindable var viewModel: AdminViewModel

    var body: some View {
        Form {
            if viewModel.isLoadingTranscription {
                Section {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                }
            } else {
                transcriptionSection
                optOutSection
                saveSection

                if let error = viewModel.errorMessage {
                    Section {
                        Text(error)
                            .font(.brand(.footnote))
                            .foregroundStyle(Color.brandDestructive)
                    }
                }

                if let success = viewModel.successMessage {
                    Section {
                        Text(success)
                            .font(.brand(.footnote))
                            .foregroundStyle(.green)
                    }
                }
            }
        }
        .navigationTitle(NSLocalizedString("admin_transcription_settings", comment: "Transcription"))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.loadTranscriptionSettings()
        }
        .accessibilityIdentifier("transcription-settings-view")
    }

    // MARK: - Transcription Toggle

    private var transcriptionSection: some View {
        Section {
            Toggle(isOn: Binding(
                get: { viewModel.transcriptionSettings.enabled },
                set: { viewModel.transcriptionSettings.enabled = $0 }
            )) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(NSLocalizedString(
                        "admin_transcription_enabled",
                        comment: "Enable Transcription"
                    ))
                    .font(.brand(.body))

                    Text(NSLocalizedString(
                        "admin_transcription_enabled_description",
                        comment: "Automatically transcribe calls using client-side Whisper. Audio never leaves the device."
                    ))
                    .font(.brand(.caption))
                    .foregroundStyle(Color.brandMutedForeground)
                }
            }
            .tint(Color.brandPrimary)
            .accessibilityIdentifier("transcription-enabled-toggle")
        } header: {
            Text(NSLocalizedString("admin_transcription_header", comment: "Transcription"))
        }
    }

    // MARK: - Opt-Out Section

    private var optOutSection: some View {
        Section {
            Toggle(isOn: Binding(
                get: { viewModel.transcriptionSettings.allowVolunteerOptOut },
                set: { viewModel.transcriptionSettings.allowVolunteerOptOut = $0 }
            )) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(NSLocalizedString(
                        "admin_transcription_opt_out",
                        comment: "Allow Volunteer Opt-Out"
                    ))
                    .font(.brand(.body))

                    Text(NSLocalizedString(
                        "admin_transcription_opt_out_description",
                        comment: "Let volunteers disable transcription for their own calls."
                    ))
                    .font(.brand(.caption))
                    .foregroundStyle(Color.brandMutedForeground)
                }
            }
            .tint(Color.brandPrimary)
            .disabled(!viewModel.transcriptionSettings.enabled)
            .accessibilityIdentifier("transcription-opt-out-toggle")
        } header: {
            Text(NSLocalizedString("admin_transcription_volunteer_header", comment: "Volunteer Settings"))
        } footer: {
            if !viewModel.transcriptionSettings.enabled {
                Text(NSLocalizedString(
                    "admin_transcription_disabled_note",
                    comment: "Enable transcription above to configure volunteer opt-out."
                ))
                .font(.brand(.caption))
            }
        }
    }

    // MARK: - Save Section

    private var saveSection: some View {
        Section {
            Button {
                Task { await viewModel.saveTranscriptionSettings() }
            } label: {
                HStack {
                    Spacer()
                    if viewModel.isSavingTranscription {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else {
                        Text(NSLocalizedString("admin_save", comment: "Save"))
                            .fontWeight(.semibold)
                    }
                    Spacer()
                }
            }
            .disabled(viewModel.isSavingTranscription)
            .accessibilityIdentifier("transcription-save-button")
        }
    }
}
