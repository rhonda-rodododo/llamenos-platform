package org.llamenos.hotline.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import org.llamenos.hotline.ui.components.DemoBanner
import org.llamenos.hotline.ui.components.LoadingOverlay

/**
 * Login screen with hub URL input, nsec import, and new identity creation.
 *
 * Two entry paths:
 * 1. "Create New Identity" -> generates a keypair -> OnboardingScreen
 * 2. "Import Key" -> validates nsec -> PINSetScreen
 */
@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onNavigateToOnboarding: () -> Unit,
    onNavigateToPinSet: () -> Unit,
    onDemoLogin: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current

    Scaffold(modifier = modifier) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(horizontal = 24.dp)
                    .verticalScroll(rememberScrollState())
                    .imePadding(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Spacer(Modifier.height(48.dp))

                Text(
                    text = stringResource(R.string.app_name),
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.testTag("app-title"),
                )

                Spacer(Modifier.height(8.dp))

                Text(
                    text = stringResource(R.string.login_subtitle),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )

                Spacer(Modifier.height(48.dp))

                // Hub URL field
                OutlinedTextField(
                    value = uiState.hubUrl,
                    onValueChange = viewModel::updateHubUrl,
                    label = { Text(stringResource(R.string.hub_url_label)) },
                    placeholder = { Text(stringResource(R.string.hub_url_placeholder)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Next,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("hub-url-input"),
                )

                Spacer(Modifier.height(16.dp))

                // nsec import field
                OutlinedTextField(
                    value = uiState.nsecInput,
                    onValueChange = viewModel::updateNsecInput,
                    label = { Text(stringResource(R.string.nsec_label)) },
                    placeholder = { Text(stringResource(R.string.nsec_placeholder)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            focusManager.clearFocus()
                            if (uiState.nsecInput.isNotBlank()) {
                                viewModel.importKey()
                                if (viewModel.uiState.value.error == null) {
                                    onNavigateToPinSet()
                                }
                            }
                        }
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("nsec-input"),
                )

                // Error message
                if (uiState.error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = uiState.error!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.testTag("login-error"),
                    )
                }

                Spacer(Modifier.height(32.dp))

                // Import Key button
                Button(
                    onClick = {
                        focusManager.clearFocus()
                        viewModel.importKey()
                        // Navigate after successful import (check error state)
                        if (viewModel.uiState.value.error == null) {
                            onNavigateToPinSet()
                        }
                    },
                    enabled = uiState.nsecInput.isNotBlank() && !uiState.isLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("import-key"),
                ) {
                    Text(stringResource(R.string.import_key))
                }

                Spacer(Modifier.height(12.dp))

                // Create New Identity button
                OutlinedButton(
                    onClick = {
                        focusManager.clearFocus()
                        viewModel.createNewIdentity()
                        if (viewModel.uiState.value.error == null) {
                            onNavigateToOnboarding()
                        }
                    },
                    enabled = !uiState.isLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("create-identity"),
                ) {
                    Text(stringResource(R.string.create_new_identity))
                }

                Spacer(Modifier.height(24.dp))

                // Demo mode section
                Text(
                    text = stringResource(R.string.demo_try_demo),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("demo-mode-label"),
                )

                Spacer(Modifier.height(8.dp))

                OutlinedButton(
                    onClick = { onDemoLogin("admin") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(40.dp)
                        .testTag("demo-admin-button"),
                ) {
                    Text(stringResource(R.string.demo_admin))
                }

                Spacer(Modifier.height(8.dp))

                OutlinedButton(
                    onClick = { onDemoLogin("volunteer") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(40.dp)
                        .testTag("demo-volunteer-button"),
                ) {
                    Text(stringResource(R.string.demo_volunteer))
                }

                Spacer(Modifier.height(48.dp))
            }

            LoadingOverlay(isLoading = uiState.isLoading)
        }
    }
}
