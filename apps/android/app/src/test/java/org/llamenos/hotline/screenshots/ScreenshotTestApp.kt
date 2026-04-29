package org.llamenos.hotline.screenshots

import android.app.Application

/**
 * Minimal Application for Roborazzi screenshot tests.
 *
 * Uses a plain Application instead of LlamenosApp (which is @HiltAndroidApp
 * and initializes Linphone/Hilt) to prevent native library loading errors
 * in JVM-based Robolectric tests.
 */
class ScreenshotTestApp : Application()
