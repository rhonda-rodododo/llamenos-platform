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
fun WhatsAppChannelConfigScreen(
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var integrationMode by remember { mutableStateOf(state.config?.whatsapp?.integrationMode ?: "twilio") }
    var phoneNumberId by remember { mutableStateOf(state.config?.whatsapp?.phoneNumberId ?: "") }
    var businessAccountId by remember { mutableStateOf(state.config?.whatsapp?.businessAccountId ?: "") }
    var accessToken by remember { mutableStateOf(state.config?.whatsapp?.accessToken ?: "") }
    var verifyToken by remember { mutableStateOf(state.config?.whatsapp?.verifyToken ?: "") }
    var appSecret by remember { mutableStateOf(state.config?.whatsapp?.appSecret ?: "") }
    var autoResponse by remember { mutableStateOf(state.config?.whatsapp?.autoResponse ?: "") }
    var afterHoursResponse by remember { mutableStateOf(state.config?.whatsapp?.afterHoursResponse ?: "") }

    LaunchedEffect(state.config) {
        state.config?.whatsapp?.let { wa ->
            integrationMode = wa.integrationMode
            phoneNumberId = wa.phoneNumberId ?: ""
            businessAccountId = wa.businessAccountId ?: ""
            accessToken = wa.accessToken ?: ""
            verifyToken = wa.verifyToken ?: ""
            appSecret = wa.appSecret ?: ""
            autoResponse = wa.autoResponse ?: ""
            afterHoursResponse = wa.afterHoursResponse ?: ""
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(I18n.channels_whatsapp_title) }) }) { padding ->
        Column(
            modifier = Modifier.padding(padding).padding(16.dp).verticalScroll(rememberScrollState()),
        ) {
            Text(I18n.channels_whatsapp_integrationMode, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth().testTag("whatsapp-integration-mode")) {
                SegmentedButton(selected = integrationMode == "twilio", onClick = { integrationMode = "twilio" }, shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text(I18n.channels_whatsapp_modeTwilio) }
                SegmentedButton(selected = integrationMode == "direct", onClick = { integrationMode = "direct" }, shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text(I18n.channels_whatsapp_modeDirect) }
            }

            if (integrationMode == "direct") {
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(value = phoneNumberId, onValueChange = { phoneNumberId = it }, label = { Text(I18n.channels_whatsapp_phoneNumberId) }, modifier = Modifier.fillMaxWidth().testTag("whatsapp-phone-number-id"))
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = businessAccountId, onValueChange = { businessAccountId = it }, label = { Text(I18n.channels_whatsapp_businessAccountId) }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = accessToken, onValueChange = { accessToken = it }, label = { Text(I18n.channels_whatsapp_accessToken) }, modifier = Modifier.fillMaxWidth().testTag("whatsapp-access-token"))
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = verifyToken, onValueChange = { verifyToken = it }, label = { Text(I18n.channels_whatsapp_verifyToken) }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = appSecret, onValueChange = { appSecret = it }, label = { Text(I18n.channels_whatsapp_appSecret) }, modifier = Modifier.fillMaxWidth())
            } else {
                Spacer(Modifier.height(8.dp))
                Text(I18n.channels_whatsapp_twilioNote, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            Spacer(Modifier.height(16.dp))
            AutoResponseFields(autoResponse = autoResponse, afterHoursResponse = afterHoursResponse, onAutoResponseChange = { autoResponse = it }, onAfterHoursResponseChange = { afterHoursResponse = it }, idPrefix = "whatsapp")
            Spacer(Modifier.height(16.dp))
            ConnectionTestButton(channel = "whatsapp", enabled = true, onTest = { viewModel.testChannel(it); state.testResults["whatsapp"] ?: false })
            Spacer(Modifier.height(16.dp))
            Button(onClick = {
                val updates = mutableMapOf<String, Any?>("integrationMode" to integrationMode, "autoResponse" to autoResponse, "afterHoursResponse" to afterHoursResponse)
                if (integrationMode == "direct") { updates["phoneNumberId"] = phoneNumberId; updates["businessAccountId"] = businessAccountId; updates["accessToken"] = accessToken; updates["verifyToken"] = verifyToken; updates["appSecret"] = appSecret }
                viewModel.updateConfig(mapOf("whatsapp" to updates))
            }, modifier = Modifier.fillMaxWidth().testTag("whatsapp-save-btn")) { Text(I18n.common_save) }
        }
    }
}
