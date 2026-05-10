package org.llamenos.hotline.ui.providersetup

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun APIKeyProviderScreen(
    provider: String,
    onNavigateBack: () -> Unit,
    onConfigured: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ProviderSetupViewModel = hiltViewModel(),
) {
    val isConfiguring by viewModel.isConfiguring.collectAsState()
    val configError by viewModel.configError.collectAsState()
    val configSuccess by viewModel.configSuccess.collectAsState()

    LaunchedEffect(configSuccess) {
        if (configSuccess) {
            viewModel.clearConfigSuccess()
            onConfigured()
        }
    }

    var accountSid by remember { mutableStateOf("") }
    var authToken by remember { mutableStateOf("") }
    var apiKey by remember { mutableStateOf("") }
    var apiSecret by remember { mutableStateOf("") }

    val isTwilioLike = provider in listOf("twilio", "signalwire")
    val isVonageLike = provider in listOf("vonage", "telnyx", "plivo", "bandwidth")

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.api_key_title, provider),
                        modifier = Modifier.testTag("api-key-title"),
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.nav_dashboard),
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.api_key_description, provider),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(modifier = Modifier.height(24.dp))

            if (isTwilioLike) {
                OutlinedTextField(
                    value = accountSid,
                    onValueChange = { accountSid = it },
                    label = { Text(stringResource(R.string.account_sid_label)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("account-sid-field"),
                    keyboardOptions = KeyboardOptions(
                        imeAction = ImeAction.Next,
                    ),
                    singleLine = true,
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = authToken,
                    onValueChange = { authToken = it },
                    label = { Text(stringResource(R.string.auth_token_label)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("auth-token-field"),
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    singleLine = true,
                )
            } else if (isVonageLike) {
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = { apiKey = it },
                    label = { Text(stringResource(R.string.api_key_label)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("api-key-field"),
                    keyboardOptions = KeyboardOptions(
                        imeAction = ImeAction.Next,
                    ),
                    singleLine = true,
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = apiSecret,
                    onValueChange = { apiSecret = it },
                    label = { Text(stringResource(R.string.api_secret_label)) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("api-secret-field"),
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    singleLine = true,
                )
            }

            configError?.let { error ->
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    val credentials = when {
                        isTwilioLike -> mapOf(
                            "accountSid" to accountSid,
                            "authToken" to authToken,
                        )
                        isVonageLike -> mapOf(
                            "apiKey" to apiKey,
                            "apiSecret" to apiSecret,
                        )
                        else -> emptyMap()
                    }
                    viewModel.configureWithCredentials(provider, credentials)
                },
                enabled = !isConfiguring && (
                    if (isTwilioLike) accountSid.isNotBlank() && authToken.isNotBlank()
                    else if (isVonageLike) apiKey.isNotBlank() && apiSecret.isNotBlank()
                    else false
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("api-key-save-button"),
            ) {
                if (isConfiguring) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp))
                } else {
                    Text(stringResource(R.string.save_credentials))
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            OutlinedButton(
                onClick = onNavigateBack,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.cancel))
            }
        }
    }
}
