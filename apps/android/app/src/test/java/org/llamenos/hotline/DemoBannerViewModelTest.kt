package org.llamenos.hotline

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.llamenos.hotline.ui.components.DemoBannerUiState

/**
 * Unit tests for [DemoBannerUiState.visible] gating logic.
 *
 * DemoBannerViewModel depends on ApiService (inline reified generics) which
 * cannot be easily faked in JVM unit tests, so these tests verify the state
 * data class's `visible` derivation directly -- the same logic MainScreen
 * uses to decide whether to compose [org.llamenos.hotline.ui.components.DemoBanner].
 */
class DemoBannerViewModelTest {

    @Test
    fun `default state is not visible`() {
        assertFalse(DemoBannerUiState().visible)
    }

    @Test
    fun `demo mode without dismissal is visible`() {
        val state = DemoBannerUiState(demoMode = true, dismissed = false)
        assertTrue(state.visible)
    }

    @Test
    fun `demo mode disabled is not visible even if not dismissed`() {
        val state = DemoBannerUiState(demoMode = false, dismissed = false)
        assertFalse(state.visible)
    }

    @Test
    fun `dismissing a visible demo banner hides it`() {
        val visible = DemoBannerUiState(demoMode = true, dismissed = false)
        assertTrue(visible.visible)

        val dismissed = visible.copy(dismissed = true)
        assertFalse(dismissed.visible)
    }

    @Test
    fun `dismissed flag has no effect when demo mode is off`() {
        val state = DemoBannerUiState(demoMode = false, dismissed = true)
        assertFalse(state.visible)
    }
}
