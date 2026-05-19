package org.llamenos.hotline.ui.components

import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView

/**
 * Sets FLAG_SECURE on the window while this composable is in the composition.
 * Use on screens that display sensitive data: PIN entry, recovery phrases, key material.
 *
 * FLAG_SECURE prevents screenshots and screen recording. On the lock screen it also
 * prevents the screen content from appearing in the recents/app switcher thumbnail.
 */
@Composable
fun SecureWindowEffect() {
    val view = LocalView.current
    DisposableEffect(view) {
        val window = (view.context as? android.app.Activity)?.window
            ?: return@DisposableEffect onDispose {}
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
