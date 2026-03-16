package org.llamenos.hotline.ui.cases

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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.model.CaseRecord
import org.llamenos.hotline.model.EntityTypeDefinition
import org.llamenos.hotline.model.EnumOption
import org.llamenos.hotline.util.DateFormatUtils

/**
 * Case list screen showing a filterable, paginated list of case records.
 *
 * The top-level UI has:
 * 1. A scrollable tab row for entity type filtering (All + each visible type)
 * 2. A chip row for status filtering (from the selected entity type's statuses)
 * 3. A LazyColumn of case cards with pull-to-refresh
 * 4. A FAB for creating new cases
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CaseListScreen(
    viewModel: CaseManagementViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToCaseDetail: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()

    // Build tab list: "All" + each visible entity type
    val tabs = remember(uiState.visibleEntityTypes) {
        listOf<EntityTypeDefinition?>(null) + uiState.visibleEntityTypes
    }

    val selectedTabIndex = remember(uiState.selectedEntityTypeId, tabs) {
        if (uiState.selectedEntityTypeId == null) 0
        else tabs.indexOfFirst { it?.id == uiState.selectedEntityTypeId }.coerceAtLeast(0)
    }

    // Status options for the selected entity type
    val statusOptions: List<EnumOption> = remember(uiState.selectedEntityTypeId, uiState.entityTypes) {
        if (uiState.selectedEntityTypeId != null) {
            uiState.entityTypes.find { it.id == uiState.selectedEntityTypeId }?.statuses
                ?: emptyList()
        } else {
            emptyList()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Cases",
                        modifier = Modifier.testTag("cases-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.testTag("cases-back-button"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = {
                    // Navigate to create -- reuse CaseDetail with no record ID
                    onNavigateToCaseDetail("new")
                },
                modifier = Modifier.testTag("case-create-fab"),
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = "Create case",
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
            // Entity type tab row — always shown so the "All" tab is available
            ScrollableTabRow(
                selectedTabIndex = selectedTabIndex,
                edgePadding = 16.dp,
                modifier = Modifier.testTag("case-type-tabs"),
            ) {
                tabs.forEachIndexed { index, entityType ->
                    val tabName = entityType?.name ?: "all"
                    Tab(
                        selected = selectedTabIndex == index,
                        onClick = {
                            viewModel.setEntityTypeFilter(entityType?.id)
                        },
                        text = {
                            Text(
                                text = entityType?.labelPlural ?: "All",
                                maxLines = 1,
                            )
                        },
                        modifier = Modifier.testTag("case-tab-$tabName"),
                    )
                }
            }

            // Status filter chips
            if (statusOptions.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .testTag("case-status-filter"),
                ) {
                    item {
                        FilterChip(
                            selected = uiState.selectedStatusHash == null,
                            onClick = { viewModel.setStatusFilter(null) },
                            label = { Text("All") },
                            modifier = Modifier.testTag("case-status-all"),
                        )
                    }
                    items(statusOptions) { status ->
                        val statusColor = status.color?.let { parseHexColor(it) }
                        FilterChip(
                            selected = uiState.selectedStatusHash == status.value,
                            onClick = {
                                viewModel.setStatusFilter(
                                    if (uiState.selectedStatusHash == status.value) null
                                    else status.value,
                                )
                            },
                            label = { Text(status.label) },
                            leadingIcon = if (statusColor != null) {
                                {
                                    Icon(
                                        imageVector = Icons.Filled.Circle,
                                        contentDescription = null,
                                        tint = statusColor,
                                        modifier = Modifier.size(8.dp),
                                    )
                                }
                            } else {
                                null
                            },
                            modifier = Modifier.testTag("case-status-${status.value}"),
                        )
                    }
                }
            }

            // Content area
            when {
                uiState.isLoadingRecords && uiState.records.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .size(48.dp)
                                .testTag("cases-loading"),
                        )
                    }
                }

                uiState.recordsError != null && uiState.records.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(32.dp),
                        ) {
                            Text(
                                text = uiState.recordsError ?: "Error",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.testTag("cases-error"),
                            )
                        }
                    }
                }

                uiState.records.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier
                                .padding(32.dp)
                                .testTag("case-empty-state"),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Folder,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                                modifier = Modifier.size(64.dp),
                            )
                            Spacer(Modifier.height(16.dp))
                            Text(
                                text = "No Cases",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "Cases will appear here when created",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            )
                        }
                    }
                }

                else -> {
                    PullToRefreshBox(
                        isRefreshing = uiState.isRefreshingRecords,
                        onRefresh = { viewModel.refresh() },
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(horizontal = 16.dp, vertical = 8.dp)
                                .testTag("case-list"),
                        ) {
                            items(
                                items = uiState.records,
                                key = { it.id },
                            ) { record ->
                                CaseCard(
                                    record = record,
                                    entityType = uiState.entityTypes.find { it.id == record.entityTypeId },
                                    onClick = { onNavigateToCaseDetail(record.id) },
                                    modifier = Modifier.testTag("case-card-${record.id}"),
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
 * A single case card in the list.
 *
 * Shows case number (or ID prefix), status badge with color,
 * entity type badge, and timestamp.
 */
@Composable
private fun CaseCard(
    record: CaseRecord,
    entityType: EntityTypeDefinition?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val statusOption = entityType?.statuses?.find { it.value == record.statusHash }
    val statusLabel = statusOption?.label ?: record.statusHash
    val statusColor = statusOption?.color?.let { parseHexColor(it) }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            // Top row: case number + entity type badge
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                // Case number or ID prefix
                Text(
                    text = record.caseNumber ?: record.id.take(8),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .weight(1f)
                        .testTag("case-card-number-${record.id}"),
                )

                Spacer(Modifier.width(8.dp))

                // Entity type badge
                if (entityType != null) {
                    val typeColor = entityType.color?.let { parseHexColor(it) }
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = (typeColor ?: MaterialTheme.colorScheme.secondaryContainer)
                                .copy(alpha = 0.15f),
                        ),
                    ) {
                        Text(
                            text = entityType.label,
                            style = MaterialTheme.typography.labelSmall,
                            color = typeColor ?: MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))

            // Bottom row: status badge + timestamp
            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                // Status badge
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.testTag("case-card-status-${record.id}"),
                ) {
                    if (statusColor != null) {
                        Icon(
                            imageVector = Icons.Filled.Circle,
                            contentDescription = null,
                            tint = statusColor,
                            modifier = Modifier.size(8.dp),
                        )
                        Spacer(Modifier.width(6.dp))
                    }
                    Text(
                        text = statusLabel,
                        style = MaterialTheme.typography.bodySmall,
                        color = statusColor ?: MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                // Timestamp
                Text(
                    text = DateFormatUtils.formatTimestamp(record.updatedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    modifier = Modifier.testTag("case-card-time-${record.id}"),
                )
            }

            // Assignment and counts row
            if (record.assignedTo.isNotEmpty() || record.interactionCount > 0 || record.contactCount > 0) {
                Spacer(Modifier.height(6.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (record.assignedTo.isNotEmpty()) {
                        Text(
                            text = "${record.assignedTo.size} assigned",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        )
                    }
                    if (record.interactionCount > 0) {
                        Text(
                            text = "${record.interactionCount} interactions",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        )
                    }
                    if (record.contactCount > 0) {
                        Text(
                            text = "${record.contactCount} contacts",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        )
                    }
                }
            }
        }
    }
}

/**
 * Parse a hex color string (#RRGGBB) to a Compose [Color].
 * Returns null if the string is not a valid hex color.
 */
internal fun parseHexColor(hex: String): Color? {
    return try {
        val sanitized = hex.removePrefix("#")
        if (sanitized.length != 6) return null
        val colorLong = sanitized.toLong(16) or 0xFF000000
        Color(colorLong.toInt())
    } catch (_: NumberFormatException) {
        null
    }
}
