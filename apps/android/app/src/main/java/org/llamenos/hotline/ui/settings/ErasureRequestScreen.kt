package org.llamenos.hotline.ui.settings

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
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.R

/**
 * Self-service erasure request screen.
 *
 * Shows countdown if a request is active, or the request form if not.
 * Accessible from Settings via navigation.
 */
@Composable
fun ErasureRequestScreen(
    viewModel: ErasureViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) { viewModel.loadStatus() }

    // Request confirmation dialog
    if (uiState.showRequestConfirmation) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissRequestConfirmation() },
            title = { Text(stringResource(R.string.erasure_request_confirm_title)) },
            text = { Text(stringResource(R.string.erasure_request_confirm_message)) },
            confirmButton = {
                TextButton(onClick = { viewModel.requestErasure() }) {
                    Text(stringResource(R.string.erasure_request_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissRequestConfirmation() }) {
                    Text(stringResource(R.string.cancel))
                }
            },
            modifier = Modifier.testTag("erasure-request-confirm-dialog"),
        )
    }

    // Cancel confirmation dialog
    if (uiState.showCancelConfirmation) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissCancelConfirmation() },
            title = { Text(stringResource(R.string.erasure_cancel_confirm_title)) },
            text = { Text(stringResource(R.string.erasure_cancel_confirm_message)) },
            confirmButton = {
                TextButton(onClick = { viewModel.cancelErasure() }) {
                    Text(stringResource(R.string.erasure_cancel_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.dismissCancelConfirmation() }) {
                    Text(stringResource(R.string.cancel))
                }
            },
            modifier = Modifier.testTag("erasure-cancel-confirm-dialog"),
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (uiState.isLoading) {
            CircularProgressIndicator(modifier = Modifier.testTag("erasure-loading"))
        } else if (uiState.activeRequest != null &&
            (uiState.activeRequest?.status == "scheduled" || uiState.activeRequest?.status == "pending")
        ) {
            ActiveErasureContent(
                request = uiState.activeRequest!!,
                isMutating = uiState.isMutating,
                onCancel = { viewModel.showCancelConfirmation() },
            )
        } else {
            RequestErasureContent(
                isMutating = uiState.isMutating,
                error = uiState.error,
                onRequest = { viewModel.showRequestConfirmation() },
            )
        }
    }
}

@Composable
private fun ActiveErasureContent(
    request: ErasureRequest,
    isMutating: Boolean,
    onCancel: () -> Unit,
) {
    Spacer(modifier = Modifier.height(40.dp))

    Icon(
        imageVector = Icons.Default.Schedule,
        contentDescription = null,
        modifier = Modifier.size(64.dp),
        tint = MaterialTheme.colorScheme.tertiary,
    )

    Spacer(modifier = Modifier.height(24.dp))

    Text(
        text = stringResource(R.string.erasure_countdown_title),
        style = MaterialTheme.typography.headlineSmall,
        textAlign = TextAlign.Center,
    )

    Spacer(modifier = Modifier.height(8.dp))

    Text(
        text = stringResource(R.string.erasure_countdown_message),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
    )

    Spacer(modifier = Modifier.height(32.dp))

    OutlinedButton(
        onClick = onCancel,
        enabled = !isMutating,
        modifier = Modifier
            .fillMaxWidth()
            .testTag("cancel-erasure-button"),
    ) {
        Text(stringResource(R.string.erasure_cancel_button))
    }
}

@Composable
private fun RequestErasureContent(
    isMutating: Boolean,
    error: String?,
    onRequest: () -> Unit,
) {
    Spacer(modifier = Modifier.height(40.dp))

    Icon(
        imageVector = Icons.Default.PersonRemove,
        contentDescription = null,
        modifier = Modifier.size(64.dp),
        tint = MaterialTheme.colorScheme.error,
    )

    Spacer(modifier = Modifier.height(24.dp))

    Text(
        text = stringResource(R.string.erasure_request_title),
        style = MaterialTheme.typography.headlineSmall,
        textAlign = TextAlign.Center,
    )

    Spacer(modifier = Modifier.height(8.dp))

    Text(
        text = stringResource(R.string.erasure_request_description),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
    )

    if (error != null) {
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = error,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }

    Spacer(modifier = Modifier.height(32.dp))

    Button(
        onClick = onRequest,
        enabled = !isMutating,
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.error,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("request-erasure-button"),
    ) {
        Text(stringResource(R.string.erasure_request_button))
    }
}
