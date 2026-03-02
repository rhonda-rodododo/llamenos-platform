package org.llamenos.hotline.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import org.llamenos.hotline.R
import org.llamenos.hotline.api.NetworkMonitor

/**
 * Animated banner that appears at the top of the screen when the device is offline.
 * Automatically observes [NetworkMonitor.isOnline] state flow.
 */
@Composable
fun OfflineBanner(networkMonitor: NetworkMonitor) {
    val isOnline by networkMonitor.isOnline.collectAsState()

    AnimatedVisibility(
        visible = !isOnline,
        enter = expandVertically(),
        exit = shrinkVertically(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.error)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.no_internet),
                color = MaterialTheme.colorScheme.onError,
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}
