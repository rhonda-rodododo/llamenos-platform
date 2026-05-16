package org.llamenos.hotline.ui.analytics

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import org.llamenos.protocol.CallMetricsResponse

/**
 * Summary KPI row showing total calls, answer rate, avg duration, and total conversations.
 */
@Composable
fun KPIRow(
    callMetrics: CallMetricsResponse,
    totalConversations: Long,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .testTag("analytics-kpi-row"),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        KPICard(
            label = stringResource(R.string.analytics_summary_total_calls),
            value = callMetrics.totalCalls.toLong().toString(),
            testTag = "kpi-total-calls",
            modifier = Modifier.weight(1f),
        )

        val answerRate = callMetrics.answerRate
        val rateColor = when {
            answerRate > 0.8 -> Color(0xFF2E7D32)
            answerRate > 0.5 -> Color(0xFFF57F17)
            else -> MaterialTheme.colorScheme.error
        }
        KPICard(
            label = stringResource(R.string.analytics_summary_answer_rate),
            value = "${(answerRate * 100).toInt()}%",
            valueColor = rateColor,
            testTag = "kpi-answer-rate",
            modifier = Modifier.weight(1f),
        )

        val avgSecs = callMetrics.avgDurationSeconds.toInt()
        val mins = avgSecs / 60
        val secs = avgSecs % 60
        KPICard(
            label = stringResource(R.string.analytics_summary_avg_duration),
            value = if (mins > 0) "${mins}m ${secs}s" else "${secs}s",
            testTag = "kpi-avg-duration",
            modifier = Modifier.weight(1f),
        )

        KPICard(
            label = stringResource(R.string.analytics_summary_total_conversations),
            value = totalConversations.toString(),
            testTag = "kpi-total-conversations",
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
fun KPICard(
    label: String,
    value: String,
    testTag: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MaterialTheme.colorScheme.primary,
) {
    OutlinedCard(
        modifier = modifier.testTag(testTag),
        colors = CardDefaults.outlinedCardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = valueColor,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
