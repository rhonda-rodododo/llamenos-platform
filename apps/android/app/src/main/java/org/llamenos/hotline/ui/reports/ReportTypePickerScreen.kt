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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Feedback
import androidx.compose.material.icons.filled.Report
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import org.llamenos.hotline.model.ReportTypeDefinition

/**
 * Report type picker screen.
 *
 * Shows mobile-optimized report types as Material 3 cards with icon, label,
 * and description. Tapping a type navigates to the typed report form.
 * Falls back to the legacy report creation screen if no types are available.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportTypePickerScreen(
    viewModel: ReportsViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToTypedReport: (reportTypeId: String) -> Unit,
    onNavigateToLegacyReport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.report_type_picker_title),
                        modifier = Modifier.testTag("report-type-picker-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.testTag("report-type-picker-back"),
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
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            when {
                uiState.isLoadingReportTypes -> {
                    // Loading state
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("report-type-picker-loading"),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            CircularProgressIndicator()
                            Text(
                                text = stringResource(R.string.report_type_picker_loading),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                uiState.mobileReportTypes.isEmpty() -> {
                    // No types available — show empty state
                    org.llamenos.hotline.ui.components.EmptyState(
                        icon = Icons.AutoMirrored.Filled.Assignment,
                        title = stringResource(R.string.reports_no_types),
                        subtitle = stringResource(R.string.report_type_picker_empty),
                        testTag = "report-type-picker-empty",
                        modifier = Modifier.fillMaxSize(),
                    )
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("report-type-picker-list"),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        // Subtitle
                        item {
                            Text(
                                text = stringResource(R.string.report_type_picker_subtitle),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .padding(bottom = 4.dp)
                                    .testTag("report-type-picker-subtitle"),
                            )
                        }

                        items(
                            items = uiState.mobileReportTypes,
                            key = { it.id },
                        ) { reportType ->
                            ReportTypeCard(
                                reportType = reportType,
                                onClick = {
                                    viewModel.selectReportType(reportType)
                                    onNavigateToTypedReport(reportType.id)
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Card displaying a single report type with icon, label, and description.
 */
@Composable
private fun ReportTypeCard(
    reportType: ReportTypeDefinition,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val icon = resolveReportTypeIcon(reportType.icon)
    val tintColor = resolveReportTypeColor(reportType.color)

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag("report-type-card-${reportType.id}"),
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
            // Icon
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tintColor ?: MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .size(40.dp)
                    .testTag("report-type-icon"),
            )

            Spacer(Modifier.width(16.dp))

            // Text content
            Column(
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    text = reportType.label,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.testTag("report-type-label"),
                )

                if (reportType.description.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = reportType.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.testTag("report-type-description"),
                    )
                }

                // Field count indicator
                if (reportType.fields.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "${reportType.fields.size} field${if (reportType.fields.size != 1) "s" else ""}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier.testTag("report-type-field-count"),
                    )
                }
            }
        }
    }
}

/**
 * Resolve a report type icon name to a Material icon vector.
 *
 * Maps common icon names from the CMS admin to Material Icons.
 * Falls back to [Icons.Filled.Description] for unknown names.
 */
internal fun resolveReportTypeIcon(iconName: String?): ImageVector {
    return when (iconName?.lowercase()) {
        "warning", "alert", "alert-triangle" -> Icons.Filled.Warning
        "bug", "bug-report" -> Icons.Filled.BugReport
        "feedback" -> Icons.Filled.Feedback
        "report", "flag" -> Icons.Filled.Report
        "shield", "security" -> Icons.Filled.Shield
        "phone", "call" -> Icons.Filled.Phone
        "health", "medical", "health-and-safety" -> Icons.Filled.HealthAndSafety
        "assignment", "document" -> Icons.AutoMirrored.Filled.Assignment
        else -> Icons.Filled.Description
    }
}

/**
 * Parse a CSS-style hex color string to a Compose [Color].
 *
 * Supports "#RRGGBB" and "#AARRGGBB" formats. Returns null for
 * unrecognizable strings, letting the caller fall back to a theme color.
 */
internal fun resolveReportTypeColor(colorString: String?): Color? {
    if (colorString == null) return null
    val hex = colorString.removePrefix("#")
    return try {
        when (hex.length) {
            6 -> Color(("FF$hex").toLong(16))
            8 -> Color(hex.toLong(16))
            else -> null
        }
    } catch (_: NumberFormatException) {
        null
    }
}
