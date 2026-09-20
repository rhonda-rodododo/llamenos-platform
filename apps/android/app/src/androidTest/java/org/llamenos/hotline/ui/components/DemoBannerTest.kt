package org.llamenos.hotline.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test

/**
 * Compose UI tests for [DemoBanner] and the visibility gating it is composed
 * behind in `MainScreen` (`if (uiState.visible) DemoBanner(...)`).
 *
 * Regression coverage for #799: the banner previously rendered `demo.banner`
 * ("Demo Mode") instead of `demo.bannerText` ("You're exploring..."), so the
 * body text -- what the shared `@android` Cucumber scenario in
 * `packages/test-specs/features/admin/settings.feature`
 * ("Demo banner shows when logged in") asserts on -- never appeared.
 *
 * These tests render composables in isolation with fake state. They do NOT
 * require a running backend.
 */
class DemoBannerTest {

    @get:Rule
    val composeRule = createComposeRule()

    /** Mirrors the `if (demoBannerUiState.visible) { DemoBanner(...) }` gate in MainScreen.kt. */
    @Composable
    private fun GatedDemoBanner(state: DemoBannerUiState, onDismiss: () -> Unit) {
        Column {
            if (state.visible) {
                DemoBanner(onDismiss = onDismiss, demoResetSchedule = state.demoResetSchedule)
            }
        }
    }

    @Test
    fun demoMode_showsBodyTextAndDeployLink() {
        composeRule.setContent {
            GatedDemoBanner(
                state = DemoBannerUiState(demoMode = true, dismissed = false),
                onDismiss = {},
            )
        }

        composeRule.onNodeWithTag("demo-banner").assertIsDisplayed()
        composeRule.onNodeWithTag("demo-banner-text").assertIsDisplayed()
        composeRule.onNodeWithTag("demo-deploy-link").assertIsDisplayed()
        composeRule.onNodeWithTag("demo-dismiss-button").assertIsDisplayed()
    }

    @Test
    fun notDemoMode_bannerIsAbsent() {
        composeRule.setContent {
            GatedDemoBanner(
                state = DemoBannerUiState(demoMode = false, dismissed = false),
                onDismiss = {},
            )
        }

        composeRule.onNodeWithTag("demo-banner").assertDoesNotExist()
        composeRule.onNodeWithTag("demo-banner-text").assertDoesNotExist()
    }

    @Test
    fun dismissed_bannerIsAbsent() {
        composeRule.setContent {
            GatedDemoBanner(
                state = DemoBannerUiState(demoMode = true, dismissed = true),
                onDismiss = {},
            )
        }

        composeRule.onNodeWithTag("demo-banner").assertDoesNotExist()
        composeRule.onNodeWithTag("demo-banner-text").assertDoesNotExist()
    }

    @Test
    fun dismissButton_invokesCallback() {
        var dismissed = false
        composeRule.setContent {
            GatedDemoBanner(
                state = DemoBannerUiState(demoMode = true, dismissed = false),
                onDismiss = { dismissed = true },
            )
        }

        composeRule.onNodeWithTag("demo-dismiss-button").performClick()
        assert(dismissed) { "Expected onDismiss to be invoked" }
    }
}
