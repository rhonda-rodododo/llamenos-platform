package org.llamenos.hotline.traditional

import android.util.Log
import androidx.compose.ui.test.SemanticsNodeInteractionsProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import org.junit.Before
import org.junit.Rule
import org.llamenos.hotline.MainActivity
import org.llamenos.hotline.helpers.SimulationClient

abstract class BaseUiTest : SemanticsNodeInteractionsProvider {

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    protected lateinit var testHubId: String

    @Before
    fun createTestHub() {
        Log.i(TAG, "=== createTestHub: hubUrl=${SimulationClient.hubUrl} ===")
        var lastError: Exception? = null
        for (attempt in 1..3) {
            try {
                val response = SimulationClient.createTestHub()
                if (response.id.isNotEmpty()) {
                    testHubId = response.id
                    Log.i(TAG, "Created test hub: ${response.id} (${response.name}) [attempt $attempt]")
                    return
                } else {
                    val msg = "createTestHub returned empty ID — error: ${response.error} [attempt $attempt]"
                    Log.w(TAG, msg)
                    lastError = RuntimeException(msg)
                }
            } catch (e: Exception) {
                lastError = e
                Log.w(TAG, "createTestHub attempt $attempt failed: ${e.message}")
                if (attempt < 3) {
                    Thread.sleep((attempt * 2000).toLong())
                }
            }
        }
        val errorMsg = "createTestHub FAILED after 3 attempts (hubUrl=${SimulationClient.hubUrl}): ${lastError?.message}"
        Log.e(TAG, errorMsg)
        throw AssertionError(errorMsg, lastError)
    }

    override fun onAllNodes(
        matcher: androidx.compose.ui.test.SemanticsMatcher,
        useUnmergedTree: Boolean,
    ) = composeRule.onAllNodes(matcher, useUnmergedTree)

    override fun onNode(
        matcher: androidx.compose.ui.test.SemanticsMatcher,
        useUnmergedTree: Boolean,
    ) = composeRule.onNode(matcher, useUnmergedTree)

    fun enterPin(pin: String) {
        for (digit in pin.toList()) {
            composeRule.onNodeWithTag("pin-$digit").performClick()
        }
        composeRule.waitForIdle()
    }

    fun navigateToTab(tabTag: String) {
        composeRule.onNodeWithTag(tabTag).performClick()
        composeRule.waitForIdle()
    }

    fun waitForNode(tag: String, timeoutMillis: Long = 5000) {
        composeRule.waitUntil(timeoutMillis) {
            composeRule.onAllNodesWithTag(tag)
                .fetchSemanticsNodes().isNotEmpty()
        }
    }

    fun navigateToMainScreen(pin: String = TEST_PIN) {
        Log.d(TAG, "navigateToMainScreen: waiting for login or unlock screen")
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("create-identity").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("pin-pad").fetchSemanticsNodes().isNotEmpty()
        }

        val hasLogin = composeRule.onAllNodesWithTag("create-identity").fetchSemanticsNodes().isNotEmpty()
        if (hasLogin) {
            Log.d(TAG, "navigateToMainScreen: fresh install flow")
            composeRule.onNodeWithTag("hub-url-input").performTextInput(SimulationClient.hubUrl)
            composeRule.waitForIdle()
            composeRule.onNodeWithTag("create-identity").performClick()
            waitForNode("pin-pad", timeoutMillis = 10_000)
            enterPin(pin)
            enterPin(pin)
        } else {
            Log.d(TAG, "navigateToMainScreen: returning user, entering PIN")
            enterPin(pin)
        }
        waitForNode("nav-dashboard", timeoutMillis = 120_000)
        composeRule.onNodeWithTag("nav-dashboard").assertIsDisplayed()
    }

    companion object {
        private const val TAG = "BaseUiTest"
        const val TEST_PIN = "123456"
    }
}
