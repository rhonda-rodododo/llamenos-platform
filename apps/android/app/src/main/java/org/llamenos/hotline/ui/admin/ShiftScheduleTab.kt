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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import org.llamenos.hotline.model.AdminShiftDetail
import org.llamenos.hotline.util.DateFormatUtils

/**
 * Shift schedule administration tab in the admin panel.
 *
 * Allows admins to create, edit, and delete shifts. Each shift has a name,
 * start/end time, and assigned volunteers. This is the admin CRUD view,
 * separate from the volunteer-facing ShiftsScreen.
 */
@Composable
fun ShiftScheduleTab(
    viewModel: AdminViewModel,
    onNavigateToShiftDetail: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()

    if (uiState.showCreateShiftDialog) {
        ShiftDialog(
            existingShift = uiState.editingShift,
            onDismiss = { viewModel.dismissShiftDialog() },
            onSave = { name, startTime, endTime ->
                val editing = uiState.editingShift
                if (editing != null) {
                    viewModel.updateShift(editing.id, name, startTime, endTime)
                } else {
                    viewModel.createShift(name, startTime, endTime)
                }
            },
        )
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { viewModel.showCreateShiftDialog() },
                modifier = Modifier.testTag("create-shift-fab"),
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = stringResource(R.string.shift_create),
                )
            }
        },
        modifier = modifier,
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            when {
                uiState.isLoadingAdminShifts -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("admin-shifts-loading"),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }

                uiState.adminShifts.isEmpty() && !uiState.isLoadingAdminShifts -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp)
                            .testTag("admin-shifts-empty"),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                imageVector = Icons.Filled.Schedule,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                            )
                            Spacer(Modifier.height(12.dp))
                            Text(
                                text = stringResource(R.string.shifts_empty_scheduled),
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
                            .testTag("admin-shifts-list"),
                    ) {
                        items(
                            items = uiState.adminShifts,
                            key = { it.id },
                        ) { shift ->
                            ShiftCard(
                                shift = shift,
                                onClick = { onNavigateToShiftDetail(shift.id) },
                                onEdit = { viewModel.showEditShiftDialog(shift) },
                                onDelete = { viewModel.deleteShift(shift.id) },
                            )
                        }
                    }
                }
            }

            if (uiState.adminShiftsError != null) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                        .testTag("admin-shifts-error"),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                    ),
                ) {
                    Text(
                        text = uiState.adminShiftsError ?: "",
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }
        }
    }
}

@Composable
private fun ShiftCard(
    shift: AdminShiftDetail,
    onClick: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .testTag("shift-card-${shift.id}"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = shift.name,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.testTag("shift-name-${shift.id}"),
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "${shift.startTime} - ${shift.endTime}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("shift-time-${shift.id}"),
                )
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (shift.days.isNotEmpty()) {
                        AssistChip(
                            onClick = {},
                            label = {
                                Text(
                                    text = formatDays(shift.days),
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            },
                            modifier = Modifier.height(24.dp),
                        )
                    }
                    AssistChip(
                        onClick = {},
                        label = {
                            Text(
                                text = "${shift.volunteerCount} volunteer${if (shift.volunteerCount != 1) "s" else ""}",
                                style = MaterialTheme.typography.labelSmall,
                            )
                        },
                        modifier = Modifier.height(24.dp),
                    )
                }
            }

            IconButton(
                onClick = onEdit,
                modifier = Modifier.testTag("edit-shift-${shift.id}"),
            ) {
                Icon(Icons.Filled.Edit, contentDescription = stringResource(R.string.shift_edit))
            }

            IconButton(
                onClick = onDelete,
                modifier = Modifier.testTag("delete-shift-${shift.id}"),
            ) {
                Icon(
                    Icons.Filled.Delete,
                    contentDescription = stringResource(R.string.shift_delete),
                    tint = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

/**
 * Format day-of-week integers (1=Mon, 7=Sun) into a compact display string.
 */
private fun formatDays(days: List<Int>): String {
    return DateFormatUtils.formatDayList(days)
}

@Composable
private fun ShiftDialog(
    existingShift: AdminShiftDetail?,
    onDismiss: () -> Unit,
    onSave: (name: String, startTime: String, endTime: String) -> Unit,
) {
    var name by remember { mutableStateOf(existingShift?.name ?: "") }
    var startTime by remember { mutableStateOf(existingShift?.startTime ?: "") }
    var endTime by remember { mutableStateOf(existingShift?.endTime ?: "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                if (existingShift != null) stringResource(R.string.shift_edit)
                else stringResource(R.string.shift_create),
            )
        },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.shift_name)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("shift-name-input"),
                )

                Spacer(Modifier.height(8.dp))

                OutlinedTextField(
                    value = startTime,
                    onValueChange = { startTime = it },
                    label = { Text(stringResource(R.string.shift_start_time)) },
                    placeholder = { Text("09:00") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("shift-start-input"),
                )

                Spacer(Modifier.height(8.dp))

                OutlinedTextField(
                    value = endTime,
                    onValueChange = { endTime = it },
                    label = { Text(stringResource(R.string.shift_end_time)) },
                    placeholder = { Text("17:00") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("shift-end-input"),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(name, startTime, endTime) },
                enabled = name.isNotBlank() && startTime.isNotBlank() && endTime.isNotBlank(),
                modifier = Modifier.testTag("confirm-shift-save"),
            ) {
                Text(stringResource(R.string.action_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(android.R.string.cancel))
            }
        },
    )
}
