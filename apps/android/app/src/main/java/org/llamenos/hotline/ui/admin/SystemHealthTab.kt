package org.llamenos.hotline.ui.admin

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import org.llamenos.hotline.R
import org.llamenos.hotline.model.BackupInfo
import org.llamenos.hotline.model.CallMetrics
import org.llamenos.hotline.model.ServerHealth
import org.llamenos.hotline.model.ServiceStatus
import org.llamenos.hotline.model.StorageInfo
import org.llamenos.hotline.model.SystemHealth
import org.llamenos.hotline.model.UserInfo

/**
 * System health dashboard tab showing server status, services, call metrics,
 * storage, backup info, and volunteer activity.
 *
 * Auto-refreshes every 30 seconds while the tab is visible.
 */
@Composable
fun SystemHealthTab(
    viewModel: AdminViewModel,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()

    // Auto-refresh every 30 seconds
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000L)
            viewModel.loadSystemHealth()
        }
    }

    when {
        uiState.isLoadingHealth && uiState.systemHealth == null -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .testTag("system-health-loading"),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }

        uiState.healthError != null && uiState.systemHealth == null -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .padding(32.dp)
                    .testTag("system-health-error"),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = uiState.healthError ?: "",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(Modifier.height(16.dp))
                    IconButton(
                        onClick = { viewModel.loadSystemHealth() },
                        modifier = Modifier.testTag("system-health-retry"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = stringResource(R.string.action_retry),
                        )
                    }
                }
            }
        }

        else -> {
            val health = uiState.systemHealth
            Column(
                modifier = modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Header with refresh button
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = stringResource(R.string.admin_system_health),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    IconButton(
                        onClick = { viewModel.loadSystemHealth() },
                        modifier = Modifier.testTag("system-health-refresh"),
                    ) {
                        if (uiState.isLoadingHealth) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp))
                        } else {
                            Icon(
                                imageVector = Icons.Filled.Refresh,
                                contentDescription = stringResource(R.string.action_refresh),
                            )
                        }
                    }
                }

                if (health != null) {
                    // Server card
                    ServerHealthCard(health.server)

                    // Services card
                    ServicesCard(health.services)

                    // Calls card
                    CallMetricsCard(health.calls)

                    // Storage card
                    StorageCard(health.storage)

                    // Backup card
                    BackupCard(health.backup)

                    // Volunteers card
                    VolunteerActivityCard(health.volunteers)

                    // Timestamp
                    Text(
                        text = stringResource(R.string.admin_system_last_updated, health.timestamp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.testTag("system-health-timestamp"),
                    )
                }

                if (uiState.healthError != null) {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("system-health-inline-error"),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                    ) {
                        Text(
                            text = uiState.healthError ?: "",
                            modifier = Modifier.padding(16.dp),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                    }
                }
            }
        }
    }
}

// ---- Health Cards ----

@Composable
private fun ServerHealthCard(
    server: ServerHealth,
    modifier: Modifier = Modifier,
) {
    HealthCard(
        icon = Icons.Filled.Cloud,
        title = stringResource(R.string.admin_system_server),
        testTag = "health-server-card",
        modifier = modifier,
    ) {
        StatusBadge(status = server.status)
        Spacer(Modifier.height(8.dp))
        HealthMetricRow(
            label = stringResource(R.string.admin_system_uptime),
            value = formatUptime(server.uptime),
        )
        HealthMetricRow(
            label = stringResource(R.string.admin_system_version),
            value = server.version,
        )
    }
}

@Composable
private fun ServicesCard(
    services: List<ServiceStatus>,
    modifier: Modifier = Modifier,
) {
    HealthCard(
        icon = Icons.Filled.Settings,
        title = stringResource(R.string.admin_system_services),
        testTag = "health-services-card",
        modifier = modifier,
    ) {
        services.forEachIndexed { index, service ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("health-service-${service.name}"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = service.name,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                    if (service.details != null) {
                        Text(
                            text = service.details,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                StatusBadge(status = service.status)
            }
            if (index < services.lastIndex) {
                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            }
        }
    }
}

@Composable
private fun CallMetricsCard(
    calls: CallMetrics,
    modifier: Modifier = Modifier,
) {
    HealthCard(
        icon = Icons.Filled.Call,
        title = stringResource(R.string.admin_system_calls),
        testTag = "health-calls-card",
        modifier = modifier,
    ) {
        HealthMetricRow(
            label = stringResource(R.string.admin_system_calls_today),
            value = calls.today.toString(),
        )
        HealthMetricRow(
            label = stringResource(R.string.admin_system_active_calls),
            value = calls.active.toString(),
        )
        HealthMetricRow(
            label = stringResource(R.string.admin_system_avg_response),
            value = stringResource(R.string.admin_seconds_unit, calls.avgResponseSeconds),
        )
        HealthMetricRow(
            label = stringResource(R.string.admin_system_missed_calls),
            value = calls.missed.toString(),
        )
    }
}

@Composable
private fun StorageCard(
    storage: StorageInfo,
    modifier: Modifier = Modifier,
) {
    HealthCard(
        icon = Icons.Filled.Storage,
        title = stringResource(R.string.admin_system_storage),
        testTag = "health-storage-card",
        modifier = modifier,
    ) {
        HealthMetricRow(
            label = stringResource(R.string.admin_system_db_size),
            value = storage.dbSize,
        )
        HealthMetricRow(
            label = stringResource(R.string.admin_system_blob_storage),
            value = storage.blobStorage,
        )
    }
}

@Composable
private fun BackupCard(
    backup: BackupInfo,
    modifier: Modifier = Modifier,
) {
    HealthCard(
        icon = Icons.Filled.History,
        title = stringResource(R.string.admin_system_backup),
        testTag = "health-backup-card",
        modifier = modifier,
    ) {
        HealthMetricRow(
            label = stringResource(R.string.admin_system_last_backup),
            value = backup.lastBackup ?: stringResource(R.string.admin_system_never),
        )
        HealthMetricRow(
            label = stringResource(R.string.admin_system_backup_size),
            value = backup.backupSize,
        )
        HealthMetricRow(
            label = stringResource(R.string.admin_system_last_verify),
            value = backup.lastVerify ?: stringResource(R.string.admin_system_never),
        )
    }
}

@Composable
private fun VolunteerActivityCard(
    volunteers: UserInfo,
    modifier: Modifier = Modifier,
) {
    HealthCard(
        icon = Icons.Filled.Group,
        title = stringResource(R.string.admin_system_users),
        testTag = "health-volunteers-card",
        modifier = modifier,
    ) {
        HealthMetricRow(
            label = stringResource(R.string.admin_system_total_active),
            value = volunteers.totalActive.toString(),
        )
        HealthMetricRow(
            label = stringResource(R.string.admin_system_online_now),
            value = volunteers.onlineNow.toString(),
        )
        HealthMetricRow(
            label = stringResource(R.string.admin_system_on_shift),
            value = volunteers.onShift.toString(),
        )
        HealthMetricRow(
            label = stringResource(R.string.admin_system_shift_coverage),
            value = "${volunteers.shiftCoverage}%",
        )
    }
}

// ---- Shared Components ----

@Composable
private fun HealthCard(
    icon: ImageVector,
    title: String,
    testTag: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag(testTag),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun HealthMetricRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun StatusBadge(
    status: String,
    modifier: Modifier = Modifier,
) {
    val color = when (status.lowercase()) {
        "healthy", "ok", "up", "online", "running" -> Color(0xFF4CAF50) // Green
        "degraded", "warning", "slow" -> Color(0xFFFF9800) // Orange
        "down", "error", "offline", "critical" -> Color(0xFFF44336) // Red
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.15f)),
        modifier = modifier,
    ) {
        Text(
            text = status.replaceFirstChar { it.uppercase() },
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = color,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

/**
 * Format uptime seconds into a human-readable string like "2d 5h 30m".
 */
private fun formatUptime(seconds: Int): String {
    val days = seconds / 86400
    val hours = (seconds % 86400) / 3600
    val minutes = (seconds % 3600) / 60

    return buildString {
        if (days > 0) append("${days}d ")
        if (hours > 0) append("${hours}h ")
        append("${minutes}m")
    }.trim()
}
