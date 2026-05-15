import SwiftUI

struct AdminSidebarView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedSection: AdminNavItem?
    
    var body: some View {
        List(selection: $selectedSection) {
            Section(header: Text(NSLocalizedString("admin_nav_scopes_this_hub", comment: "This Hub"))
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
                Section(header: Text(NSLocalizedString("admin_nav_scopes_platform", comment: "Platform"))
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
           appState.userRole.rawValue != requiredRole {
            return false
        }
        // All admin users can see items that only require permissions (no role gate)
        // Permission-based filtering will be refined when RBAC is implemented
        return true
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
        AdminNavItem(slug: "location-lookup", labelKey: "admin_nav_items_location_lookup", icon: "mappin.and.ellipse", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-location-lookup"),
        AdminNavItem(slug: "passkey-policy", labelKey: "admin_nav_items_passkey_policy", icon: "key.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-passkey-policy"),
        AdminNavItem(slug: "recovery-group", labelKey: "admin_nav_items_recovery_group", icon: "person.2.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-recovery-group"),
        AdminNavItem(slug: "devices", labelKey: "admin_nav_items_devices", icon: "iphone", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-devices"),
        AdminNavItem(slug: "hub-roles", labelKey: "admin_nav_items_hub_roles", icon: "person.crop.rectangle.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-hub-roles"),
        AdminNavItem(slug: "teams", labelKey: "admin_nav_items_teams", icon: "person.3.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-teams"),
        AdminNavItem(slug: "tags", labelKey: "admin_nav_items_tags", icon: "tag.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-tags"),
        AdminNavItem(slug: "custom-fields", labelKey: "admin_nav_items_custom_fields", icon: "list.bullet.rectangle.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-custom-fields"),
        AdminNavItem(slug: "report-types", labelKey: "admin_nav_items_report_types", icon: "doc.text.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-report-types"),
        AdminNavItem(slug: "firehose", labelKey: "admin_nav_items_firehose", icon: "antenna.radiowaves.left.and.right", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-firehose"),
        AdminNavItem(slug: "call-settings", labelKey: "admin_nav_items_call_settings", icon: "phone.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-call-settings"),
        AdminNavItem(slug: "voice-prompts", labelKey: "admin_nav_items_voice_prompts", icon: "waveform", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-voice-prompts"),
        AdminNavItem(slug: "phone-menu-languages", labelKey: "admin_nav_items_phone_menu_languages", icon: "globe", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-phone-menu-languages"),
        AdminNavItem(slug: "transcription", labelKey: "admin_nav_items_transcription", icon: "text.word.spacing", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-transcription"),
        AdminNavItem(slug: "spam-protection", labelKey: "admin_nav_items_spam_protection", icon: "shield.lefthalf.filled", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-spam-protection"),
        AdminNavItem(slug: "phone-provider", labelKey: "admin_nav_items_phone_provider", icon: "phone.connection.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-phone-provider"),
        AdminNavItem(slug: "messaging-sms", labelKey: "admin_nav_items_messaging_sms", icon: "message.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-messaging-sms"),
        AdminNavItem(slug: "rcs", labelKey: "admin_nav_items_rcs", icon: "bubble.left.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-rcs"),
        AdminNavItem(slug: "signal", labelKey: "admin_nav_items_signal", icon: "bubble.right.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-signal"),
        AdminNavItem(slug: "erasure-queue", labelKey: "admin_nav_items_erasure_queue", icon: "person.crop.circle.badge.minus", requiredPermissions: ["erasure:admin"], requiredRole: nil, testid: "admin-sidebar-item-erasure-queue"),
        AdminNavItem(slug: "retention", labelKey: "admin_nav_items_retention_settings", icon: "clock.arrow.circlepath", requiredPermissions: ["retention:manage"], requiredRole: nil, testid: "admin-sidebar-item-retention"),
        AdminNavItem(slug: "bans", labelKey: "admin_nav_items_bans", icon: "hand.raised.fill", requiredPermissions: ["bans:read"], requiredRole: nil, testid: "admin-sidebar-item-bans"),
        AdminNavItem(slug: "audit", labelKey: "admin_nav_items_audit", icon: "list.clipboard.fill", requiredPermissions: ["audit:read"], requiredRole: nil, testid: "admin-sidebar-item-audit"),
        AdminNavItem(slug: "analytics", labelKey: "admin_nav_items_analytics", icon: "chart.bar.fill", requiredPermissions: ["calls:read-history", "audit:read"], requiredRole: nil, testid: "admin-sidebar-item-analytics"),
        AdminNavItem(slug: "health", labelKey: "admin_nav_items_health", icon: "heart.text.square.fill", requiredPermissions: ["settings:read"], requiredRole: nil, testid: "admin-sidebar-item-health"),
    ]

    static let platformItems: [AdminNavItem] = [
        AdminNavItem(slug: "hubs", labelKey: "admin_nav_items_hubs", icon: "building.2.fill", requiredPermissions: ["system:manage-hubs"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-hubs"),
        AdminNavItem(slug: "platform-roles", labelKey: "admin_nav_items_platform_roles", icon: "person.crop.rectangle.fill", requiredPermissions: ["system:manage-roles"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-roles"),
        AdminNavItem(slug: "platform-bans", labelKey: "admin_nav_items_platform_bans", icon: "hand.raised.fill", requiredPermissions: ["bans:read"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-bans"),
        AdminNavItem(slug: "platform-audit", labelKey: "admin_nav_items_platform_audit", icon: "list.clipboard.fill", requiredPermissions: ["audit:read"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-audit"),
        AdminNavItem(slug: "platform-analytics", labelKey: "admin_nav_items_platform_analytics", icon: "chart.bar.fill", requiredPermissions: ["calls:read-history", "audit:read"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-analytics"),
        AdminNavItem(slug: "platform-health", labelKey: "admin_nav_items_platform_health", icon: "heart.text.square.fill", requiredPermissions: ["settings:read"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-health"),
        AdminNavItem(slug: "platform-settings", labelKey: "admin_nav_items_platform_settings", icon: "gearshape.fill", requiredPermissions: [], requiredRole: "role-super-admin", testid: "admin-sidebar-item-platform-settings"),
        AdminNavItem(slug: "gdpr-erasure", labelKey: "admin_nav_items_gdpr_erasure", icon: "trash.fill", requiredPermissions: ["settings:manage"], requiredRole: "role-super-admin", testid: "admin-sidebar-item-gdpr-erasure"),
    ]
}

#Preview {
    NavigationStack {
        AdminSidebarView()
    }
}
