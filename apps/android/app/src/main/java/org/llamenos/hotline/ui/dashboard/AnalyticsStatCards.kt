package org.llamenos.hotline.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
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

/**
 * Dashboard analytics stat cards showing calls today, answer rate, and avg duration.
 *
 * Shows a row of three cards pulled from the user's personal analytics stats.
 * Answer rate is color-coded: green (>80%), yellow (>50%), red (≤50%).
 */
@Composable
fun AnalyticsStatCards(
    callsToday: Int,
    answerRate: Float?,
    avgDurationSeconds: Int?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .testTag("analytics-stat-cards"),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StatCard(
            label = stringResource(R.string.analytics_personal_calls_today),
            value = callsToday.toString(),
            valueColor = MaterialTheme.colorScheme.primary,
            testTag = "stat-calls-today",
            modifier = Modifier.weight(1f),
        )

        if (answerRate != null) {
            val rateColor = when {
                answerRate > 0.8f -> Color(0xFF2E7D32) // green-800
                answerRate > 0.5f -> Color(0xFFF57F17) // amber-900
                else -> MaterialTheme.colorScheme.error
            }
            StatCard(
                label = stringResource(R.string.analytics_summary_answer_rate),
                value = "${(answerRate * 100).toInt()}%",
                valueColor = rateColor,
                testTag = "stat-answer-rate",
                modifier = Modifier.weight(1f),
            )
        }

        if (avgDurationSeconds != null) {
            val mins = avgDurationSeconds / 60
            val secs = avgDurationSeconds % 60
            val formatted = if (mins > 0) "${mins}m ${secs}s" else "${secs}s"
            StatCard(
                label = stringResource(R.string.analytics_personal_avg_duration),
                value = formatted,
                valueColor = MaterialTheme.colorScheme.onSurface,
                testTag = "stat-avg-duration",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun StatCard(
    label: String,
    value: String,
    valueColor: Color,
    testTag: String,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(
        modifier = modifier.testTag(testTag),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
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
