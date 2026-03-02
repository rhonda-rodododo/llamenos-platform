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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Login
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.ManageAccounts
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import org.llamenos.hotline.model.AuditEntry

/**
 * Audit log tab in the admin panel.
 *
 * Displays a hash-chained, paginated audit log of all system actions.
 * Includes a search bar and event type filter dropdown.
 * Each entry shows the action type icon, actor pubkey (truncated),
 * optional details, and timestamp. The list supports infinite scrolling.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuditLogTab(
    viewModel: AdminViewModel,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()

    // Paginate when reaching the end of the list
    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisibleItem = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisibleItem >= uiState.auditEntries.size - 5 &&
                    uiState.hasMoreAuditPages &&
                    !uiState.isLoadingAudit
        }
    }

    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) {
            viewModel.loadNextAuditPage()
        }
    }

    val eventTypes = listOf("all", "login", "logout", "call", "note", "shift", "ban", "settings", "invite")
    var filterExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = modifier.fillMaxSize(),
    ) {
        // Filter bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .testTag("audit-filter-bar"),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Search field
            OutlinedTextField(
                value = uiState.auditSearchQuery,
                onValueChange = { viewModel.setAuditSearchQuery(it) },
                placeholder = { Text(stringResource(R.string.audit_search)) },
                leadingIcon = {
                    Icon(Icons.Filled.Search, contentDescription = null)
                },
                singleLine = true,
                modifier = Modifier
                    .weight(1f)
                    .testTag("audit-search-input"),
            )

            // Event type filter
            ExposedDropdownMenuBox(
                expanded = filterExpanded,
                onExpandedChange = { filterExpanded = it },
                modifier = Modifier.width(140.dp),
            ) {
                OutlinedTextField(
                    value = if (uiState.auditEventFilter == "all") {
                        stringResource(R.string.audit_all_events)
                    } else {
                        uiState.auditEventFilter.replaceFirstChar { it.uppercase() }
                    },
                    onValueChange = {},
                    readOnly = true,
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = filterExpanded) },
                    singleLine = true,
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        .testTag("audit-event-filter"),
                )
                ExposedDropdownMenu(
                    expanded = filterExpanded,
                    onDismissRequest = { filterExpanded = false },
                ) {
                    eventTypes.forEach { eventType ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    if (eventType == "all") stringResource(R.string.audit_all_events)
                                    else eventType.replaceFirstChar { it.uppercase() },
                                )
                            },
                            onClick = {
                                viewModel.setAuditEventFilter(eventType)
                                filterExpanded = false
                            },
                        )
                    }
                }
            }

            // Clear filters button
            if (uiState.auditSearchQuery.isNotEmpty() || uiState.auditEventFilter != "all") {
                IconButton(
                    onClick = { viewModel.clearAuditFilters() },
                    modifier = Modifier.testTag("audit-clear-filters"),
                ) {
                    Icon(
                        Icons.Filled.Clear,
                        contentDescription = stringResource(R.string.audit_clear_filters),
                    )
                }
            }
        }

        when {
            uiState.isLoadingAudit && uiState.auditEntries.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("audit-loading"),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }

            uiState.auditEntries.isEmpty() && !uiState.isLoadingAudit -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(32.dp)
                        .testTag("audit-empty"),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.History,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                        )
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = stringResource(R.string.audit_empty),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            else -> {
                LazyColumn(
                    state = listState,
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("audit-list"),
                ) {
                    items(
                        items = uiState.auditEntries,
                        key = { it.id },
                    ) { entry ->
                        AuditEntryCard(entry = entry)
                    }

                    // Loading indicator at the bottom for pagination
                    if (uiState.hasMoreAuditPages) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(24.dp),
                                    strokeWidth = 2.dp,
                                )
                            }
                        }
                    }
                }
            }
        }

        // Error
        if (uiState.auditError != null) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
                    .testTag("audit-error"),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                ),
            ) {
                Text(
                    text = uiState.auditError ?: "",
                    modifier = Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.onErrorContainer,
                )
            }
        }
    }
}

/**
 * Card displaying a single audit log entry.
 */
@Composable
private fun AuditEntryCard(
    entry: AuditEntry,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("audit-entry-${entry.id}"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = actionIcon(entry.action),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )

            Spacer(Modifier.width(10.dp))

            Column(
                modifier = Modifier.weight(1f),
            ) {
                // Action type
                Text(
                    text = formatActionName(entry.action),
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.testTag("audit-action-${entry.id}"),
                )

                // Actor pubkey (truncated)
                Text(
                    text = entry.actorPubkey.take(8) + "..." + entry.actorPubkey.takeLast(8),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.testTag("audit-actor-${entry.id}"),
                )

                // Optional details
                if (entry.details != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = entry.details,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.testTag("audit-details-${entry.id}"),
                    )
                }
            }

            Spacer(Modifier.width(8.dp))

            // Timestamp
            Text(
                text = formatAuditTime(entry.timestamp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                modifier = Modifier.testTag("audit-time-${entry.id}"),
            )
        }
    }
}

/**
 * Map an audit action string to a Material icon.
 */
private fun actionIcon(action: String): ImageVector = when {
    action.contains("login", ignoreCase = true) -> Icons.Filled.Login
    action.contains("logout", ignoreCase = true) -> Icons.Filled.Logout
    action.contains("call", ignoreCase = true) -> Icons.Filled.Phone
    action.contains("note", ignoreCase = true) -> Icons.Filled.Create
    action.contains("shift", ignoreCase = true) -> Icons.Filled.ManageAccounts
    action.contains("ban", ignoreCase = true) -> Icons.Filled.Security
    action.contains("settings", ignoreCase = true) -> Icons.Filled.Settings
    action.contains("invite", ignoreCase = true) -> Icons.Filled.ManageAccounts
    else -> Icons.Filled.History
}

/**
 * Format an action type string to a human-readable label.
 */
private fun formatActionName(action: String): String {
    return action.replace("_", " ").split(" ").joinToString(" ") { word ->
        word.replaceFirstChar { it.uppercase() }
    }
}

/**
 * Format an ISO 8601 date string for audit display.
 */
private fun formatAuditTime(isoDate: String): String {
    return try {
        val parts = isoDate.replace("T", " ").replace("Z", "").split(" ")
        if (parts.size >= 2) {
            val dateParts = parts[0].split("-")
            val time = parts[1].take(5)
            if (dateParts.size == 3) {
                val months = listOf(
                    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
                )
                val monthIndex = dateParts[1].toIntOrNull()?.minus(1) ?: 0
                val month = months.getOrElse(monthIndex) { "???" }
                val day = dateParts[2].toIntOrNull() ?: 0
                "$month $day\n$time"
            } else {
                time
            }
        } else {
            isoDate
        }
    } catch (_: Exception) {
        isoDate
    }
}
