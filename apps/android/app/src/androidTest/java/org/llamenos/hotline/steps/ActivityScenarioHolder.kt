package org.llamenos.hotline.steps

import android.content.Intent
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import io.cucumber.java.After
import io.cucumber.java.Before
import org.llamenos.hotline.MainActivity

/**
 * Manages the [ActivityScenario] lifecycle for Cucumber scenarios.
 *
 * Launched via [Before] hook before each scenario and closed via [After] hook after.
 * Step definitions that need the activity running should call [launch] in their
 * background steps (e.g., "the app is freshly installed").
 */
class ActivityScenarioHolder {

    var scenario: ActivityScenario<MainActivity>? = null
        private set

    fun launch() {
        if (scenario != null) return // Already launched
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        }
        scenario = ActivityScenario.launch(intent)
    }

    @After(order = 10000)
    fun close() {
        scenario?.close()
        scenario = null
    }
}
