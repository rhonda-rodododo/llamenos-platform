import SwiftUI

struct ConnectionTestButton: View {
    let channel: String
    let disabled: Bool
    let onTest: (String) async throws -> Bool

    @State private var testing = false
    @State private var result: Bool?

    var body: some View {
        HStack(spacing: 8) {
            Button {
                Task { await runTest() }
            } label: {
                if testing {
                    ProgressView()
                        .controlSize(.small)
                    Text(NSLocalizedString("channels_shared_testing", comment: "Testing..."))
                } else {
                    Text(NSLocalizedString("channels_shared_test_connection", comment: "Test Connection"))
                }
            }
            .disabled(disabled || testing)

            if let result {
                Image(systemName: result ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundStyle(result ? .green : .red)
                Text(result
                    ? NSLocalizedString("channels_shared_test_success", comment: "Connected")
                    : NSLocalizedString("channels_shared_test_failed", comment: "Failed"))
                .font(.caption)
                .foregroundStyle(result ? .green : .red)
            }
        }
    }

    private func runTest() async {
        testing = true
        result = nil
        do {
            result = try await onTest(channel)
        } catch {
            result = false
        }
        testing = false
    }
}
