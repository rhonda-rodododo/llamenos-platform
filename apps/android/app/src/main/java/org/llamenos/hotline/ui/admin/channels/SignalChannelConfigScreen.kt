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
import androidx.compose.ui.res.stringResource
import org.llamenos.hotline.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignalChannelConfigScreen(
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var bridgeUrl by remember { mutableStateOf(state.config?.signal?.bridgeUrl ?: "") }
    var bridgeApiKey by remember { mutableStateOf(state.config?.signal?.bridgeApiKey ?: "") }
    var webhookSecret by remember { mutableStateOf(state.config?.signal?.webhookSecret ?: "") }
    var registeredNumber by remember { mutableStateOf(state.config?.signal?.registeredNumber ?: "") }
    var autoResponse by remember { mutableStateOf(state.config?.signal?.autoResponse ?: "") }
    var afterHoursResponse by remember { mutableStateOf(state.config?.signal?.afterHoursResponse ?: "") }

    LaunchedEffect(state.config) {
        state.config?.signal?.let { sig ->
            bridgeUrl = sig.bridgeUrl; bridgeApiKey = sig.bridgeApiKey; webhookSecret = sig.webhookSecret
            registeredNumber = sig.registeredNumber; autoResponse = sig.autoResponse ?: ""; afterHoursResponse = sig.afterHoursResponse ?: ""
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(stringResource(R.string.channels_signal_title)) }) }) { padding ->
        Column(modifier = Modifier.padding(padding).padding(16.dp).verticalScroll(rememberScrollState())) {
            Text(stringResource(R.string.channels_signal_e2ee_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(value = bridgeUrl, onValueChange = { bridgeUrl = it }, label = { Text(stringResource(R.string.channels_signal_bridge_url)) }, modifier = Modifier.fillMaxWidth().testTag("signal-bridge-url"))
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = bridgeApiKey, onValueChange = { bridgeApiKey = it }, label = { Text(stringResource(R.string.channels_signal_bridge_api_key)) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = webhookSecret, onValueChange = { webhookSecret = it }, label = { Text(stringResource(R.string.channels_signal_webhook_secret)) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = registeredNumber, onValueChange = { registeredNumber = it }, label = { Text(stringResource(R.string.channels_signal_registered_number)) }, modifier = Modifier.fillMaxWidth().testTag("signal-registered-number"))
            Spacer(Modifier.height(16.dp))
            AutoResponseFields(autoResponse = autoResponse, afterHoursResponse = afterHoursResponse, onAutoResponseChange = { autoResponse = it }, onAfterHoursResponseChange = { afterHoursResponse = it }, idPrefix = "signal")
            Spacer(Modifier.height(16.dp))
            ConnectionTestButton(channel = "signal", enabled = bridgeUrl.isNotEmpty(), onTest = { viewModel.testChannel(it); state.testResults["signal"] ?: false })
            Spacer(Modifier.height(16.dp))
            Button(onClick = {
                viewModel.updateConfig(mapOf("signal" to mapOf("bridgeUrl" to bridgeUrl, "bridgeApiKey" to bridgeApiKey, "webhookSecret" to webhookSecret, "registeredNumber" to registeredNumber, "autoResponse" to autoResponse, "afterHoursResponse" to afterHoursResponse)))
            }, enabled = bridgeUrl.isNotEmpty(), modifier = Modifier.fillMaxWidth().testTag("signal-save-btn")) { Text(stringResource(R.string.common_save)) }
        }
    }
}
