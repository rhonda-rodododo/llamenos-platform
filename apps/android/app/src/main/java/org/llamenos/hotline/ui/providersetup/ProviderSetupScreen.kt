package org.llamenos.hotline.ui.providersetup

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.R
import org.llamenos.protocol.ProviderStatus

private val PROVIDERS = listOf(
    "twilio" to listOf("voice", "sms", "messaging"),
    "signalwire" to listOf("voice", "sms", "messaging"),
    "vonage" to listOf("voice", "sms"),
    "plivo" to listOf("voice", "sms"),
    "telnyx" to listOf("voice", "sms"),
    "bandwidth" to listOf("voice", "sms"),
    "asterisk" to listOf("voice"),
    "freeswitch" to listOf("voice"),
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ProviderSetupScreen(
    onNavigateBack: () -> Unit,
    onNavigateToOAuth: (String) -> Unit,
    onNavigateToApiKey: (String) -> Unit,
    onNavigateToPhoneNumbers: (String) -> Unit,
    onNavigateToSignalRegistration: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ProviderSetupViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val selectedProvider by viewModel.selectedProvider.collectAsState()
    val isTesting by viewModel.isTesting.collectAsState()
    val testResult by viewModel.testResult.collectAsState()
    val isConfiguring by viewModel.isConfiguring.collectAsState()
    val configError by viewModel.configError.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.provider_setup_title),
                        modifier = Modifier.testTag("provider-setup-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.testTag("provider-setup-back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.nav_dashboard),
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { viewModel.refresh() },
                        modifier = Modifier.testTag("provider-setup-refresh"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = stringResource(R.string.action_refresh),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                ),
            )
        },
        modifier = modifier,
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text(
                    text = stringResource(R.string.provider_setup_description),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            }

            // Provider selection grid
            items(PROVIDERS, key = { it.first }) { (provider, capabilities) ->
                ProviderCard(
                    provider = provider,
                    capabilities = capabilities,
                    isSelected = selectedProvider == provider,
                    onClick = { viewModel.selectProvider(provider) },
                )
            }

            // Selected provider details
            selectedProvider?.let { provider ->
                item {
                    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                    when (val state = uiState) {
                        is ProviderSetupUiState.Loading -> {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(32.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator()
                            }
                        }

                        is ProviderSetupUiState.Connected -> {
                            ConnectedProviderPanel(
                                provider = provider,
                                status = state.status,
                                onTest = { viewModel.testConnection() },
                                isTesting = isTesting,
                                testResult = testResult,
                                onNavigateToPhoneNumbers = { onNavigateToPhoneNumbers(provider) },
                            )
                        }

                        is ProviderSetupUiState.Disconnected -> {
                            DisconnectedProviderPanel(
                                provider = provider,
                                status = state.status,
                                onConnectOAuth = { onNavigateToOAuth(provider) },
                                onConnectApiKey = { onNavigateToApiKey(provider) },
                                onTest = { viewModel.testConnection() },
                                isTesting = isTesting,
                                testResult = testResult,
                                isConfiguring = isConfiguring,
                                configError = configError,
                                onConfigure = { credentials ->
                                    viewModel.configureWithCredentials(provider, credentials)
                                },
                            )
                        }

                        is ProviderSetupUiState.Error -> {
                            ErrorPanel(
                                message = state.message,
                                onRetry = { viewModel.loadStatus(provider) },
                            )
                        }
                    }
                }
            }

            // Signal registration button
            item {
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                Button(
                    onClick = onNavigateToSignalRegistration,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("signal-registration-button"),
                ) {
                    Text(stringResource(R.string.signal_registration_title))
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ProviderCard(
    provider: String,
    capabilities: List<String>,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag("provider-card-$provider"),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceContainerLow
            },
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = if (isSelected) {
                    Icons.Filled.CheckCircle
                } else {
                    Icons.Filled.RadioButtonUnchecked
                },
                contentDescription = null,
                tint = if (isSelected) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.size(24.dp),
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = provider.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.titleMedium,
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.padding(top = 4.dp),
                ) {
                    capabilities.forEach { cap ->
                        FilterChip(
                            selected = false,
                            onClick = {},
                            label = { Text(cap) },
                            modifier = Modifier.testTag("provider-capability-$cap"),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ConnectedProviderPanel(
    provider: String,
    status: org.llamenos.protocol.ProviderStatusResponse,
    onTest: () -> Unit,
    isTesting: Boolean,
    testResult: org.llamenos.hotline.api.TestConnectionResult?,
    onNavigateToPhoneNumbers: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(bottom = 8.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.provider_connected),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        status.phoneNumbers?.let { numbers ->
            if (numbers.isNotEmpty()) {
                Text(
                    text = stringResource(R.string.phone_numbers_label, numbers.size),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(vertical = 4.dp),
                )
                numbers.forEach { number ->
                    Text(
                        text = number,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        Button(
            onClick = onNavigateToPhoneNumbers,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
        ) {
            Text(stringResource(R.string.manage_phone_numbers))
        }

        OutlinedButton(
            onClick = onTest,
            enabled = !isTesting,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
        ) {
            if (isTesting) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp))
            } else {
                Text(stringResource(R.string.test_connection))
            }
        }

        testResult?.let { result ->
            TestResultItem(result = result)
        }
    }
}

@Composable
private fun DisconnectedProviderPanel(
    provider: String,
    status: org.llamenos.protocol.ProviderStatusResponse?,
    onConnectOAuth: () -> Unit,
    onConnectApiKey: () -> Unit,
    onTest: () -> Unit,
    isTesting: Boolean,
    testResult: org.llamenos.hotline.api.TestConnectionResult?,
    isConfiguring: Boolean,
    configError: String?,
    onConfigure: (Map<String, String>) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(bottom = 8.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Error,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.provider_disconnected),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        status?.error?.let { error ->
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }

        // OAuth button for supported providers
        if (provider in listOf("twilio", "signalwire", "telnyx", "vonage", "bandwidth")) {
            Button(
                onClick = onConnectOAuth,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
            ) {
                Text(stringResource(R.string.connect_with_oauth, provider))
            }
        }

        // API Key button
        OutlinedButton(
            onClick = onConnectApiKey,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
        ) {
            Text(stringResource(R.string.enter_api_credentials))
        }

        // Test button
        OutlinedButton(
            onClick = onTest,
            enabled = !isTesting,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
        ) {
            if (isTesting) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp))
            } else {
                Text(stringResource(R.string.test_connection))
            }
        }

        testResult?.let { result ->
            TestResultItem(result = result)
        }

        configError?.let { error ->
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

@Composable
private fun TestResultItem(
    result: org.llamenos.hotline.api.TestConnectionResult,
) {
    Column(modifier = Modifier.padding(vertical = 8.dp)) {
        if (result.connected) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = stringResource(R.string.connection_success, result.latencyMs),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            result.accountName?.let { name ->
                Text(
                    text = stringResource(R.string.account_name_label, name),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.Error,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = stringResource(R.string.connection_failed),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            result.error?.let { error ->
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun ErrorPanel(
    message: String,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = Icons.Filled.Error,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(48.dp),
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Button(onClick = onRetry) {
            Text(stringResource(R.string.retry))
        }
    }
}
