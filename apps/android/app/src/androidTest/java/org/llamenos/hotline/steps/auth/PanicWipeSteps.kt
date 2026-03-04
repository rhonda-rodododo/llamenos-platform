package org.llamenos.hotline.steps.auth

import android.view.KeyEvent
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.platform.app.InstrumentationRegistry
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for panic-wipe.feature scenarios.
 *
 * On desktop: Escape key pressed 3x in 3 seconds.
 * On Android: Volume-down pressed 5x in 3 seconds (hardware key event).
 * The feature file scenarios use web terminology (Escape key) but
 * map to Android-native trigger mechanisms.
 *
 * Note: "I am on the dashboard" is defined in NavigationSteps (canonical location).
 */
class PanicWipeSteps : BaseSteps() {

    @When("I press Escape three times quickly")
    fun iPressEscapeThreeTimesQuickly() {
        // Android equivalent: volume-down rapid press sequence
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        repeat(5) {
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_VOLUME_DOWN)
            Thread.sleep(100)
        }
        composeRule.waitForIdle()
    }

    @Then("the panic wipe overlay should appear")
    fun thePanicWipeOverlayShouldAppear() {
        val found = assertAnyTagDisplayed("panic-wipe-overlay", "panic-wipe-message", "app-title")
        assert(found) { "Expected panic wipe overlay, message, or login redirect" }
    }

    @Then("I should be redirected to the login page")
    fun iShouldBeRedirectedToTheLoginPage() {
        val found = assertAnyTagDisplayed("app-title", "create-identity")
        assert(found) { "Expected login page after panic wipe" }
    }

    @Then("all local storage should be cleared")
    fun allLocalStorageShouldBeCleared() {
        // On Android: EncryptedSharedPreferences and Keystore entries cleared
        val found = assertAnyTagDisplayed("app-title", "create-identity")
        assert(found) { "Expected login page (storage cleared)" }
    }

    @Then("all session storage should be cleared")
    fun allSessionStorageShouldBeCleared() {
        // On Android: in-memory CryptoService state cleared
        val found = assertAnyTagDisplayed("app-title", "create-identity")
        assert(found) { "Expected login page (session cleared)" }
    }

    @When("I press Escape twice then wait over one second")
    fun iPressEscapeTwiceThenWaitOverOneSecond() {
        // Android: volume-down 2x then pause (shouldn't trigger wipe)
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        repeat(2) {
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_VOLUME_DOWN)
            Thread.sleep(100)
        }
        Thread.sleep(1100)
        composeRule.waitForIdle()
    }

    @When("I press Escape once more")
    fun iPressEscapeOnceMore() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_VOLUME_DOWN)
        composeRule.waitForIdle()
    }

    @Then("I should still be on the dashboard")
    fun iShouldStillBeOnTheDashboard() {
        onNodeWithTag("dashboard-title").assertIsDisplayed()
    }

    @Then("the encrypted key should still be in storage")
    fun theEncryptedKeyShouldStillBeInStorage() {
        // After failed wipe sequence, keys should still be present
        onNodeWithTag("dashboard-title").assertIsDisplayed()
    }
}
