package org.llamenos.hotline.ui.shifts

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
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import org.llamenos.hotline.model.ShiftResponse
import org.llamenos.hotline.util.DateFormatUtils

/**
 * Shifts screen showing clock in/out toggle and available shifts.
 *
 * The prominent clock in/out button at the top controls whether the volunteer
 * receives incoming call notifications. Below it, available shifts are grouped
 * by day of week with sign up / drop actions.
 *
 * @param viewModel Hilt-injected ShiftsViewModel
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShiftsScreen(
    viewModel: ShiftsViewModel,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()

    // Drop confirmation dialog
    uiState.showDropConfirmation?.let { shiftId ->
        AlertDialog(
            onDismissRequest = { viewModel.dismissDropConfirmation() },
            title = { Text(stringResource(R.string.shift_drop)) },
            text = { Text(stringResource(R.string.shift_drop_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.dropShift(shiftId) },
                    modifier = Modifier.testTag("confirm-drop-button"),
                ) {
                    Text(stringResource(R.string.shift_drop))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { viewModel.dismissDropConfirmation() },
                    modifier = Modifier.testTag("cancel-drop-button"),
                ) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
            modifier = Modifier.testTag("drop-confirmation-dialog"),
        )
    }

    Scaffold(modifier = modifier) { paddingValues ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            when {
                uiState.isLoading && uiState.shifts.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("shifts-loading"),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }

                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("shifts-list"),
                    ) {
                        // Clock in/out card
                        item {
                            ClockInOutCard(
                                isOnShift = uiState.currentStatus?.isOnShift ?: false,
                                isLoading = uiState.isClockingInOut,
                                startedAt = uiState.currentStatus?.startedAt,
                                onClockIn = { viewModel.clockIn() },
                                onClockOut = { viewModel.clockOut() },
                            )
                        }

                        // Active shift info
                        uiState.currentStatus?.let { status ->
                            if (status.isOnShift) {
                                item {
                                    ActiveShiftInfo(
                                        activeCallCount = status.activeCallCount ?: 0,
                                        recentNoteCount = status.recentNoteCount ?: 0,
                                    )
                                }
                            }
                        }

                        // Error card
                        if (uiState.error != null) {
                            item {
                                Card(
                                    colors = CardDefaults.cardColors(
                                        containerColor = MaterialTheme.colorScheme.errorContainer,
                                    ),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .testTag("shifts-error"),
                                ) {
                                    Text(
                                        text = uiState.error ?: "",
                                        modifier = Modifier.padding(16.dp),
                                        color = MaterialTheme.colorScheme.onErrorContainer,
                                    )
                                }
                            }
                        }

                        // Shifts grouped by day
                        val shiftsByDay = uiState.shifts.groupBy { shift ->
                            shift.days.firstOrNull() ?: 0
                        }.toSortedMap()

                        if (shiftsByDay.isEmpty() && !uiState.isLoading) {
                            item {
                                EmptyShiftsState()
                            }
                        }

                        shiftsByDay.forEach { (dayIndex, dayShifts) ->
                            item {
                                Text(
                                    text = DateFormatUtils.shortDayName(dayIndex),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier
                                        .padding(top = 8.dp)
                                        .testTag("day-header-$dayIndex"),
                                )
                            }

                            items(
                                items = dayShifts,
                                key = { it.id },
                            ) { shift ->
                                ShiftCard(
                                    shift = shift,
                                    onSignUp = { viewModel.signUp(shift.id) },
                                    onDrop = { viewModel.showDropConfirmation(shift.id) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Prominent clock in/out toggle card at the top of the shifts screen.
 */
@Composable
private fun ClockInOutCard(
    isOnShift: Boolean,
    isLoading: Boolean,
    startedAt: String?,
    onClockIn: () -> Unit,
    onClockOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("clock-card"),
        colors = CardDefaults.cardColors(
            containerColor = if (isOnShift) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = if (isOnShift) Icons.Filled.CheckCircle else Icons.Filled.Schedule,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
                tint = if (isOnShift) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )

            Spacer(Modifier.height(12.dp))

            Text(
                text = if (isOnShift) {
                    stringResource(R.string.on_shift)
                } else {
                    stringResource(R.string.off_shift)
                },
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.testTag("clock-status-text"),
            )

            if (isOnShift && startedAt != null) {
                Text(
                    text = stringResource(R.string.shift_since, DateFormatUtils.formatTimeOnly(startedAt)),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("clock-started-at"),
                )
            }

            Spacer(Modifier.height(16.dp))

            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(40.dp)
                        .testTag("clock-loading"),
                    strokeWidth = 3.dp,
                )
            } else if (isOnShift) {
                Button(
                    onClick = onClockOut,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("clock-out-button"),
                ) {
                    Text(stringResource(R.string.shift_clock_out))
                }
            } else {
                Button(
                    onClick = onClockIn,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("clock-in-button"),
                ) {
                    Text(stringResource(R.string.shift_clock_in))
                }
            }
        }
    }
}

/**
 * Active shift info card showing call and note counts.
 */
@Composable
private fun ActiveShiftInfo(
    activeCallCount: Int,
    recentNoteCount: Int,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("active-shift-info"),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = activeCallCount.toString(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.testTag("active-call-count"),
                )
                Text(
                    text = stringResource(R.string.active_calls),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = recentNoteCount.toString(),
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.testTag("recent-note-count"),
                )
                Text(
                    text = stringResource(R.string.notes_title),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * Individual shift card with time, status badge, and sign up/drop action.
 */
@Composable
private fun ShiftCard(
    shift: ShiftResponse,
    onSignUp: () -> Unit,
    onDrop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("shift-card-${shift.id}"),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Time range
            Column(
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    text = "${shift.startTime} - ${shift.endTime}",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.testTag("shift-time-${shift.id}"),
                )

                Spacer(Modifier.height(4.dp))

                // Days
                Text(
                    text = shift.days.joinToString(", ") { DateFormatUtils.shortDayName(it) },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.width(12.dp))

            // Status badge + action
            Column(
                horizontalAlignment = Alignment.End,
            ) {
                // Status badge
                Text(
                    text = when (shift.status) {
                        "available" -> stringResource(R.string.shift_available)
                        "assigned" -> stringResource(R.string.shift_assigned)
                        else -> shift.status.replaceFirstChar { it.uppercase() }
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = when (shift.status) {
                        "available" -> MaterialTheme.colorScheme.primary
                        "assigned" -> MaterialTheme.colorScheme.tertiary
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier.testTag("shift-status-${shift.id}"),
                )

                Spacer(Modifier.height(8.dp))

                when (shift.status) {
                    "available" -> {
                        FilledTonalButton(
                            onClick = onSignUp,
                            modifier = Modifier.testTag("shift-signup-${shift.id}"),
                        ) {
                            Text(stringResource(R.string.shift_sign_up))
                        }
                    }

                    "assigned" -> {
                        OutlinedButton(
                            onClick = onDrop,
                            modifier = Modifier.testTag("shift-drop-${shift.id}"),
                        ) {
                            Text(stringResource(R.string.shift_drop))
                        }
                    }
                }
            }
        }
    }
}

/**
 * Empty state when no shifts are available.
 */
@Composable
private fun EmptyShiftsState(
    modifier: Modifier = Modifier,
) {
    org.llamenos.hotline.ui.components.EmptyState(
        icon = Icons.Filled.CalendarMonth,
        title = stringResource(R.string.shifts_empty),
        subtitle = stringResource(R.string.shifts_empty_subtitle),
        testTag = "shifts-empty",
        modifier = modifier,
    )
}


