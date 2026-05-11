package org.llamenos.hotline.ui.admin

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R

@Composable
fun AdminSidebarDrawer(
    onItemClick: (String) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxHeight()
            .padding(horizontal = 12.dp)
            .verticalScroll(rememberScrollState()),
    ) {
        Text(
            text = stringResource(R.string.adminNav_scopes_thisHub),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )

        AdminNavConfig.thisHubItems.forEach { item ->
            NavigationDrawerItem(
                label = { Text(stringResource(item.labelRes)) },
                selected = false,
                onClick = { onItemClick(item.slug) },
                modifier = Modifier.testTag(item.testTag),
            )
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

        Text(
            text = stringResource(R.string.adminNav_scopes_platform),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )

        AdminNavConfig.platformItems.forEach { item ->
            NavigationDrawerItem(
                label = { Text(stringResource(item.labelRes)) },
                selected = false,
                onClick = { onItemClick(item.slug) },
                modifier = Modifier.testTag(item.testTag),
            )
        }
    }
}

data class AdminNavItem(
    val slug: String,
    val labelRes: Int,
    val testTag: String,
    val requiredPermissions: List<String> = emptyList(),
    val requiredRole: String? = null,
)

object AdminNavConfig {
    val thisHubItems = listOf(
        AdminNavItem("location-lookup", R.string.adminNav_items_locationLookup, "admin-sidebar-item-location-lookup", listOf("settings:read")),
        AdminNavItem("passkey-policy", R.string.adminNav_items_passkeyPolicy, "admin-sidebar-item-passkey-policy", listOf("settings:read")),
        AdminNavItem("recovery-group", R.string.adminNav_items_recoveryGroup, "admin-sidebar-item-recovery-group", listOf("settings:read")),
        AdminNavItem("devices", R.string.adminNav_items_devices, "admin-sidebar-item-devices", listOf("settings:read")),
        AdminNavItem("hub-roles", R.string.adminNav_items_hubRoles, "admin-sidebar-item-hub-roles", listOf("settings:read")),
        AdminNavItem("teams", R.string.adminNav_items_teams, "admin-sidebar-item-teams", listOf("settings:read")),
        AdminNavItem("tags", R.string.adminNav_items_tags, "admin-sidebar-item-tags", listOf("settings:read")),
        AdminNavItem("custom-fields", R.string.adminNav_items_customFields, "admin-sidebar-item-custom-fields", listOf("settings:read")),
        AdminNavItem("report-types", R.string.adminNav_items_reportTypes, "admin-sidebar-item-report-types", listOf("settings:read")),
        AdminNavItem("firehose", R.string.adminNav_items_firehose, "admin-sidebar-item-firehose", listOf("settings:read")),
        AdminNavItem("call-settings", R.string.adminNav_items_callSettings, "admin-sidebar-item-call-settings", listOf("settings:read")),
        AdminNavItem("voice-prompts", R.string.adminNav_items_voicePrompts, "admin-sidebar-item-voice-prompts", listOf("settings:read")),
        AdminNavItem("phone-menu-languages", R.string.adminNav_items_phoneMenuLanguages, "admin-sidebar-item-phone-menu-languages", listOf("settings:read")),
        AdminNavItem("transcription", R.string.adminNav_items_transcription, "admin-sidebar-item-transcription", listOf("settings:read")),
        AdminNavItem("spam-protection", R.string.adminNav_items_spamProtection, "admin-sidebar-item-spam-protection", listOf("settings:read")),
        AdminNavItem("phone-provider", R.string.adminNav_items_phoneProvider, "admin-sidebar-item-phone-provider", listOf("settings:read")),
        AdminNavItem("messaging-sms", R.string.adminNav_items_messagingSms, "admin-sidebar-item-messaging-sms", listOf("settings:read")),
        AdminNavItem("rcs", R.string.adminNav_items_rcs, "admin-sidebar-item-rcs", listOf("settings:read")),
        AdminNavItem("signal", R.string.adminNav_items_signal, "admin-sidebar-item-signal", listOf("settings:read")),
        AdminNavItem("bans", R.string.adminNav_items_bans, "admin-sidebar-item-bans", listOf("bans:read")),
        AdminNavItem("audit", R.string.adminNav_items_audit, "admin-sidebar-item-audit", listOf("audit:read")),
        AdminNavItem("analytics", R.string.adminNav_items_analytics, "admin-sidebar-item-analytics", listOf("calls:read-history", "audit:read")),
        AdminNavItem("health", R.string.adminNav_items_health, "admin-sidebar-item-health", listOf("settings:read")),
    )

    val platformItems = listOf(
        AdminNavItem("hubs", R.string.adminNav_items_hubs, "admin-sidebar-item-hubs", listOf("system:manage-hubs"), "role-super-admin"),
        AdminNavItem("platform-roles", R.string.adminNav_items_platformRoles, "admin-sidebar-item-platform-roles", listOf("system:manage-roles"), "role-super-admin"),
        AdminNavItem("platform-bans", R.string.adminNav_items_platformBans, "admin-sidebar-item-platform-bans", listOf("bans:read"), "role-super-admin"),
        AdminNavItem("platform-audit", R.string.adminNav_items_platformAudit, "admin-sidebar-item-platform-audit", listOf("audit:read"), "role-super-admin"),
        AdminNavItem("platform-analytics", R.string.adminNav_items_platformAnalytics, "admin-sidebar-item-platform-analytics", listOf("calls:read-history", "audit:read"), "role-super-admin"),
        AdminNavItem("platform-health", R.string.adminNav_items_platformHealth, "admin-sidebar-item-platform-health", listOf("settings:read"), "role-super-admin"),
        AdminNavItem("platform-settings", R.string.adminNav_items_platformSettings, "admin-sidebar-item-platform-settings", emptyList(), "role-super-admin"),
        AdminNavItem("gdpr-erasure", R.string.adminNav_items_gdprErasure, "admin-sidebar-item-gdpr-erasure", listOf("settings:manage"), "role-super-admin"),
    )
}
