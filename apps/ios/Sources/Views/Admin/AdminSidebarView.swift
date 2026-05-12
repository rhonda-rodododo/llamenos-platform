import SwiftUI

struct AdminSidebarView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedSection: AdminNavItem?
    
    var body: some View {
        List(selection: $selectedSection) {
            Section(header: Text(NSLocalizedString("adminNav_scopes_thisHub", comment: "This Hub"))
                .accessibilityIdentifier("admin-sidebar-header-this-hub")) {
                ForEach(thisHubItems) { item in
                    NavigationLink(value: item) {
                        Label(
                            NSLocalizedString(item.labelKey, comment: ""),
                            systemImage: item.icon
                        )
                    }
                    .accessibilityIdentifier(item.testid)
                }
            }
            
            if platformItems.count > 0 {
                Section(header: Text(NSLocalizedString("adminNav_scopes_platform", comment: "Platform"))
                    .accessibilityIdentifier("admin-sidebar-header-platform")) {
                    ForEach(platformItems) { item in
                        NavigationLink(value: item) {
                            Label(
                                NSLocalizedString(item.labelKey, comment: ""),
                                systemImage: item.icon
                            )
                        }
                        .accessibilityIdentifier(item.testid)
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .accessibilityIdentifier("admin-sidebar-list")
        .navigationTitle(NSLocalizedString("admin_title", comment: "Admin"))
    }
    
    private var thisHubItems: [AdminNavItem] {
        AdminNavConfig.thisHubItems.filter { canSee($0) }
    }
    
    private var platformItems: [AdminNavItem] {
        AdminNavConfig.platformItems.filter { canSee($0) }
    }
    
    private func canSee(_ item: AdminNavItem) -> Bool {
        if let requiredRole = item.requiredRole,
           !appState.userRoles.contains(requiredRole) {
            return false
        }
        if item.requiredPermissions.isEmpty { return true }
        return item.requiredPermissions.allSatisfy { appState.hasPermission($0) }
    }
}

struct AdminNavItem: Identifiable, Hashable {
    let id = UUID()
    let slug: String
    let labelKey: String
    let icon: String
    let requiredPermissions: [String]
    let requiredRole: String?
    let testid: String
}

enum AdminNavConfig {
    static let thisHubItems: [AdminNavItem] = [
        AdminNavItem(slug: "location-lookup", labelKey: "adminNav_items_locationLookup", icon: "mappin.and.ellipse", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-location-lookup"),
        AdminNavItem(slug: "passkey-policy", labelKey: "adminNav_items_passkeyPolicy", icon: "key.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-passkey-policy"),
        AdminNavItem(slug: "recovery-group", labelKey: "adminNav_items_recoveryGroup", icon: "person.2.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-recovery-group"),
        AdminNavItem(slug: "devices", labelKey: "adminNav_items_devices", icon: "iphone", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-devices"),
        AdminNavItem(slug: "hub-roles", labelKey: "adminNav_items_hubRoles", icon: "person.crop.rectangle.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-hub-roles"),
        AdminNavItem(slug: "teams", labelKey: "adminNav_items_teams", icon: "person.3.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-teams"),
        AdminNavItem(slug: "tags", labelKey: "adminNav_items_tags", icon: "tag.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-tags"),
        AdminNavItem(slug: "custom-fields", labelKey: "adminNav_items_customFields", icon: "list.bullet.rectangle.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-custom-fields"),
        AdminNavItem(slug: "report-types", labelKey: "adminNav_items_reportTypes", icon: "doc.text.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-report-types"),
        AdminNavItem(slug: "firehose", labelKey: "adminNav_items_firehose", icon: "antenna.radiowaves.left.and.right", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-firehose"),
        AdminNavItem(slug: "call-settings", labelKey: "adminNav_items_callSettings", icon: "phone.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-call-settings"),
        AdminNavItem(slug: "voice-prompts", labelKey: "adminNav_items_voicePrompts", icon: "waveform", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-voice-prompts"),
        AdminNavItem(slug: "phone-menu-languages", labelKey: "adminNav_items_phoneMenuLanguages", icon: "globe", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-phone-menu-languages"),
        AdminNavItem(slug: "transcription", labelKey: "adminNav_items_transcription", icon: "text.word.spacing", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-transcription"),
        AdminNavItem(slug: "spam-protection", labelKey: "adminNav_items_spamProtection", icon: "shield.lefthalf.filled", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-spam-protection"),
        AdminNavItem(slug: "phone-provider", labelKey: "adminNav_items_phoneProvider", icon: "phone.connection.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-phone-provider"),
        AdminNavItem(slug: "messaging-sms", labelKey: "adminNav_items_messagingSms", icon: "message.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-messaging-sms"),
        AdminNavItem(slug: "rcs", labelKey: "adminNav_items_rcs", icon: "bubble.left.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-rcs"),
        AdminNavItem(slug: "signal", labelKey: "adminNav_items_signal", icon: "bubble.right.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-signal"),
        AdminNavItem(slug: "bans", labelKey: "adminNav_items_bans", icon: "hand.raised.fill", requiredPermissions: ["bans:read"], requiredRole: nil, testid: "admin-sidebar-item-bans"),
        AdminNavItem(slug: "audit", labelKey: "adminNav_items_audit", icon: "list.clipboard.fill", requiredPermissions: ["audit:read"], requiredRole: nil, testid: "admin-sidebar-item-audit"),
        AdminNavItem(slug: "analytics", labelKey: "adminNav_items_analytics", icon: "chart.bar.fill", requiredPermissions: ["calls:read-history", "audit:read"], requiredRole: nil, testid: "admin-sidebar-item-analytics"),
        AdminNavItem(slug: "health", labelKey: "adminNav_items_health", icon: "heart.text.square.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-health"),
    ]
    
    static let platformItems: [AdminNavItem] = [
        AdminNavItem(slug: "hubs", labelKey: "adminNav_items_hubs", icon: "building.2.fill", requiredPermissions: ["system:manage-hubs"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-hubs"),
        AdminNavItem(slug: "platform-roles", labelKey: "adminNav_items_platformRoles", icon: "person.crop.rectangle.fill", requiredPermissions: ["system:manage-roles"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-roles"),
        AdminNavItem(slug: "platform-bans", labelKey: "adminNav_items_platformBans", icon: "hand.raised.fill", requiredPermissions: ["bans:read"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-bans"),
        AdminNavItem(slug: "platform-audit", labelKey: "adminNav_items_platformAudit", icon: "list.clipboard.fill", requiredPermissions: ["audit:read"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-audit"),
        AdminNavItem(slug: "platform-analytics", labelKey: "adminNav_items_platformAnalytics", icon: "chart.bar.fill", requiredPermissions: ["calls:read-history", "audit:read"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-analytics"),
        AdminNavItem(slug: "platform-health", labelKey: "adminNav_items_platformHealth", icon: "heart.text.square.fill", requiredPermissions: ["settings:read"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-health"),
        AdminNavItem(slug: "platform-settings", labelKey: "adminNav_items_platformSettings", icon: "gearshape.fill", requiredPermissions: [], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-settings"),
        AdminNavItem(slug: "gdpr-erasure", labelKey: "adminNav_items_gdprErasure", icon: "trash.fill", requiredPermissions: ["settings:manage"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-gdpr-erasure"),
    ]
}

#Preview {
    NavigationStack {
        AdminSidebarView()
    }
}
