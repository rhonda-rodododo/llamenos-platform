package org.llamenos.hotline.ui.reports

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import org.llamenos.hotline.model.Report

/**
 * Reports screen showing a list of structured reports with status
 * indicators, category badges, and message counts.
 *
 * Reports are specialized conversations with metadata (title, category,
 * linked call, custom fields). Supports filtering by status and category.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportsScreen(
    viewModel: ReportsViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToReportDetail: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.reports_title),
                        modifier = Modifier.testTag("reports-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.testTag("reports-back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.reports_back),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
            )
        },
        modifier = modifier,
    ) { paddingValues ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Status filter chips
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .testTag("report-status-filters"),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(ReportStatusFilter.entries.toList()) { filter ->
                        FilterChip(
                            selected = uiState.selectedStatus == filter,
                            onClick = { viewModel.setStatusFilter(filter) },
                            label = {
                                Text(
                                    when (filter) {
                                        ReportStatusFilter.ALL -> stringResource(R.string.filter_all)
                                        ReportStatusFilter.ACTIVE -> stringResource(R.string.filter_active)
                                        ReportStatusFilter.WAITING -> stringResource(R.string.report_filter_waiting)
                                        ReportStatusFilter.CLOSED -> stringResource(R.string.filter_closed)
                                    },
                                )
                            },
                            modifier = Modifier.testTag("report-filter-${filter.name.lowercase()}"),
                        )
                    }
                }

                // Category filter chips (if categories available)
                if (uiState.categories.isNotEmpty()) {
                    LazyRow(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp)
                            .testTag("report-category-filters"),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        item {
                            FilterChip(
                                selected = uiState.selectedCategory == null,
                                onClick = { viewModel.setCategoryFilter(null) },
                                label = { Text(stringResource(R.string.filter_all)) },
                                modifier = Modifier.testTag("report-category-all"),
                            )
                        }
                        items(uiState.categories) { category ->
                            FilterChip(
                                selected = uiState.selectedCategory == category,
                                onClick = { viewModel.setCategoryFilter(category) },
                                label = { Text(category) },
                                modifier = Modifier.testTag("report-category-$category"),
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                }

                // Content
                when {
                    uiState.isLoading && uiState.reports.isEmpty() -> {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .testTag("reports-loading"),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator()
                        }
                    }
                    uiState.reports.isEmpty() && !uiState.isLoading -> {
                        EmptyReports(modifier = Modifier.fillMaxSize())
                    }
                    else -> {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxSize()
                                .testTag("reports-list"),
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                                horizontal = 16.dp,
                                vertical = 8.dp,
                            ),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(
                                items = uiState.reports,
                                key = { it.id },
                            ) { report ->
                                ReportCard(
                                    report = report,
                                    onClick = {
                                        viewModel.selectReport(report)
                                        onNavigateToReportDetail(report.id)
                                    },
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
 * Card displaying a single report with status indicator, title,
 * category badge, and message count.
 */
@Composable
private fun ReportCard(
    report: Report,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val statusColor = when (report.status) {
        "active" -> MaterialTheme.colorScheme.primary
        "waiting" -> MaterialTheme.colorScheme.tertiary
        "closed" -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag("report-card-${report.id}"),
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
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                // Status dot
                Icon(
                    imageVector = Icons.Filled.Circle,
                    contentDescription = null,
                    tint = statusColor,
                    modifier = Modifier
                        .size(10.dp)
                        .testTag("report-status-dot"),
                )

                Spacer(Modifier.width(8.dp))

                // Title
                Text(
                    text = report.metadata?.reportTitle ?: stringResource(R.string.report_untitled),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .weight(1f)
                        .testTag("report-title"),
                )

                // Message count
                if (report.messageCount > 0) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "${report.messageCount}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.testTag("report-message-count"),
                    )
                }
            }

            Spacer(Modifier.height(6.dp))

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Status label
                Text(
                    text = report.status.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.labelSmall,
                    color = statusColor,
                    modifier = Modifier.testTag("report-status-label"),
                )

                // Category badge
                val category = report.metadata?.reportCategory
                if (category != null) {
                    Text(
                        text = category,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.testTag("report-category-badge"),
                    )
                }

                Spacer(Modifier.weight(1f))

                // Timestamp
                Text(
                    text = formatReportTime(report.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    modifier = Modifier.testTag("report-timestamp"),
                )
            }
        }
    }
}

/**
 * Empty state for reports.
 */
@Composable
private fun EmptyReports(
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .padding(32.dp)
            .testTag("reports-empty"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.Assignment,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
            modifier = Modifier.size(64.dp),
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = stringResource(R.string.reports_empty),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.reports_empty_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
        )
    }
}

/**
 * Format an ISO 8601 date string for report display.
 */
private fun formatReportTime(isoDate: String): String {
    return try {
        val dateTime = isoDate.replace("T", " ").replace("Z", "")
        val parts = dateTime.split(" ")
        if (parts.size >= 2) parts[0] else isoDate
    } catch (_: Exception) {
        isoDate
    }
}
