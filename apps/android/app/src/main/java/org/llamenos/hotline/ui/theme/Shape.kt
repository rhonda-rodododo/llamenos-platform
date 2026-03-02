package org.llamenos.hotline.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Custom shape scheme for consistent rounded corners across the app.
 *
 * Material 3 maps these shapes to components automatically:
 * - extraSmall: Chips, Snackbar
 * - small: Buttons, IconButtons, FilterChips
 * - medium: Cards, AlertDialogs, NavigationDrawer items
 * - large: FABs, ExtendedFABs, NavigationDrawer
 * - extraLarge: BottomSheets, LargeTopAppBar
 */
val LlamenosShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)
