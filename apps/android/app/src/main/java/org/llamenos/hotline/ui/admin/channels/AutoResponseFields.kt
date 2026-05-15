package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import org.llamenos.hotline.R

@Composable
fun AutoResponseFields(
    autoResponse: String,
    afterHoursResponse: String,
    onAutoResponseChange: (String) -> Unit,
    onAfterHoursResponseChange: (String) -> Unit,
    idPrefix: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        OutlinedTextField(
            value = autoResponse,
            onValueChange = onAutoResponseChange,
            label = { Text(stringResource(R.string.channels_shared_auto_response)) },
            supportingText = { Text(stringResource(R.string.channels_shared_auto_response_help), style = MaterialTheme.typography.bodySmall) },
            modifier = Modifier.fillMaxWidth().testTag("$idPrefix-auto-response"),
            minLines = 2,
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = afterHoursResponse,
            onValueChange = onAfterHoursResponseChange,
            label = { Text(stringResource(R.string.channels_shared_after_hours_response)) },
            supportingText = { Text(stringResource(R.string.channels_shared_after_hours_help), style = MaterialTheme.typography.bodySmall) },
            modifier = Modifier.fillMaxWidth().testTag("$idPrefix-after-hours"),
            minLines = 2,
        )
    }
}
