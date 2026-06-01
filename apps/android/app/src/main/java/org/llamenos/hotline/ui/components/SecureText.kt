package org.llamenos.hotline.ui.components

import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * SecureText displays sensitive text (like a device key) in a non-copyable manner.
 *
 * Security measures:
 * - Uses FLAG_SECURE to prevent screenshots while this composable is displayed
 * - Monospace font for consistent character display
 * - No long-press copy action (standard Text composable, not SelectionContainer)
 * - Clears clipboard if it contains the displayed text on dispose
 *
 * The device key is only shown during onboarding for the user to write down.
 * After confirming backup, the device key is never displayed again.
 */
@Composable
fun SecureText(
    text: String,
    modifier: Modifier = Modifier,
    testTag: String = "secure-text",
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    // Set FLAG_SECURE to prevent screenshots while sensitive text is visible
    DisposableEffect(Unit) {
        val activity = context as? android.app.Activity
        activity?.window?.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE,
        )

        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)

            // Clear clipboard if it contains the sensitive text
            val clipContent = clipboardManager.getText()
            if (clipContent?.text == text) {
                clipboardManager.setText(androidx.compose.ui.text.AnnotatedString(""))
            }
        }
    }

    Box(
        modifier = modifier
            .background(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(8.dp),
            )
            .padding(16.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontFamily = FontFamily.Monospace,
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.testTag(testTag),
        )
    }
}
