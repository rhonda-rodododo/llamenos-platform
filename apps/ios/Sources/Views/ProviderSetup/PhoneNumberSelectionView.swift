import SwiftUI

// MARK: - PhoneNumberTab

private enum PhoneNumberTab {
    case owned
    case search
}

// MARK: - PhoneNumberSelectionView

/// Phone number picker: existing numbers or search & provision a new one.
struct PhoneNumberSelectionView: View {
    @Bindable var viewModel: PhoneNumberViewModel
    let provider: ProviderType
    let onSelected: (OwnedNumber) -> Void

    @State private var selectedTab: PhoneNumberTab = .owned
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Picker(NSLocalizedString("provider_number_tab", comment: "Number Source"), selection: $selectedTab) {
                Text(NSLocalizedString("provider_your_numbers", comment: "Your Numbers"))
                    .tag(PhoneNumberTab.owned)
                Text(NSLocalizedString("provider_get_new_number", comment: "Get New"))
                    .tag(PhoneNumberTab.search)
            }
            .pickerStyle(.segmented)
            .padding()

            Divider()

            Group {
                switch selectedTab {
                case .owned:
                    ownedNumbersList
                case .search:
                    searchView
                }
            }
        }
        .navigationTitle(NSLocalizedString("provider_select_number_title", comment: "Select Number"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(NSLocalizedString("cancel", comment: "Cancel")) {
                    dismiss()
                }
            }
        }
        .task {
            await viewModel.loadOwnedNumbers(provider: provider)
        }
        .accessibilityIdentifier("phone-number-selection-view")
    }

    // MARK: - Owned Numbers

    private var ownedNumbersList: some View {
        Group {
            if viewModel.isLoadingOwned {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if viewModel.ownedNumbers.isEmpty {
                ContentUnavailableView(
                    NSLocalizedString("provider_no_numbers_title", comment: "No Numbers"),
                    systemImage: "phone.slash",
                    description: Text(NSLocalizedString("provider_no_numbers_desc", comment: "No numbers found. Get a new number below."))
                )
            } else {
                List(viewModel.ownedNumbers, id: \.id) { number in
                    OwnedNumberRow(number: number, isSelected: viewModel.selectedNumber?.id == number.id) {
                        onSelected(number)
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
    }

    // MARK: - Search View

    private var searchView: some View {
        Form {
            Section {
                Picker(NSLocalizedString("provider_search_country", comment: "Country"), selection: $viewModel.searchCountry) {
                    Text("United States (US)").tag("US")
                    Text("Canada (CA)").tag("CA")
                    Text("United Kingdom (GB)").tag("GB")
                    Text("Australia (AU)").tag("AU")
                    Text("Germany (DE)").tag("DE")
                    Text("France (FR)").tag("FR")
                }
                .accessibilityIdentifier("number-country-picker")

                HStack {
                    Text(NSLocalizedString("provider_area_code", comment: "Area Code"))
                    Spacer()
                    TextField(
                        NSLocalizedString("provider_area_code_optional", comment: "Optional"),
                        text: $viewModel.searchAreaCode
                    )
                    .multilineTextAlignment(.trailing)
                    .keyboardType(.phonePad)
                    .frame(width: 100)
                    .accessibilityIdentifier("number-area-code-field")
                }
            } header: {
                Text(NSLocalizedString("provider_search_criteria_header", comment: "Search Criteria"))
            }

            Section {
                Button {
                    Task { await viewModel.searchNumbers(provider: provider) }
                } label: {
                    HStack {
                        if viewModel.isSearching {
                            ProgressView().scaleEffect(0.8).padding(.trailing, 4)
                        } else {
                            Image(systemName: "magnifyingglass")
                        }
                        Text(NSLocalizedString("provider_search_numbers_button", comment: "Search Available Numbers"))
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isSearching)
                .accessibilityIdentifier("search-numbers-button")
            }

            if !viewModel.searchResults.isEmpty {
                Section {
                    ForEach(viewModel.searchResults, id: \.phoneNumber) { number in
                        AvailableNumberRow(number: number, isProvisioning: viewModel.isProvisioning) {
                            Task {
                                if let provisioned = await viewModel.provision(phoneNumber: number.phoneNumber, provider: provider) {
                                    onSelected(provisioned)
                                }
                            }
                        }
                    }
                } header: {
                    Text(NSLocalizedString("provider_available_numbers_header", comment: "Available Numbers"))
                }
            }

            if let error = viewModel.error {
                Section {
                    Label(error, systemImage: "exclamationmark.circle")
                        .font(.brand(.footnote))
                        .foregroundStyle(Color.brandDestructive)
                }
            }
        }
    }
}

// MARK: - OwnedNumberRow

private struct OwnedNumberRow: View {
    let number: OwnedNumber
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(number.phoneNumber)
                        .font(.brandMono(.body))
                        .foregroundStyle(.primary)

                    if let name = number.friendlyName {
                        Text(name)
                            .font(.brand(.caption))
                            .foregroundStyle(.secondary)
                    }

                    HStack(spacing: 4) {
                        ForEach(number.capabilities.prefix(3), id: \.self) { cap in
                            Text(cap)
                                .font(.brand(.caption2))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.brandPrimary.opacity(0.1))
                                .foregroundStyle(Color.brandPrimary)
                                .clipShape(Capsule())
                        }
                    }
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.brandPrimary)
                }
            }
        }
        .accessibilityIdentifier("owned-number-row-\(number.phoneNumber)")
    }
}

// MARK: - AvailableNumberRow

private struct AvailableNumberRow: View {
    let number: AvailableNumber
    let isProvisioning: Bool
    let onProvision: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(number.phoneNumber)
                    .font(.brandMono(.body))
                    .foregroundStyle(.primary)

                Text(number.providerType.displayName)
                    .font(.brand(.caption))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                onProvision()
            } label: {
                if isProvisioning {
                    ProgressView().scaleEffect(0.8)
                } else {
                    Text(NSLocalizedString("provider_get_number_button", comment: "Get"))
                        .font(.brand(.callout))
                        .fontWeight(.semibold)
                }
            }
            .buttonStyle(.bordered)
            .disabled(isProvisioning)
            .accessibilityIdentifier("provision-number-button-\(number.phoneNumber)")
        }
    }
}
