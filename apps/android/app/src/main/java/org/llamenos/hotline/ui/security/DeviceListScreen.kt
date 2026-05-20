package org.llamenos.hotline.ui.security

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Computer
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import org.llamenos.protocol.DeviceDetailListResponse
import org.llamenos.hotline.model.DeviceDetailListResponseDevice

@Composable
fun DeviceListScreen(
    devices: List<DeviceDetailListResponseDevice>,
    loading: Boolean,
    modifier: Modifier = Modifier,
) {
    if (loading) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(devices, key = { it.id }) { device ->
            Card(modifier = Modifier.fillMaxWidth().testTag("device-${device.id}")) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        if (device.platform == "ios" || device.platform == "android")
                            Icons.Default.PhoneAndroid else Icons.Default.Computer,
                        contentDescription = device.platform,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                device.deviceName ?: device.platform,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            if (device.isCurrent) {
                                AssistChip(
                                    onClick = {},
                                    label = { Text("Current", style = MaterialTheme.typography.labelSmall) },
                                )
                            }
                        }
                        device.deviceModel?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
