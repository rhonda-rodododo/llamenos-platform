package org.llamenos.hotline.ui.hubsettings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import org.llamenos.protocol.ProviderTemplate

/**
 * Material 3 card list showing available provider templates.
 *
 * Each template card shows:
 * - Name and description
 * - Provider type
 * - Default channels as chips
 * - "Recommended" badge if applicable
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProviderTemplateList(
    templates: List<ProviderTemplate>,
    isLoading: Boolean,
    onSelectTemplate: (ProviderTemplate) -> Unit,
    onStartFromScratch: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .testTag("provider-template-list"),
    ) {
        Text(
            text = stringResource(R.string.hub_onboarding_select_template_title),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.testTag("template-list-title"),
        )

        Text(
            text = stringResource(R.string.hub_onboarding_select_template_description),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
        )

        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else {
            templates.forEach { template ->
                TemplateCard(
                    template = template,
                    onClick = { onSelectTemplate(template) },
                )
                Spacer(modifier = Modifier.height(8.dp))
            }

            // Start from scratch option
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onStartFromScratch)
                    .testTag("template-from-scratch"),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = stringResource(R.string.hub_onboarding_start_from_scratch),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        text = stringResource(R.string.hub_onboarding_start_from_scratch_description),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TemplateCard(
    template: ProviderTemplate,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag("template-card-${template.slug}"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = template.name,
                style = MaterialTheme.typography.titleSmall,
            )

            template.description?.let { desc ->
                Text(
                    text = desc,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Provider type
            Text(
                text = stringResource(
                    R.string.hub_onboarding_template_provider,
                    template.providerType.value.replaceFirstChar { it.uppercase() },
                ),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Default channels as chips
            if (template.defaultChannels.isNotEmpty()) {
                FlowRow(
                    modifier = Modifier.padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    template.defaultChannels.forEach { channel ->
                        AssistChip(
                            onClick = {},
                            label = {
                                Text(
                                    text = channel.value.replaceFirstChar { it.uppercase() },
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            },
                        )
                    }
                }
            }

            // Sub-account badge
            if (template.allowSubAccounts) {
                Text(
                    text = stringResource(R.string.hub_onboarding_sub_account_enabled),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}
