package org.llamenos.hotline.ui.reports

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import org.llamenos.hotline.util.DateFormatUtils

/**
 * Report detail screen showing metadata, status, linked entities,
 * and action buttons for claiming and closing reports.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportDetailScreen(
    viewModel: ReportsViewModel,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()
    val report = uiState.selectedReport

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.report_detail_title),
                        modifier = Modifier.testTag("report-detail-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.testTag("report-detail-back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.reports_back),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        modifier = modifier,
    ) { paddingValues ->
        if (report == null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = stringResource(R.string.reports_not_found),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("report-not-found"),
                )
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Title
                Text(
                    text = report.metadata?.reportTitle
                        ?: stringResource(R.string.report_untitled),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("report-detail-title-text"),
                )

                // Status and category row
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.testTag("report-detail-badges"),
                ) {
                    // Status chip
                    val statusColor = when (report.status) {
                        "active" -> MaterialTheme.colorScheme.primary
                        "waiting" -> MaterialTheme.colorScheme.tertiary
                        "closed" -> MaterialTheme.colorScheme.outline
                        else -> MaterialTheme.colorScheme.outline
                    }
                    AssistChip(
                        onClick = {},
                        label = {
                            Text(
                                text = report.status.replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.labelSmall,
                            )
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Filled.Circle,
                                contentDescription = null,
                                tint = statusColor,
                                modifier = Modifier.size(8.dp),
                            )
                        },
                        modifier = Modifier.testTag("report-detail-status"),
                    )

                    // Category chip
                    if (report.metadata?.reportCategory != null) {
                        AssistChip(
                            onClick = {},
                            label = {
                                Text(
                                    text = report.metadata.reportCategory,
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            },
                            modifier = Modifier.testTag("report-detail-category"),
                        )
                    }
                }

                // Action buttons
                if (report.status != "closed") {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("report-action-buttons"),
                    ) {
                        // Claim button — visible when report is waiting
                        if (report.status == "waiting") {
                            Button(
                                onClick = { viewModel.claimReport(report.id) },
                                enabled = !uiState.isClaiming,
                                modifier = Modifier
                                    .weight(1f)
                                    .testTag("report-claim-button"),
                            ) {
                                if (uiState.isClaiming) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        strokeWidth = 2.dp,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                    )
                                    Spacer(Modifier.width(8.dp))
                                }
                                Icon(
                                    imageVector = Icons.Filled.CheckCircle,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(stringResource(R.string.report_claim))
                            }
                        }

                        // Close button — visible when report is active
                        if (report.status == "active") {
                            OutlinedButton(
                                onClick = { viewModel.closeReport(report.id) },
                                enabled = !uiState.isClosing,
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = MaterialTheme.colorScheme.error,
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .testTag("report-close-button"),
                            ) {
                                if (uiState.isClosing) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(16.dp),
                                        strokeWidth = 2.dp,
                                    )
                                    Spacer(Modifier.width(8.dp))
                                }
                                Icon(
                                    imageVector = Icons.Filled.Close,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(stringResource(R.string.report_close))
                            }
                        }
                    }
                }

                // Error card for action failures
                if (uiState.actionError != null) {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("report-action-error"),
                    ) {
                        Text(
                            text = uiState.actionError ?: "",
                            modifier = Modifier.padding(12.dp),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }

                HorizontalDivider()

                // Metadata card
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("report-metadata-card"),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        // Created date
                        MetadataRow(
                            label = stringResource(R.string.reports_created),
                            value = DateFormatUtils.formatDateVerbose(report.createdAt),
                            testTag = "report-detail-created",
                        )

                        // Updated date
                        if (report.updatedAt != null) {
                            MetadataRow(
                                label = stringResource(R.string.reports_updated),
                                value = DateFormatUtils.formatDateVerbose(report.updatedAt),
                                testTag = "report-detail-updated",
                            )
                        }

                        // Message count
                        MetadataRow(
                            label = stringResource(R.string.reports_messages),
                            value = report.messageCount.toString(),
                            testTag = "report-detail-messages",
                        )

                        // Assigned volunteer
                        if (report.assignedTo != null) {
                            MetadataRow(
                                label = stringResource(R.string.reports_assigned),
                                value = report.assignedTo.take(8) + "..." + report.assignedTo.takeLast(8),
                                testTag = "report-detail-assigned",
                            )
                        }

                        // Linked call
                        if (report.metadata?.linkedCallId != null) {
                            Spacer(Modifier.height(4.dp))
                            AssistChip(
                                onClick = {},
                                label = {
                                    Text(
                                        stringResource(
                                            R.string.reports_linked_call,
                                            report.metadata.linkedCallId.take(8),
                                        ),
                                    )
                                },
                                leadingIcon = {
                                    Icon(
                                        imageVector = Icons.Filled.Phone,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                    )
                                },
                                modifier = Modifier.testTag("report-detail-call-chip"),
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * A label–value row for the metadata card.
 */
@Composable
private fun MetadataRow(
    label: String,
    value: String,
    testTag: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.weight(1f))
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.testTag(testTag),
        )
    }
}
