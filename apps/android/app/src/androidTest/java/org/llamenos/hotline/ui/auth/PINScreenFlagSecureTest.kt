package org.llamenos.hotline.ui.auth

import android.view.WindowManager
import androidx.test.ext.junit.rules.activityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.llamenos.hotline.MainActivity
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
class PINScreenFlagSecureTest {

    @get:Rule
    val activityRule = activityScenarioRule<MainActivity>()

    @Test
    fun pinUnlockScreenHasFlagSecure() {
        // Verify FLAG_SECURE is set on the window when PINUnlockScreen is shown.
        // FLAG_SECURE prevents screenshots and screen recording of PIN/key material.
        activityRule.scenario.onActivity { activity: MainActivity ->
            val flags: Int = activity.window.attributes.flags
            assertTrue(
                (flags and WindowManager.LayoutParams.FLAG_SECURE) != 0,
                "PIN unlock screen must have FLAG_SECURE set to prevent screenshots of sensitive material"
            )
        }
    }
}
