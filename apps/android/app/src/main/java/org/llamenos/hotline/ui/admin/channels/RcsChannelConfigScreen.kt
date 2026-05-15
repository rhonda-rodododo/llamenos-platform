package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.i18n.I18n

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RcsChannelConfigScreen(
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var agentId by remember { mutableStateOf(state.config?.rcs?.agentId ?: "") }
    var serviceAccountKey by remember { mutableStateOf(state.config?.rcs?.serviceAccountKey ?: "") }
    var webhookSecret by remember { mutableStateOf(state.config?.rcs?.webhookSecret ?: "") }
    var fallbackToSms by remember { mutableStateOf(state.config?.rcs?.fallbackToSms ?: true) }
    var autoResponse by remember { mutableStateOf(state.config?.rcs?.autoResponse ?: "") }
    var afterHoursResponse by remember { mutableStateOf(state.config?.rcs?.afterHoursResponse ?: "") }

    LaunchedEffect(state.config) {
        state.config?.rcs?.let { rcs ->
            agentId = rcs.agentId; serviceAccountKey = rcs.serviceAccountKey; webhookSecret = rcs.webhookSecret ?: ""
            fallbackToSms = rcs.fallbackToSms; autoResponse = rcs.autoResponse ?: ""; afterHoursResponse = rcs.afterHoursResponse ?: ""
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(I18n.channels_rcs_title) }) }) { padding ->
        Column(modifier = Modifier.padding(padding).padding(16.dp).verticalScroll(rememberScrollState())) {
            OutlinedTextField(value = agentId, onValueChange = { agentId = it }, label = { Text(I18n.channels_rcs_agentId) }, modifier = Modifier.fillMaxWidth().testTag("rcs-agent-id"))
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = serviceAccountKey, onValueChange = { serviceAccountKey = it }, label = { Text(I18n.channels_rcs_serviceAccountKey) }, modifier = Modifier.fillMaxWidth().testTag("rcs-service-key"), minLines = 4)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = webhookSecret, onValueChange = { webhookSecret = it }, label = { Text(I18n.channels_rcs_webhookSecret) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(I18n.channels_rcs_fallbackToSms, style = MaterialTheme.typography.bodyMedium)
                    Text(I18n.channels_rcs_fallbackToSmsDesc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = fallbackToSms, onCheckedChange = { fallbackToSms = it })
            }
            Spacer(Modifier.height(16.dp))
            AutoResponseFields(autoResponse = autoResponse, afterHoursResponse = afterHoursResponse, onAutoResponseChange = { autoResponse = it }, onAfterHoursResponseChange = { afterHoursResponse = it }, idPrefix = "rcs")
            Spacer(Modifier.height(16.dp))
            ConnectionTestButton(channel = "rcs", enabled = agentId.isNotEmpty(), onTest = { viewModel.testChannel(it); state.testResults["rcs"] ?: false })
            Spacer(Modifier.height(16.dp))
            Button(onClick = {
                viewModel.updateConfig(mapOf("rcs" to mapOf("agentId" to agentId, "serviceAccountKey" to serviceAccountKey, "webhookSecret" to webhookSecret, "fallbackToSms" to fallbackToSms, "autoResponse" to autoResponse, "afterHoursResponse" to afterHoursResponse)))
            }, enabled = agentId.isNotEmpty(), modifier = Modifier.fillMaxWidth().testTag("rcs-save-btn")) { Text(I18n.common_save) }
        }
    }
}
