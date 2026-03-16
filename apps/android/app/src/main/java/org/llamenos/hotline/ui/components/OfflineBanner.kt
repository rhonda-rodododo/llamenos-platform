package org.llamenos.hotline.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import org.llamenos.hotline.api.NetworkMonitor
import org.llamenos.hotline.service.OfflineQueue

/**
 * Animated banner that appears at the top of the screen when the device is offline
 * or there are queued operations waiting to sync.
 *
 * Shows:
 * - "No internet connection" when offline
 * - "X operations waiting to sync" when the offline queue has pending items
 * - A spinning indicator during active replay
 *
 * Automatically observes [NetworkMonitor.isOnline] and [OfflineQueue.pendingCount].
 */
@Composable
fun OfflineBanner(
    networkMonitor: NetworkMonitor,
    offlineQueue: OfflineQueue? = null,
) {
    val isOnline by networkMonitor.isOnline.collectAsState()
    val pending = offlineQueue?.pendingCount?.collectAsState()?.value ?: 0
    val replaying = offlineQueue?.isReplaying?.collectAsState()?.value ?: false

    val showBanner = !isOnline || pending > 0

    AnimatedVisibility(
        visible = showBanner,
        enter = expandVertically(),
        exit = shrinkVertically(),
        modifier = Modifier.testTag("offline-banner"),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.error)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (!isOnline) {
                Text(
                    text = stringResource(R.string.no_internet),
                    color = MaterialTheme.colorScheme.onError,
                    style = MaterialTheme.typography.labelMedium,
                )
            }

            if (pending > 0) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (replaying) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(14.dp),
                            color = MaterialTheme.colorScheme.onError,
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.width(6.dp))
                    }

                    Text(
                        text = stringResource(
                            if (pending == 1) R.string.offline_pending_sync_message_one
                            else R.string.offline_pending_sync_message,
                            pending,
                        ),
                        color = MaterialTheme.colorScheme.onError,
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.testTag("offline-pending-count"),
                    )
                }
            }
        }
    }
}
