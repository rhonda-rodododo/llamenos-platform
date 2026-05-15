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
import org.llamenos.i18n.I18n

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
            label = { Text(I18n.channels_shared_autoResponse) },
            supportingText = { Text(I18n.channels_shared_autoResponseHelp, style = MaterialTheme.typography.bodySmall) },
            modifier = Modifier.fillMaxWidth().testTag("$idPrefix-auto-response"),
            minLines = 2,
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = afterHoursResponse,
            onValueChange = onAfterHoursResponseChange,
            label = { Text(I18n.channels_shared_afterHoursResponse) },
            supportingText = { Text(I18n.channels_shared_afterHoursHelp, style = MaterialTheme.typography.bodySmall) },
            modifier = Modifier.fillMaxWidth().testTag("$idPrefix-after-hours"),
            minLines = 2,
        )
    }
}
