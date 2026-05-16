package org.llamenos.hotline.ui.analytics

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import org.llamenos.protocol.UserStatsResponseUser

/**
 * Per-user activity list with sortable headers.
 * Shows name, calls answered, avg duration, and notes created per volunteer.
 */
@Composable
fun UserActivityList(
    users: List<UserStatsResponseUser>,
    sortField: UserSortField,
    onSortChange: (UserSortField) -> Unit,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(
        modifier = modifier
            .fillMaxWidth()
            .testTag("analytics-user-activity"),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            Text(
                text = stringResource(R.string.analytics_users_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )

            Spacer(Modifier.height(8.dp))

            // Sort chips
            Row(modifier = Modifier.testTag("analytics-user-sort-chips")) {
                SortChip(
                    label = stringResource(R.string.analytics_users_calls_answered),
                    selected = sortField == UserSortField.CALLS,
                    onClick = { onSortChange(UserSortField.CALLS) },
                    testTag = "sort-chip-calls",
                )
                Spacer(Modifier.width(8.dp))
                SortChip(
                    label = stringResource(R.string.analytics_users_avg_duration),
                    selected = sortField == UserSortField.DURATION,
                    onClick = { onSortChange(UserSortField.DURATION) },
                    testTag = "sort-chip-duration",
                )
                Spacer(Modifier.width(8.dp))
                SortChip(
                    label = stringResource(R.string.analytics_users_notes_created),
                    selected = sortField == UserSortField.NOTES,
                    onClick = { onSortChange(UserSortField.NOTES) },
                    testTag = "sort-chip-notes",
                )
            }

            Spacer(Modifier.height(8.dp))

            if (users.isEmpty()) {
                Text(
                    text = stringResource(R.string.analytics_users_no_data),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("analytics-user-empty"),
                )
            } else {
                // Header row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                ) {
                    Text(
                        text = stringResource(R.string.analytics_users_name),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(2f),
                    )
                    Text(
                        text = stringResource(R.string.analytics_users_calls_answered),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = stringResource(R.string.analytics_users_avg_duration),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = stringResource(R.string.analytics_users_notes_created),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                }

                HorizontalDivider()

                users.forEachIndexed { idx, user ->
                    UserRow(user = user, modifier = Modifier.testTag("analytics-user-row-$idx"))
                    if (idx < users.lastIndex) HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun UserRow(
    user: UserStatsResponseUser,
    modifier: Modifier = Modifier,
) {
    val avgSecs = user.avgDurationSeconds.toInt()
    val mins = avgSecs / 60
    val secs = avgSecs % 60
    val durationStr = if (mins > 0) "${mins}m ${secs}s" else "${secs}s"

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = user.displayName ?: user.pubkey.take(8) + "…",
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(2f),
        )
        Text(
            text = user.callsAnswered.toString(),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = durationStr,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = user.notesCreated.toString(),
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun SortChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    testTag: String,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
        modifier = Modifier.testTag(testTag),
    )
}
