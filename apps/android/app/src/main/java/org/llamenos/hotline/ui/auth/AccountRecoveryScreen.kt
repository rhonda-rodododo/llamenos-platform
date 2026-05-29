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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import org.llamenos.hotline.R
import org.llamenos.hotline.ui.components.SecureWindowEffect

/**
 * Account recovery screen for unauthenticated users.
 *
 * Multi-step flow:
 * 1. IDENTIFIER — enter email/phone + hub
 * 2. SIGNAL_VERIFICATION — enter Signal verification code
 * 3. WAITING — poll for recovery approvals
 * 4. COMPLETE — recovery succeeded
 * 5. SET_PIN — set a new PIN for the recovered device
 */

enum class RecoveryStep {
    IDENTIFIER,
    SIGNAL_VERIFICATION,
    WAITING,
    COMPLETE,
    SET_PIN,
}

@Composable
fun AccountRecoveryScreen(
    onInitiateRecovery: (identifier: String, hubId: String) -> Unit,
    onVerifyCode: (code: String) -> Unit,
    onSetPin: (pin: String) -> Unit,
    currentStep: RecoveryStep,
    isLoading: Boolean,
    error: String?,
    contributionCount: Int,
    threshold: Int,
    delayRemainingMs: Long?,
    modifier: Modifier = Modifier,
) {
    SecureWindowEffect()

    Scaffold(modifier = modifier) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Header
            Icon(
                imageVector = Icons.Filled.Security,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .size(64.dp)
                    .testTag("recovery-icon"),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.recovery_group_initiate_title),
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.recovery_group_initiate_description),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(32.dp))

            // Error display
            if (error != null) {
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .padding(bottom = 16.dp)
                        .testTag("recovery-error"),
                )
            }

            when (currentStep) {
                RecoveryStep.IDENTIFIER -> IdentifierStep(
                    isLoading = isLoading,
                    onSubmit = onInitiateRecovery,
                )
                RecoveryStep.SIGNAL_VERIFICATION -> SignalVerificationStep(
                    isLoading = isLoading,
                    onVerify = onVerifyCode,
                )
                RecoveryStep.WAITING -> WaitingStep(
                    contributionCount = contributionCount,
                    threshold = threshold,
                    delayRemainingMs = delayRemainingMs,
                )
                RecoveryStep.COMPLETE -> CompleteStep()
                RecoveryStep.SET_PIN -> SetPinStep(
                    isLoading = isLoading,
                    onSetPin = onSetPin,
                )
            }
        }
    }
}

@Composable
private fun IdentifierStep(
    isLoading: Boolean,
    onSubmit: (identifier: String, hubId: String) -> Unit,
) {
    var identifier by remember { mutableStateOf("") }
    var hubId by remember { mutableStateOf("") }

    val isValid = identifier.isNotBlank() && hubId.isNotBlank()

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            OutlinedTextField(
                value = identifier,
                onValueChange = { identifier = it },
                label = { Text(stringResource(R.string.recovery_group_initiate_identifier)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("recovery-identifier-input"),
            )

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = hubId,
                onValueChange = { hubId = it },
                label = { Text(stringResource(R.string.recovery_group_initiate_select_hub)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Text,
                    imeAction = ImeAction.Done,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("recovery-hub-input"),
            )

            Spacer(Modifier.height(20.dp))

            Button(
                onClick = { onSubmit(identifier, hubId) },
                enabled = isValid && !isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .testTag("start-recovery-button"),
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text(stringResource(R.string.recovery_group_initiate_submit))
                }
            }
        }
    }
}

@Composable
private fun SignalVerificationStep(
    isLoading: Boolean,
    onVerify: (code: String) -> Unit,
) {
    var code by remember { mutableStateOf("") }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = stringResource(R.string.recovery_group_initiate_signal_verification),
                style = MaterialTheme.typography.bodyMedium,
            )

            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                value = code,
                onValueChange = { code = it },
                label = { Text(stringResource(R.string.recovery_group_initiate_verification_code)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Done,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("recovery-verification-code-input"),
            )

            Spacer(Modifier.height(20.dp))

            Button(
                onClick = { onVerify(code) },
                enabled = code.isNotBlank() && !isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .testTag("verify-recovery-button"),
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text(stringResource(R.string.recovery_group_initiate_verify))
                }
            }
        }
    }
}

@Composable
private fun WaitingStep(
    contributionCount: Int,
    threshold: Int,
    delayRemainingMs: Long?,
) {
    // Poll every 5 seconds — handled by the caller via LaunchedEffect

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("recovery-waiting-card"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            CircularProgressIndicator(
                modifier = Modifier
                    .size(48.dp)
                    .testTag("recovery-waiting-spinner"),
            )

            Spacer(Modifier.height(16.dp))

            Text(
                text = stringResource(R.string.recovery_group_initiate_waiting),
                style = MaterialTheme.typography.titleSmall,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(12.dp))

            Text(
                text = stringResource(
                    R.string.recovery_group_initiate_approvals_received,
                    contributionCount.toString(),
                    threshold.toString(),
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.testTag("recovery-approval-count"),
            )

            if (delayRemainingMs != null && delayRemainingMs > 0) {
                Spacer(Modifier.height(8.dp))
                val hoursRemaining = delayRemainingMs / 3_600_000
                val minutesRemaining = (delayRemainingMs % 3_600_000) / 60_000
                Text(
                    text = stringResource(
                        R.string.recovery_group_initiate_delay_countdown,
                        "${hoursRemaining}h ${minutesRemaining}m",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun CompleteStep() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("recovery-complete-card"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(48.dp),
            )

            Spacer(Modifier.height(16.dp))

            Text(
                text = stringResource(R.string.recovery_group_initiate_complete),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = stringResource(R.string.recovery_group_initiate_success),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun SetPinStep(
    isLoading: Boolean,
    onSetPin: (pin: String) -> Unit,
) {
    var pin by remember { mutableStateOf("") }
    var confirmPin by remember { mutableStateOf("") }
    var isConfirming by remember { mutableStateOf(false) }
    var mismatch by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("recovery-set-pin-card"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Icon(
                imageVector = Icons.Filled.Lock,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .size(32.dp)
                    .align(Alignment.CenterHorizontally),
            )

            Spacer(Modifier.height(12.dp))

            Text(
                text = stringResource(R.string.recovery_group_initiate_set_pin),
                style = MaterialTheme.typography.titleSmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(16.dp))

            if (!isConfirming) {
                OutlinedTextField(
                    value = pin,
                    onValueChange = {
                        if (it.length <= 8 && it.all { c -> c.isDigit() }) {
                            pin = it
                            mismatch = false
                        }
                    },
                    label = { Text(stringResource(R.string.pin_create_title)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.NumberPassword,
                        imeAction = ImeAction.Done,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("recovery-pin-input"),
                )

                Spacer(Modifier.height(16.dp))

                Button(
                    onClick = { isConfirming = true },
                    enabled = pin.length >= 6,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("recovery-pin-continue"),
                ) {
                    Text(stringResource(R.string.common_continue))
                }
            } else {
                OutlinedTextField(
                    value = confirmPin,
                    onValueChange = {
                        if (it.length <= 8 && it.all { c -> c.isDigit() }) {
                            confirmPin = it
                            mismatch = false
                        }
                    },
                    label = { Text(stringResource(R.string.pin_confirm_title)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.NumberPassword,
                        imeAction = ImeAction.Done,
                    ),
                    isError = mismatch,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("recovery-pin-confirm-input"),
                )

                if (mismatch) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = stringResource(R.string.pin_mismatch),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                Spacer(Modifier.height(16.dp))

                Button(
                    onClick = {
                        if (confirmPin == pin) {
                            onSetPin(pin)
                        } else {
                            mismatch = true
                            confirmPin = ""
                        }
                    },
                    enabled = confirmPin.length >= 6 && !isLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .testTag("recovery-pin-confirm-button"),
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Text(stringResource(R.string.pin_confirm_title))
                    }
                }
            }
        }
    }
}
