import SwiftUI

// MARK: - ReportCreateView

/// Sheet view for creating a new report. Includes fields for title, category,
/// and a multi-line body. The body is E2EE encrypted before submission.
struct ReportCreateView: View {
    let categories: [String]
    let onSave: (String, String?, String) async -> Bool

    @Environment(\.dismiss) private var dismiss

    @State private var title: String = ""
    @State private var selectedCategory: String = ""
    @State private var bodyText: String = ""
    @State private var isSaving: Bool = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                // Title section
                Section {
                    TextField(
                        NSLocalizedString("report_title_placeholder", comment: "Report title"),
                        text: $title
                    )
                    .accessibilityIdentifier("report-title-input")
                } header: {
                    Text(NSLocalizedString("report_title_label", comment: "Title"))
                }

                // Category section
                if !categories.isEmpty {
                    Section {
                        Picker(
                            NSLocalizedString("report_category_label", comment: "Category"),
                            selection: $selectedCategory
                        ) {
                            Text(NSLocalizedString("report_category_none", comment: "None"))
                                .tag("")
                            ForEach(categories, id: \.self) { category in
                                Text(category).tag(category)
                            }
                        }
                        .accessibilityIdentifier("report-category-picker")
                    } header: {
                        Text(NSLocalizedString("report_category_header", comment: "Category"))
                    }
                }

                // Body section
                Section {
                    TextEditor(text: $bodyText)
                        .frame(minHeight: 150)
                        .font(.body)
                        .accessibilityIdentifier("report-body-input")
                } header: {
                    Text(NSLocalizedString("report_body_label", comment: "Description"))
                } footer: {
                    if bodyText.isEmpty {
                        Text(NSLocalizedString(
                            "report_body_hint",
                            comment: "Describe the incident in detail..."
                        ))
                        .foregroundStyle(.tertiary)
                    }
                }

                // Error display
                if let error = errorMessage {
                    Section {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityIdentifier("report-create-error")
                }
            }
            .navigationTitle(NSLocalizedString("report_create_title", comment: "New Report"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("cancel", comment: "Cancel")) {
                        dismiss()
                    }
                    .disabled(isSaving)
                    .accessibilityIdentifier("cancel-report-create")
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button(NSLocalizedString("report_submit", comment: "Submit")) {
                        Task { await submitReport() }
                    }
                    .disabled(!isFormValid || isSaving)
                    .fontWeight(.semibold)
                    .accessibilityIdentifier("report-submit-button")
                }
            }
            .loadingOverlay(
                isPresented: isSaving,
                message: NSLocalizedString("report_create_saving", comment: "Encrypting & submitting...")
            )
            .interactiveDismissDisabled(isSaving)
        }
    }

    // MARK: - Validation

    private var isFormValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    // MARK: - Submit

    private func submitReport() async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedBody = bodyText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty, !trimmedBody.isEmpty else { return }

        isSaving = true
        errorMessage = nil

        let category = selectedCategory.isEmpty ? nil : selectedCategory
        let success = await onSave(trimmedTitle, category, trimmedBody)

        if !success {
            isSaving = false
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Create Report") {
    ReportCreateView(
        categories: ["Legal", "Medical", "Housing", "Safety"],
        onSave: { _, _, _ in true }
    )
}
#endif
