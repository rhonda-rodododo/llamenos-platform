package org.llamenos.hotline.ui.admin

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R

@Composable
fun RetentionSettingsTab(
    viewModel: AdminViewModel,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        Text(
            text = stringResource(R.string.retention_description),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(16.dp))

        if (uiState.isLoadingRetention && uiState.retentionCategories.isEmpty()) {
            CircularProgressIndicator(
                modifier = Modifier.testTag("retention-loading"),
            )
        } else {
            uiState.retentionCategories.forEach { category ->
                RetentionCategoryCard(
                    categoryName = category.category,
                    retentionDays = category.retentionDays,
                    minRetentionDays = category.minRetentionDays,
                    onDaysChange = { days ->
                        viewModel.updateRetentionDays(category.category, days)
                    },
                )
                Spacer(Modifier.height(12.dp))
            }

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = { viewModel.saveRetentionSettings() },
                enabled = !uiState.isSavingRetention,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("save-retention-button"),
            ) {
                Text(stringResource(R.string.retention_saved))
            }

            if (uiState.retentionError != null) {
                Spacer(Modifier.height(12.dp))
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("retention-error"),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                    ),
                ) {
                    Text(
                        text = uiState.retentionError ?: "",
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }
        }
    }
}

@Composable
private fun RetentionCategoryCard(
    categoryName: String,
    retentionDays: Int?,
    minRetentionDays: Int?,
    onDaysChange: (Int?) -> Unit,
    modifier: Modifier = Modifier,
) {
    var isEnabled by remember { mutableStateOf(retentionDays != null) }
    var daysText by remember { mutableStateOf(retentionDays?.toString() ?: "") }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("retention-category-$categoryName"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            val displayName = when (categoryName) {
                "call_records" -> stringResource(R.string.retention_category_call_records)
                "notes" -> stringResource(R.string.retention_category_notes)
                "messages" -> stringResource(R.string.retention_category_messages)
                "audit_log" -> stringResource(R.string.retention_category_audit_log)
                else -> categoryName
            }

            Text(
                text = displayName,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )

            Spacer(Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.retention_enable_purge),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                Switch(
                    checked = isEnabled,
                    onCheckedChange = { enabled ->
                        isEnabled = enabled
                        if (enabled) {
                            val defaultDays = minRetentionDays ?: 90
                            daysText = defaultDays.toString()
                            onDaysChange(defaultDays)
                        } else {
                            daysText = ""
                            onDaysChange(null)
                        }
                    },
                )
            }

            if (isEnabled) {
                Spacer(Modifier.height(8.dp))

                OutlinedTextField(
                    value = daysText,
                    onValueChange = { text ->
                        daysText = text
                        val days = text.toIntOrNull()
                        if (days != null) {
                            val clamped = maxOf(days, minRetentionDays ?: 30)
                            onDaysChange(clamped)
                        }
                    },
                    label = { Text(stringResource(R.string.retention_retention_days)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("retention-days-$categoryName"),
                )

                if (minRetentionDays != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = stringResource(R.string.retention_min_days, minRetentionDays),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.tertiary,
                    )
                }
            }
        }
    }
}
