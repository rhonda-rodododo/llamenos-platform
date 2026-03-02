package org.llamenos.hotline.ui.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.outlined.PersonOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import org.llamenos.hotline.R
import org.llamenos.hotline.ui.components.LoadingOverlay
import org.llamenos.hotline.ui.components.PINPad

/**
 * PIN unlock screen for returning users with stored keys.
 *
 * Accepts the user's PIN and attempts to decrypt the stored nsec.
 * Shows biometric option if configured.
 * Shows error on incorrect PIN and clears the entry.
 */
@Composable
fun PINUnlockScreen(
    viewModel: AuthViewModel,
    onAuthenticated: () -> Unit,
    onResetIdentity: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()
    var localPin by remember { mutableStateOf("") }

    // Staggered entrance animation
    var showLogo by remember { mutableStateOf(false) }
    var showPad by remember { mutableStateOf(false) }
    var showActions by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        showLogo = true
        delay(150)
        showPad = true
        delay(100)
        showActions = true
    }

    // Navigate to dashboard when authenticated
    LaunchedEffect(uiState.isAuthenticated) {
        if (uiState.isAuthenticated) {
            onAuthenticated()
        }
    }

    // Reset local pin on error
    LaunchedEffect(uiState.error) {
        if (uiState.error != null) {
            localPin = ""
        }
    }

    Scaffold(modifier = modifier) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Spacer(Modifier.height(32.dp))

                // Logo
                AnimatedVisibility(
                    visible = showLogo,
                    enter = fadeIn() + slideInVertically { -it / 3 },
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Image(
                            painter = painterResource(R.drawable.logo_mark),
                            contentDescription = stringResource(R.string.app_name),
                            modifier = Modifier.size(72.dp),
                        )

                        Spacer(Modifier.height(16.dp))

                        Text(
                            text = stringResource(R.string.unlock_title),
                            style = MaterialTheme.typography.headlineMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.testTag("unlock-title"),
                        )

                        Spacer(Modifier.height(8.dp))

                        Text(
                            text = stringResource(R.string.unlock_subtitle),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }

                Spacer(Modifier.height(36.dp))

                // PIN pad
                AnimatedVisibility(
                    visible = showPad,
                    enter = fadeIn() + slideInVertically { it / 4 },
                ) {
                    PINPad(
                        pin = localPin,
                        maxLength = 4,
                        onPinChange = { newPin ->
                            localPin = newPin
                            viewModel.updatePin(newPin)
                        },
                        onComplete = { completedPin ->
                            viewModel.unlockWithPin(completedPin)
                        },
                        errorMessage = uiState.error,
                    )
                }

                Spacer(Modifier.height(24.dp))

                // Action buttons
                AnimatedVisibility(
                    visible = showActions,
                    enter = fadeIn(),
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        // Use biometric button (when available)
                        OutlinedButton(
                            onClick = {
                                // Biometric authentication will be implemented when
                                // the biometric prompt integration is added.
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                                .testTag("biometric-unlock"),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Fingerprint,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(Modifier.size(8.dp))
                            Text(stringResource(R.string.use_biometric))
                        }

                        Spacer(Modifier.height(12.dp))

                        // Reset identity link
                        TextButton(
                            onClick = {
                                viewModel.resetAuthState()
                                onResetIdentity()
                            },
                            modifier = Modifier.testTag("reset-identity"),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.PersonOff,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(Modifier.size(8.dp))
                            Text(
                                text = stringResource(R.string.reset_identity),
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(32.dp))
            }

            LoadingOverlay(
                isLoading = uiState.isLoading,
                message = stringResource(R.string.decrypting_keys),
            )
        }
    }
}
