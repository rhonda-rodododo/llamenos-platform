package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import androidx.compose.ui.res.stringResource
import org.llamenos.hotline.R

@Composable
fun ConnectionTestButton(
    channel: String,
    enabled: Boolean,
    onTest: suspend (String) -> Boolean,
    modifier: Modifier = Modifier,
) {
    var testing by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<Boolean?>(null) }
    val scope = rememberCoroutineScope()

    Row(verticalAlignment = Alignment.CenterVertically, modifier = modifier) {
        OutlinedButton(
            onClick = {
                scope.launch {
                    testing = true
                    result = null
                    result = try { onTest(channel) } catch (_: Exception) { false }
                    testing = false
                }
            },
            enabled = enabled && !testing,
            modifier = Modifier.testTag("test-$channel-btn"),
        ) {
            if (testing) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.channels_shared_testing))
            } else {
                Text(stringResource(R.string.channels_shared_test_connection))
            }
        }

        result?.let { connected ->
            Spacer(Modifier.width(8.dp))
            Icon(
                imageVector = if (connected) Icons.Default.Check else Icons.Default.Close,
                contentDescription = null,
                tint = if (connected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                modifier = Modifier.size(16.dp),
            )
            Spacer(Modifier.width(4.dp))
            Text(
                text = if (connected) stringResource(R.string.channels_shared_test_success) else stringResource(R.string.channels_shared_test_failed),
                style = MaterialTheme.typography.bodySmall,
                color = if (connected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            )
        }
    }
}
