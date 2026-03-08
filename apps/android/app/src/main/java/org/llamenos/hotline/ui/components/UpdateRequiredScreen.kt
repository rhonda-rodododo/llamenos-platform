package org.llamenos.hotline.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R

/**
 * Full-screen blocking composable shown when the app's API version is too old
 * to communicate with the server. The user must update to continue.
 *
 * Includes a Play Store link and a "Contact admin" fallback with the hub URL
 * in case the user needs help or the force-update was misconfigured.
 *
 * @param hubUrl The configured hub URL, shown as a fallback contact reference
 */
@Composable
fun UpdateRequiredScreen(
    hubUrl: String = "",
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp)
            .testTag("update-required-screen"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Default.SystemUpdate,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.error,
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = stringResource(R.string.updates_update_required_title),
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = stringResource(R.string.updates_update_required_message),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = {
                val intent = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=org.llamenos.hotline"),
                )
                context.startActivity(intent)
            },
            modifier = Modifier.testTag("update-button"),
        ) {
            Text(stringResource(R.string.updates_update_required_button))
        }

        // Fallback: show hub URL so the user can contact their admin
        if (hubUrl.isNotBlank()) {
            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = stringResource(R.string.updates_contact_admin),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            TextButton(onClick = {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(hubUrl))
                context.startActivity(intent)
            }) {
                Text(
                    text = hubUrl,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
