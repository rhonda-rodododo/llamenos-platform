package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.ui.res.stringResource
import org.llamenos.hotline.R

private fun channelIcon(type: ChannelType): ImageVector = when (type) {
    ChannelType.SMS -> Icons.Default.Phone
    ChannelType.WHATSAPP -> Icons.AutoMirrored.Default.Chat
    ChannelType.SIGNAL -> Icons.Default.Security
    ChannelType.TELEGRAM -> Icons.Default.Send
    ChannelType.RCS -> Icons.Default.Smartphone
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChannelConfigListScreen(
    onChannelClick: (ChannelType) -> Unit,
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(Unit) { viewModel.loadConfig() }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(stringResource(R.string.channels_title)) })
        },
    ) { padding ->
        if (state.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.fillMaxSize().padding(padding).testTag("loading"),
            )
        } else {
            LazyColumn(modifier = Modifier.padding(padding)) {
                items(ChannelType.entries) { channel ->
                    val isEnabled = state.config?.enabledChannels?.contains(channel.key) == true
                    ListItem(
                        headlineContent = { Text(channel.displayName) },
                        supportingContent = {
                            Text(
                                if (isEnabled) stringResource(R.string.common_enabled) else stringResource(R.string.common_disabled),
                                color = if (isEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                        leadingContent = {
                            Icon(
                                imageVector = channelIcon(channel),
                                contentDescription = channel.displayName,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                        modifier = Modifier
                            .clickable { onChannelClick(channel) }
                            .testTag("channel-${channel.key}"),
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}
