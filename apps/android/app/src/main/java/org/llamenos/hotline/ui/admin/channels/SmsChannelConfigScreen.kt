package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.i18n.I18n

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmsChannelConfigScreen(
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var enabled by remember { mutableStateOf(state.config?.sms?.enabled ?: false) }
    var contentMode by remember { mutableStateOf(state.config?.smsContentMode ?: "notification-only") }
    var autoResponse by remember { mutableStateOf(state.config?.sms?.autoResponse ?: "") }
    var afterHoursResponse by remember { mutableStateOf(state.config?.sms?.afterHoursResponse ?: "") }

    LaunchedEffect(state.config) {
        state.config?.let { config ->
            enabled = config.sms?.enabled ?: false
            contentMode = config.smsContentMode ?: "notification-only"
            autoResponse = config.sms?.autoResponse ?: ""
            afterHoursResponse = config.sms?.afterHoursResponse ?: ""
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text(I18n.channels_sms_title) }) },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Switch(
                        checked = enabled,
                        onCheckedChange = { enabled = it },
                        modifier = Modifier.testTag("sms-enabled-toggle"),
                    )
                    Text(I18n.channels_sms_providerNote, style = MaterialTheme.typography.bodySmall)
                }
            }

            Spacer(Modifier.height(16.dp))

            Text(I18n.channels_sms_contentMode, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth().testTag("sms-content-mode")) {
                SegmentedButton(
                    selected = contentMode == "full",
                    onClick = { contentMode = "full" },
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                ) { Text(I18n.channels_sms_contentModeFull) }
                SegmentedButton(
                    selected = contentMode == "notification-only",
                    onClick = { contentMode = "notification-only" },
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                ) { Text(I18n.channels_sms_contentModeNotification) }
            }

            Spacer(Modifier.height(16.dp))

            AutoResponseFields(
                autoResponse = autoResponse,
                afterHoursResponse = afterHoursResponse,
                onAutoResponseChange = { autoResponse = it },
                onAfterHoursResponseChange = { afterHoursResponse = it },
                idPrefix = "sms",
            )

            Spacer(Modifier.height(16.dp))

            ConnectionTestButton(
                channel = "sms",
                enabled = enabled,
                onTest = { viewModel.testChannel(it); state.testResults["sms"] ?: false },
            )

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = {
                    viewModel.updateConfig(mapOf(
                        "sms" to mapOf(
                            "enabled" to enabled,
                            "autoResponse" to autoResponse,
                            "afterHoursResponse" to afterHoursResponse,
                        ),
                        "smsContentMode" to contentMode,
                    ))
                },
                modifier = Modifier.fillMaxWidth().testTag("sms-save-btn"),
            ) { Text(I18n.common_save) }

            Spacer(Modifier.height(16.dp))

            A2pRegistrationSection(viewModel = viewModel)
        }
    }
}
