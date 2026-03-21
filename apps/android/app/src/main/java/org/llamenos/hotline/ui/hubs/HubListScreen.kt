package org.llamenos.hotline.ui.hubs

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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
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
import org.llamenos.hotline.model.Hub
import org.llamenos.hotline.ui.components.EmptyState
import org.llamenos.hotline.util.DateFormatUtils

/**
 * Hub list screen showing all hubs with status indicators.
 *
 * Displays a list of hubs from GET /api/hubs. The currently active hub
 * is highlighted with a check icon. Tapping a hub switches the active
 * hub context. A FAB allows admins to create new hubs.
 *
 * @param viewModel Hilt-injected ViewModel for hub management state
 * @param onNavigateBack Callback to navigate to the previous screen
 * @param onNavigateToCreateHub Callback to navigate to the create hub screen
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HubListScreen(
    viewModel: HubManagementViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToCreateHub: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()
    val activeHubId by viewModel.activeHubId.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.hubs_title),
                        modifier = Modifier.testTag("hubs-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.testTag("hubs-back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.common_back),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ),
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onNavigateToCreateHub,
                modifier = Modifier.testTag("hub-create-fab"),
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = stringResource(R.string.hubs_create_hub),
                )
            }
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
            when {
                uiState.isLoading && uiState.hubs.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("hubs-loading"),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }

                uiState.error != null && uiState.hubs.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        org.llamenos.hotline.ui.components.ErrorCard(
                            error = uiState.error ?: "",
                            onDismiss = { viewModel.dismissError() },
                            onRetry = { viewModel.loadHubs() },
                            testTag = "hubs-error",
                        )
                    }
                }

                uiState.hubs.isEmpty() && !uiState.isLoading -> {
                    EmptyState(
                        icon = Icons.Filled.Business,
                        title = stringResource(R.string.hubs_no_hubs),
                        testTag = "hubs-empty",
                        modifier = Modifier.fillMaxSize(),
                    )
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("hubs-list"),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(
                            horizontal = 16.dp,
                            vertical = 8.dp,
                        ),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(
                            items = uiState.hubs,
                            key = { it.id },
                        ) { hub ->
                            HubCard(
                                hub = hub,
                                isActive = hub.id == activeHubId,
                                onClick = { viewModel.switchHub(hub) },
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Card displaying a single hub with status indicator, name, slug,
 * description, phone number, and active state.
 */
@Composable
private fun HubCard(
    hub: Hub,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val statusColor = when (hub.status) {
        "active" -> MaterialTheme.colorScheme.primary
        "suspended" -> MaterialTheme.colorScheme.tertiary
        "archived" -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag("hub-card-${hub.id}"),
        colors = CardDefaults.cardColors(
            containerColor = if (isActive) {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
        ),
        elevation = CardDefaults.elevatedCardElevation(
            defaultElevation = if (isActive) 4.dp else 1.dp,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            // Top row: icon + name + active indicator
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(
                    imageVector = Icons.Filled.Business,
                    contentDescription = null,
                    tint = if (isActive) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier.size(24.dp),
                )

                Spacer(Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = hub.name,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.testTag("hub-name"),
                    )
                    Text(
                        text = "/${hub.slug}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        modifier = Modifier.testTag("hub-slug"),
                    )
                }

                if (isActive) {
                    Icon(
                        imageVector = Icons.Filled.CheckCircle,
                        contentDescription = stringResource(R.string.hubs_select_hub),
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .size(20.dp)
                            .testTag("hub-active-indicator"),
                    )
                }
            }

            // Description
            if (!hub.description.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = hub.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.testTag("hub-description"),
                )
            }

            Spacer(Modifier.height(8.dp))

            // Bottom row: status + phone + date
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Status indicator
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Circle,
                        contentDescription = null,
                        tint = statusColor,
                        modifier = Modifier.size(8.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = hub.status.replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelSmall,
                        color = statusColor,
                        modifier = Modifier.testTag("hub-status"),
                    )
                }

                // Phone number
                if (!hub.phoneNumber.isNullOrBlank()) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Phone,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            modifier = Modifier.size(12.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = hub.phoneNumber,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            modifier = Modifier.testTag("hub-phone"),
                        )
                    }
                }

                Spacer(Modifier.weight(1f))

                // Date
                if (hub.createdAt.isNotBlank()) {
                    Text(
                        text = DateFormatUtils.formatDate(hub.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                        modifier = Modifier.testTag("hub-date"),
                    )
                }
            }
        }
    }
}
