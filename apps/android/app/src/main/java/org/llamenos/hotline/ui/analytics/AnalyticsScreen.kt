package org.llamenos.hotline.ui.analytics

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
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
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.R
import java.time.Instant

/**
 * Admin analytics screen with KPI row, conversation metrics, shift coverage,
 * and per-user activity list. Gated by `audit:read` permission via the admin nav.
 *
 * Supports 7/30 day chip toggle and custom date picker dialog.
 * Pull-to-refresh reloads all analytics data.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalyticsScreen(
    modifier: Modifier = Modifier,
    viewModel: AnalyticsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    if (uiState.showDatePicker) {
        CustomDatePickerDialog(
            onDismiss = { viewModel.dismissDatePicker() },
            onConfirm = { from, to -> viewModel.setCustomDateRange(from, to) },
        )
    }

    PullToRefreshBox(
        isRefreshing = uiState.isLoading,
        onRefresh = { viewModel.load() },
        modifier = modifier
            .fillMaxSize()
            .testTag("analytics-screen"),
    ) {
        if (uiState.isLoading && uiState.callMetrics == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(modifier = Modifier.testTag("analytics-loading"))
            }
        } else if (uiState.error != null && uiState.callMetrics == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = uiState.error ?: "Error loading analytics",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.testTag("analytics-error"),
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { viewModel.load() }) {
                        Text("Retry")
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    // Header: title + date range controls
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = stringResource(R.string.analytics_title),
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.testTag("analytics-title"),
                        )
                        IconButton(
                            onClick = { viewModel.showDatePicker() },
                            modifier = Modifier.testTag("analytics-date-picker-btn"),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.DateRange,
                                contentDescription = "Custom date range",
                            )
                        }
                    }
                }

                item {
                    // 7/30 day chip group
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.testTag("analytics-date-chips"),
                    ) {
                        FilterChip(
                            selected = uiState.dateRangeOption == AnalyticsDateRangeOption.DAYS_7,
                            onClick = { viewModel.setDateRange(AnalyticsDateRangeOption.DAYS_7) },
                            label = { Text(stringResource(R.string.analytics_date_range_7days)) },
                            modifier = Modifier.testTag("chip-7days"),
                        )
                        FilterChip(
                            selected = uiState.dateRangeOption == AnalyticsDateRangeOption.DAYS_30,
                            onClick = { viewModel.setDateRange(AnalyticsDateRangeOption.DAYS_30) },
                            label = { Text(stringResource(R.string.analytics_date_range_30days)) },
                            modifier = Modifier.testTag("chip-30days"),
                        )
                        if (uiState.dateRangeOption == AnalyticsDateRangeOption.CUSTOM) {
                            FilterChip(
                                selected = true,
                                onClick = { viewModel.showDatePicker() },
                                label = { Text(stringResource(R.string.analytics_date_range_custom)) },
                                modifier = Modifier.testTag("chip-custom"),
                            )
                        }
                    }
                }

                // KPI row
                val callMetrics = uiState.callMetrics
                if (callMetrics != null) {
                    item {
                        KPIRow(
                            callMetrics = callMetrics,
                            totalConversations = uiState.conversationMetrics?.totalConversations?.toLong() ?: 0L,
                        )
                    }
                }

                // Conversation metrics
                val convMetrics = uiState.conversationMetrics
                if (convMetrics != null) {
                    item {
                        ConversationMetricsSection(metrics = convMetrics)
                    }
                }

                // Shift coverage
                val shiftMetrics = uiState.shiftMetrics
                if (shiftMetrics != null) {
                    item {
                        ShiftCoverageSection(metrics = shiftMetrics)
                    }
                }

                // User activity list
                item {
                    UserActivityList(
                        users = viewModel.sortedUsers(),
                        sortField = uiState.userSortField,
                        onSortChange = { viewModel.setSortField(it) },
                    )
                }

                item { Spacer(Modifier.height(16.dp)) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CustomDatePickerDialog(
    onDismiss: () -> Unit,
    onConfirm: (Instant, Instant) -> Unit,
) {
    val fromState = rememberDatePickerState()
    val toState = rememberDatePickerState(initialSelectedDateMillis = System.currentTimeMillis())

    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.testTag("analytics-date-picker-dialog"),
        title = { Text(stringResource(R.string.analytics_date_range_custom)) },
        text = {
            Column {
                Text("From", style = MaterialTheme.typography.labelLarge)
                DatePicker(state = fromState, showModeToggle = false)
                Spacer(Modifier.height(8.dp))
                Text("To", style = MaterialTheme.typography.labelLarge)
                DatePicker(state = toState, showModeToggle = false)
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val fromMs = fromState.selectedDateMillis ?: return@Button
                    val toMs = toState.selectedDateMillis ?: return@Button
                    onConfirm(Instant.ofEpochMilli(fromMs), Instant.ofEpochMilli(toMs))
                },
                modifier = Modifier.testTag("analytics-date-confirm"),
            ) {
                Text("Apply")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
