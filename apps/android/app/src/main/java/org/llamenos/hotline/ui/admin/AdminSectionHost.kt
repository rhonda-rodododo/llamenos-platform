package org.llamenos.hotline.ui.admin

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.R

@Composable
fun AdminSectionHost(
    viewModel: AdminViewModel = hiltViewModel(),
) {
    val uiState = viewModel.uiState.collectAsState().value
    val section = uiState.selectedAdminSection

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        when (section) {
            "location-lookup" -> Text(stringResource(R.string.adminNav_items_locationLookup))
            "passkey-policy" -> Text(stringResource(R.string.adminNav_items_passkeyPolicy))
            "recovery-group" -> Text(stringResource(R.string.adminNav_items_recoveryGroup))
            "devices" -> Text(stringResource(R.string.adminNav_items_devices))
            "hub-roles" -> Text(stringResource(R.string.adminNav_items_hubRoles))
            "teams" -> Text(stringResource(R.string.adminNav_items_teams))
            "tags" -> Text(stringResource(R.string.adminNav_items_tags))
            "custom-fields" -> CustomFieldsTab(viewModel = viewModel)
            "report-types" -> Text(stringResource(R.string.adminNav_items_reportTypes))
            "firehose" -> Text(stringResource(R.string.adminNav_items_firehose))
            "call-settings" -> Text(stringResource(R.string.adminNav_items_callSettings))
            "voice-prompts" -> Text(stringResource(R.string.adminNav_items_voicePrompts))
            "phone-menu-languages" -> Text(stringResource(R.string.adminNav_items_phoneMenuLanguages))
            "transcription" -> Text(stringResource(R.string.adminNav_items_transcription))
            "spam-protection" -> Text(stringResource(R.string.adminNav_items_spamProtection))
            "phone-provider" -> Text(stringResource(R.string.adminNav_items_phoneProvider))
            "messaging-sms" -> Text(stringResource(R.string.adminNav_items_messagingSms))
            "rcs" -> Text(stringResource(R.string.adminNav_items_rcs))
            "signal" -> Text(stringResource(R.string.adminNav_items_signal))
            "bans" -> BanListTab(viewModel = viewModel)
            "audit" -> AuditLogTab(viewModel = viewModel)
            "analytics" -> Text(stringResource(R.string.adminNav_items_analytics))
            "health" -> SystemHealthTab(viewModel = viewModel)
            "hubs" -> Text(stringResource(R.string.adminNav_items_hubs))
            "platform-roles" -> Text(stringResource(R.string.adminNav_items_platformRoles))
            "platform-bans" -> BanListTab(viewModel = viewModel)
            "platform-audit" -> AuditLogTab(viewModel = viewModel)
            "platform-analytics" -> Text(stringResource(R.string.adminNav_items_platformAnalytics))
            "platform-health" -> SystemHealthTab(viewModel = viewModel)
            "platform-settings" -> Text(stringResource(R.string.adminNav_items_platformSettings))
            "gdpr-erasure" -> Text(stringResource(R.string.adminNav_items_gdprErasure))
            else -> Text(stringResource(R.string.common_loading))
        }
    }
}
