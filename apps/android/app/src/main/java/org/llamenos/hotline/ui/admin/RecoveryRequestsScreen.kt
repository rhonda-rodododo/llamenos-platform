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
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import org.llamenos.hotline.model.RecoverySessionStatus

/**
 * Admin screen for managing recovery requests.
 *
 * Displays active and historical recovery requests with status indicators,
 * approval progress, and action buttons (approve, cancel, urgent override).
 */
@Composable
fun RecoveryRequestsScreen(
    activeRequests: List<RecoverySessionStatus>,
    historyRequests: List<RecoverySessionStatus>,
    isLoading: Boolean,
    error: String?,
    onApprove: (sessionId: String) -> Unit,
    onCancel: (sessionId: String) -> Unit,
    onUrgentOverride: (sessionId: String, justification: String, approverPubkey: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var showCancelDialog by remember { mutableStateOf<String?>(null) }
    var showUrgentDialog by remember { mutableStateOf<String?>(null) }

    // Cancel confirmation dialog
    if (showCancelDialog != null) {
        AlertDialog(
            onDismissRequest = { showCancelDialog = null },
            title = { Text(stringResource(R.string.recovery_group_requests_cancel)) },
            text = {
                Text(stringResource(R.string.recovery_group_requests_cancel_confirm))
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showCancelDialog?.let(onCancel)
                        showCancelDialog = null
                    },
                    modifier = Modifier.testTag("confirm-cancel-button"),
                ) {
                    Text(
                        stringResource(R.string.recovery_group_requests_cancel),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showCancelDialog = null },
                    modifier = Modifier.testTag("dismiss-cancel-button"),
                ) {
                    Text(stringResource(R.string.common_cancel))
                }
            },
            modifier = Modifier.testTag("cancel-confirmation-dialog"),
        )
    }

    // Urgent recovery dialog
    if (showUrgentDialog != null) {
        UrgentRecoveryDialog(
            onDismiss = { showUrgentDialog = null },
            onConfirm = { justification, approverPubkey ->
                showUrgentDialog?.let { sessionId ->
                    onUrgentOverride(sessionId, justification, approverPubkey)
                }
                showUrgentDialog = null
            },
        )
    }

    Column(modifier = modifier.fillMaxSize()) {
        // Tab row: Active / History
        TabRow(
            selectedTabIndex = selectedTab,
            modifier = Modifier.testTag("recovery-requests-tabs"),
        ) {
            Tab(
                selected = selectedTab == 0,
                onClick = { selectedTab = 0 },
                text = { Text(stringResource(R.string.recovery_group_requests_active)) },
                modifier = Modifier.testTag("recovery-requests-active-tab"),
            )
            Tab(
                selected = selectedTab == 1,
                onClick = { selectedTab = 1 },
                text = { Text(stringResource(R.string.recovery_group_requests_history)) },
                modifier = Modifier.testTag("recovery-requests-history-tab"),
            )
        }

        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(modifier = Modifier.testTag("recovery-requests-loading"))
            }
            return
        }

        if (error != null) {
            Spacer(Modifier.height(16.dp))
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier
                    .padding(16.dp)
                    .testTag("recovery-requests-error"),
            )
        }

        val requests = if (selectedTab == 0) activeRequests else historyRequests
        val isActiveTab = selectedTab == 0

        if (requests.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.recovery_group_no_team),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("recovery-requests-empty"),
                )
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.testTag("recovery-requests-list"),
            ) {
                items(requests, key = { it.sessionId }) { session ->
                    RecoveryRequestCard(
                        session = session,
                        showActions = isActiveTab,
                        onApprove = { onApprove(session.sessionId) },
                        onCancel = { showCancelDialog = session.sessionId },
                        onUrgent = { showUrgentDialog = session.sessionId },
                    )
                }
            }
        }
    }
}

@Composable
private fun RecoveryRequestCard(
    session: RecoverySessionStatus,
    showActions: Boolean,
    onApprove: () -> Unit,
    onCancel: () -> Unit,
    onUrgent: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("recovery-request-card-${session.sessionId}"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header row: user pubkey + status chip
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = session.userPubkey.take(16) + "...",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f),
                )
                RecoveryStatusChip(status = session.status)
            }

            Spacer(Modifier.height(8.dp))

            // Approval progress
            val progress = if (session.threshold > 0) {
                session.contributionCount.toFloat() / session.threshold.toFloat()
            } else {
                0f
            }

            Text(
                text = stringResource(
                    R.string.recovery_group_requests_approval_progress,
                    session.contributionCount.toString(),
                    session.threshold.toString(),
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            LinearProgressIndicator(
                progress = { progress.coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("approval-progress-${session.sessionId}"),
            )

            // Delay remaining
            if (session.delayRemainingMs != null && session.delayRemainingMs > 0) {
                Spacer(Modifier.height(8.dp))
                val hoursRemaining = session.delayRemainingMs / 3_600_000
                val minutesRemaining = (session.delayRemainingMs % 3_600_000) / 60_000
                Text(
                    text = "${stringResource(R.string.recovery_group_requests_time_remaining)}: ${hoursRemaining}h ${minutesRemaining}m",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }

            // Duress alert
            if (session.emergencyOverride != null) {
                Spacer(Modifier.height(8.dp))
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                    ),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Warning,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.recovery_group_requests_duress_alert),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                    }
                }
            }

            // Action buttons
            if (showActions) {
                Spacer(Modifier.height(12.dp))
                HorizontalDivider()
                Spacer(Modifier.height(8.dp))

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    FilledTonalButton(
                        onClick = onApprove,
                        modifier = Modifier
                            .weight(1f)
                            .testTag("approve-recovery-${session.sessionId}"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = stringResource(R.string.recovery_group_requests_approve),
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }

                    OutlinedButton(
                        onClick = onCancel,
                        modifier = Modifier.testTag("cancel-recovery-${session.sessionId}"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Cancel,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }

                Spacer(Modifier.height(4.dp))

                TextButton(
                    onClick = onUrgent,
                    modifier = Modifier.testTag("urgent-recovery-${session.sessionId}"),
                ) {
                    Text(
                        text = stringResource(R.string.recovery_group_urgent_enable),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}

@Composable
fun RecoveryStatusChip(
    status: String,
    modifier: Modifier = Modifier,
) {
    val (label, color) = when (status) {
        "pending" -> stringResource(R.string.recovery_group_requests_status_pending) to
                MaterialTheme.colorScheme.outline
        "verified" -> stringResource(R.string.recovery_group_requests_status_verified) to
                MaterialTheme.colorScheme.tertiary
        "active" -> stringResource(R.string.recovery_group_requests_status_active) to
                MaterialTheme.colorScheme.primary
        "completed" -> stringResource(R.string.recovery_group_requests_status_completed) to
                MaterialTheme.colorScheme.primary
        "expired" -> stringResource(R.string.recovery_group_requests_status_expired) to
                MaterialTheme.colorScheme.error
        "cancelled" -> stringResource(R.string.recovery_group_requests_status_cancelled) to
                MaterialTheme.colorScheme.outline
        else -> status to MaterialTheme.colorScheme.outline
    }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = color.copy(alpha = 0.12f),
        ),
        modifier = modifier.testTag("recovery-status-chip-$status"),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun UrgentRecoveryDialog(
    onDismiss: () -> Unit,
    onConfirm: (justification: String, approverPubkey: String) -> Unit,
) {
    var justification by remember { mutableStateOf("") }
    var approverPubkey by remember { mutableStateOf("") }

    val isValid = justification.length >= 16 && approverPubkey.isNotBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.recovery_group_urgent_title)) },
        text = {
            Column {
                Text(
                    text = stringResource(R.string.recovery_group_urgent_description),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(16.dp))

                OutlinedTextField(
                    value = justification,
                    onValueChange = { justification = it },
                    label = { Text(stringResource(R.string.recovery_group_urgent_justification)) },
                    placeholder = { Text(stringResource(R.string.recovery_group_urgent_justification_placeholder)) },
                    minLines = 3,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("urgent-justification-input"),
                )

                Spacer(Modifier.height(12.dp))

                OutlinedTextField(
                    value = approverPubkey,
                    onValueChange = { approverPubkey = it },
                    label = { Text(stringResource(R.string.recovery_group_urgent_second_approver)) },
                    placeholder = { Text(stringResource(R.string.recovery_group_urgent_select_approver)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("urgent-approver-input"),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(justification, approverPubkey) },
                enabled = isValid,
                modifier = Modifier.testTag("confirm-urgent-button"),
            ) {
                Text(stringResource(R.string.recovery_group_urgent_enable))
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.testTag("dismiss-urgent-button"),
            ) {
                Text(stringResource(R.string.common_cancel))
            }
        },
        modifier = Modifier.testTag("urgent-recovery-dialog"),
    )
}
