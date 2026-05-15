package org.llamenos.hotline.ui.security

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Shield
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import org.llamenos.protocol.SecurityEventListResponseEvent
import org.llamenos.protocol.EventType

@Composable
fun SecurityEventsScreen(
    events: List<SecurityEventListResponseEvent>,
    loading: Boolean,
    total: Int,
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
        items(events, key = { it.id }) { event ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(iconForEventType(event.eventType), contentDescription = event.eventType.value)
                    Column {
                        Text(event.eventType.value, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            event.createdAt,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

private fun iconForEventType(type: EventType): ImageVector = when {
    type.value.startsWith("device_") -> Icons.Default.PhoneAndroid
    type.value.startsWith("session_") -> Icons.Default.Key
    type.value.startsWith("account_") || type.value.startsWith("puk_") || type.value.startsWith("hub_key_") -> Icons.Default.Shield
    type.value.startsWith("webauthn_") -> Icons.Default.Key
    else -> Icons.Default.Warning
}
