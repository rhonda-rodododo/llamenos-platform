package org.llamenos.hotline.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R

@Composable
fun ErasureQueueTab(
    viewModel: AdminViewModel,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()

    var statusFilter by remember { mutableStateOf<String?>(null) }

    // Immediate erasure dialog
    if (uiState.showImmediateErasureDialog != null) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissImmediateErasureDialog() },
            title = { Text(stringResource(R.string.erasure_admin_execute_title)) },
            text = {
                Column {
                    Text(
                        text = stringResource(R.string.erasure_admin_execute_description),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(16.dp))
                    OutlinedTextField(
                        value = uiState.immediateErasureJustification,
                        onValueChange = { viewModel.updateImmediateErasureJustification(it) },
                        label = { Text(stringResource(R.string.erasure_admin_justification_label)) },
                        placeholder = { Text(stringResource(R.string.erasure_admin_justification_placeholder)) },
                        minLines = 2,
                        maxLines = 4,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("erasure-justification-input"),
                    )
                    if (uiState.erasureError != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = uiState.erasureError ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.executeImmediateErasure() },
                    enabled = uiState.immediateErasureJustification.isNotBlank(),
                    modifier = Modifier.testTag("submit-immediate-erasure"),
                ) {
                    Text(stringResource(R.string.erasure_admin_execute_button))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { viewModel.dismissImmediateErasureDialog() },
                    modifier = Modifier.testTag("cancel-immediate-erasure"),
                ) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
            modifier = Modifier.testTag("immediate-erasure-dialog"),
        )
    }

    Scaffold(
        modifier = modifier,
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            // Filter chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val filters = listOf(
                    null to stringResource(R.string.erasure_admin_queue_empty),
                    "pending" to stringResource(R.string.erasure_status_pending),
                    "scheduled" to stringResource(R.string.erasure_status_scheduled),
                    "completed" to stringResource(R.string.erasure_status_completed),
                )
                filters.forEach { (filterValue, label) ->
                    FilterChip(
                        selected = statusFilter == filterValue,
                        onClick = {
                            statusFilter = filterValue
                            viewModel.loadErasureRequests()
                        },
                        label = { Text(text = label, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.testTag("erasure-filter-${filterValue ?: "all"}"),
                    )
                }
            }

            when {
                uiState.isLoadingErasure -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("erasure-loading"),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }

                uiState.erasureRequests.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp)
                            .testTag("erasure-empty"),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                imageVector = Icons.Filled.PersonRemove,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                            )
                            Spacer(Modifier.height(12.dp))
                            Text(
                                text = stringResource(R.string.erasure_admin_queue_empty),
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("erasure-queue-list"),
                    ) {
                        items(
                            items = uiState.erasureRequests,
                            key = { it.id },
                        ) { request ->
                            ErasureRequestCard(
                                request = request,
                                onExecute = { viewModel.showImmediateErasureDialog(request.userId) },
                            )
                        }
                    }
                }
            }

            if (uiState.erasureError != null && uiState.showImmediateErasureDialog == null) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                        .testTag("erasure-error"),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                    ),
                ) {
                    Text(
                        text = uiState.erasureError ?: "",
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }
        }
    }
}

@Composable
private fun ErasureRequestCard(
    request: ErasureRequestEntry,
    onExecute: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("erasure-card-${request.id}"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = request.userId.take(16) + "...",
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(4.dp))
                    StatusChip(status = request.status)
                }
            }

            if (!request.justification.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = request.justification,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            Spacer(Modifier.height(8.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                if (request.requestedAt != null) {
                    Text(
                        text = request.requestedAt,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    )
                }
                if (request.emergencyOverride) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.erasure_emergency_override_label),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.tertiary,
                    )
                }
            }

            if (request.status == "pending" || request.status == "scheduled") {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = onExecute,
                    modifier = Modifier.testTag("execute-erasure-${request.id}"),
                ) {
                    Text(
                        text = stringResource(R.string.erasure_admin_execute_button),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}

@Composable
private fun StatusChip(status: String) {
    val color = when (status) {
        "pending" -> MaterialTheme.colorScheme.tertiary
        "scheduled" -> MaterialTheme.colorScheme.secondary
        "executing" -> MaterialTheme.colorScheme.primary
        "completed" -> MaterialTheme.colorScheme.outline
        "cancelled" -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Text(
        text = status,
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = Modifier.testTag("status-chip-$status"),
    )
}
