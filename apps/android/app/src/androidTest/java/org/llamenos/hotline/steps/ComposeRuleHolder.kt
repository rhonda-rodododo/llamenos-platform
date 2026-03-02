package org.llamenos.hotline.steps

import androidx.compose.ui.test.junit4.createEmptyComposeRule
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import io.cucumber.junit.WithJunitRule
import org.junit.Rule

/**
 * Holds the Compose test rule and Hilt rule for Cucumber step definitions.
 *
 * Annotated with [@WithJunitRule] so that Cucumber processes the JUnit [@Rule]s.
 * Annotated with [@HiltAndroidTest] so that Hilt generates the test component.
 *
 * Step definition classes inject this holder via Cucumber-Hilt DI to get access
 * to the Compose test rule for asserting and interacting with the UI.
 */
@WithJunitRule(useAsTestClassInDescription = true)
@HiltAndroidTest
class ComposeRuleHolder {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeRule = createEmptyComposeRule()

    fun inject() {
        hiltRule.inject()
    }
}
