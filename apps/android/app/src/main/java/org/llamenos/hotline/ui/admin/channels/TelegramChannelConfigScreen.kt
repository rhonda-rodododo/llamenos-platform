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
fun TelegramChannelConfigScreen(
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var enabled by remember { mutableStateOf(state.config?.telegram?.enabled ?: false) }
    var botToken by remember { mutableStateOf(state.config?.telegram?.botToken ?: "") }
    var botUsername by remember { mutableStateOf(state.config?.telegram?.botUsername ?: "") }
    var webhookSecret by remember { mutableStateOf(state.config?.telegram?.webhookSecret ?: "") }
    var autoResponse by remember { mutableStateOf(state.config?.telegram?.autoResponse ?: "") }
    var afterHoursResponse by remember { mutableStateOf(state.config?.telegram?.afterHoursResponse ?: "") }

    LaunchedEffect(state.config) {
        state.config?.telegram?.let { tg ->
            enabled = tg.enabled; botToken = tg.botToken; botUsername = tg.botUsername ?: ""
            webhookSecret = tg.webhookSecret ?: ""; autoResponse = tg.autoResponse ?: ""; afterHoursResponse = tg.afterHoursResponse ?: ""
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(stringResource(R.string.channels_telegram_title)) }) }) { padding ->
        Column(modifier = Modifier.padding(padding).padding(16.dp).verticalScroll(rememberScrollState())) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(stringResource(R.string.channels_shared_enable_channel), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                Switch(checked = enabled, onCheckedChange = { enabled = it }, modifier = Modifier.testTag("telegram-enabled-toggle"))
            }
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(value = botToken, onValueChange = { botToken = it }, label = { Text(stringResource(R.string.channels_telegram_bot_token)) }, modifier = Modifier.fillMaxWidth().testTag("telegram-bot-token"))
            Text(stringResource(R.string.channels_telegram_bot_token_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = botUsername, onValueChange = { botUsername = it }, label = { Text(stringResource(R.string.channels_telegram_bot_username)) }, modifier = Modifier.fillMaxWidth().testTag("telegram-bot-username"))
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = webhookSecret, onValueChange = { webhookSecret = it }, label = { Text(stringResource(R.string.channels_telegram_webhook_secret)) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(16.dp))
            AutoResponseFields(autoResponse = autoResponse, afterHoursResponse = afterHoursResponse, onAutoResponseChange = { autoResponse = it }, onAfterHoursResponseChange = { afterHoursResponse = it }, idPrefix = "telegram")
            Spacer(Modifier.height(16.dp))
            ConnectionTestButton(channel = "telegram", enabled = enabled && botToken.isNotEmpty(), onTest = { viewModel.testChannel(it); state.testResults["telegram"] ?: false })
            Spacer(Modifier.height(16.dp))
            Button(onClick = {
                viewModel.updateConfig(mapOf("telegram" to mapOf("enabled" to enabled, "botToken" to botToken, "botUsername" to botUsername, "webhookSecret" to webhookSecret, "autoResponse" to autoResponse, "afterHoursResponse" to afterHoursResponse)))
            }, enabled = botToken.isNotEmpty(), modifier = Modifier.fillMaxWidth().testTag("telegram-save-btn")) { Text(stringResource(R.string.common_save)) }
        }
    }
}
