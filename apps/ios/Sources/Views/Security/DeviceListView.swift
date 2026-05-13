import SwiftUI

struct DeviceListView: View {
    @Environment(AppState.self) private var appState
    @State private var devices: [DeviceDetailListResponseDevice] = []
    @State private var loading = true

    var body: some View {
        List {
            if loading {
                ProgressView()
            } else {
                ForEach(devices, id: \.id) { device in
                    DeviceRow(device: device)
                }
            }
        }
        .navigationTitle(String(localized: "security.devices.title"))
        .task { await loadDevices() }
    }

    private func loadDevices() async {
        do {
            let response: DeviceDetailListResponse = try await appState.apiService.request(method: "GET", path: "/api/devices")
            self.devices = response.devices
        } catch {
            // Handle error
        }
        loading = false
    }
}

struct DeviceRow: View {
    let device: DeviceDetailListResponseDevice

    var body: some View {
        HStack {
            Image(systemName: device.platform == "ios" || device.platform == "android"
                ? "iphone" : "desktopcomputer")
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(device.deviceName ?? device.platform)
                        .font(.body)
                    if device.isCurrent {
                        Text("Current")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.blue.opacity(0.1))
                            .clipShape(Capsule())
                    }
                }
                if let model = device.deviceModel {
                    Text(model)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .accessibilityIdentifier("device-\(device.id)")
    }
}
