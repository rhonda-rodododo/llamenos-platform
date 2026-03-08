package org.llamenos.hotline.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R

/**
 * Non-blocking banner shown when a newer app version is available but not required.
 * The user can dismiss it and continue using the app. Includes a Play Store link.
 *
 * @param onDismiss Callback when the user dismisses the banner
 */
@Composable
fun UpdateBanner(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f))
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .testTag("update-available-banner"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Default.SystemUpdate,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
        )

        Spacer(modifier = Modifier.width(12.dp))

        Text(
            text = stringResource(R.string.updates_update_available_message),
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f),
        )

        TextButton(
            onClick = {
                val intent = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=org.llamenos.hotline"),
                )
                context.startActivity(intent)
            },
        ) {
            Text(
                text = stringResource(R.string.updates_update_required_button),
                style = MaterialTheme.typography.labelMedium,
            )
        }

        IconButton(
            onClick = onDismiss,
            modifier = Modifier.testTag("dismiss-update-banner"),
        ) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = stringResource(R.string.updates_update_available_dismiss),
            )
        }
    }
}
