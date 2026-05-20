package org.llamenos.hotline.ui.hubsettings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import org.llamenos.protocol.HubQuota
import org.llamenos.protocol.HubUsage

/**
 * Card displaying current month usage statistics with progress bars against quotas.
 */
@Composable
fun HubUsageCard(
    usage: HubUsage?,
    quotas: HubQuota?,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("hub-usage-card"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
        ) {
            Text(
                text = stringResource(R.string.hub_onboarding_usage_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.testTag("hub-usage-title"),
            )

            Spacer(modifier = Modifier.height(12.dp))

            if (usage == null) {
                Text(
                    text = "--",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                UsageRow(
                    label = stringResource(R.string.hub_onboarding_usage_calls),
                    current = usage.callsReceived,
                    max = quotas?.maxCallsPerMonth,
                    testTag = "hub-usage-calls",
                )

                Spacer(modifier = Modifier.height(8.dp))

                UsageRow(
                    label = stringResource(R.string.hub_onboarding_usage_sms),
                    current = usage.smsSent,
                    max = quotas?.maxSMSPerMonth,
                    testTag = "hub-usage-sms",
                )

                Spacer(modifier = Modifier.height(8.dp))

                UsageRow(
                    label = stringResource(R.string.hub_onboarding_usage_signal),
                    current = usage.signalMessagesSent,
                    max = quotas?.maxSignalMessagesPerMonth,
                    testTag = "hub-usage-signal",
                )

                Spacer(modifier = Modifier.height(8.dp))

                UsageRow(
                    label = stringResource(R.string.hub_onboarding_usage_whats_app),
                    current = usage.whatsAppMessagesSent,
                    max = quotas?.maxWhatsAppMessagesPerMonth,
                    testTag = "hub-usage-whatsapp",
                )
            }
        }
    }
}

@Composable
private fun UsageRow(
    label: String,
    current: Int,
    max: Int?,
    testTag: String,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .testTag(testTag),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = if (max != null) "$current / $max" else "$current",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (max != null && max > 0) {
            LinearProgressIndicator(
                progress = { (current.toFloat() / max.toFloat()).coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
                color = if (current > max) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.primary
                },
                trackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
            )
        }
    }
}
