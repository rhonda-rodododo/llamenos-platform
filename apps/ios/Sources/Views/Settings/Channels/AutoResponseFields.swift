import SwiftUI

struct AutoResponseFields: View {
    @Binding var autoResponse: String
    @Binding var afterHoursResponse: String

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(NSLocalizedString("channels_shared_auto_response", comment: "Auto-Response"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField(
                    NSLocalizedString("channels_shared_auto_response_placeholder", comment: "Auto-reply..."),
                    text: $autoResponse,
                    axis: .vertical
                )
                .lineLimit(2...4)
                .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(NSLocalizedString("channels_shared_after_hours_response", comment: "After-Hours Response"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField(
                    NSLocalizedString("channels_shared_after_hours_placeholder", comment: "After-hours reply..."),
                    text: $afterHoursResponse,
                    axis: .vertical
                )
                .lineLimit(2...4)
                .textFieldStyle(.roundedBorder)
            }
        }
    }
}
