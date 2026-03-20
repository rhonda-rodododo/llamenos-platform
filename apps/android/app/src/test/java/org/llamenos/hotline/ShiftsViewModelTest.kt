package org.llamenos.hotline

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.llamenos.hotline.ui.shifts.ShiftsUiState

/**
 * Unit tests for ShiftsUiState data class behavior.
 *
 * ShiftsViewModel depends on ApiService (inline reified generics) which
 * cannot be easily faked in JVM unit tests. These tests verify the
 * state data class defaults and transitions.
 */
class ShiftsViewModelTest {

    @Test
    fun `default state has empty shifts and no loading`() {
        val state = ShiftsUiState()

        assertTrue(state.shifts.isEmpty())
        assertNull(state.currentStatus)
        assertFalse(state.isLoading)
        assertFalse(state.isRefreshing)
        assertFalse(state.isClockingInOut)
        assertNull(state.error)
        assertNull(state.showDropConfirmation)
    }

    @Test
    fun `loading state for empty list sets isLoading true`() {
        val state = ShiftsUiState()
        val loading = state.copy(
            isLoading = state.shifts.isEmpty(),
            isRefreshing = state.shifts.isNotEmpty(),
        )

        assertTrue(loading.isLoading)
        assertFalse(loading.isRefreshing)
    }

    @Test
    fun `refreshing state for populated list sets isRefreshing true`() {
        val state = ShiftsUiState(shifts = listOf(mockShift("s1")))
        val refreshing = state.copy(
            isLoading = state.shifts.isEmpty(),
            isRefreshing = state.shifts.isNotEmpty(),
        )

        assertFalse(refreshing.isLoading)
        assertTrue(refreshing.isRefreshing)
    }

    @Test
    fun `clocking in sets isClockingInOut and clears error`() {
        val state = ShiftsUiState(error = "previous error")
        val clocking = state.copy(isClockingInOut = true, error = null)

        assertTrue(clocking.isClockingInOut)
        assertNull(clocking.error)
    }

    @Test
    fun `clock in failure sets error and resets clocking state`() {
        val state = ShiftsUiState(isClockingInOut = true)
        val failed = state.copy(
            isClockingInOut = false,
            error = "Failed to clock in",
        )

        assertFalse(failed.isClockingInOut)
        assertEquals("Failed to clock in", failed.error)
    }

    @Test
    fun `show drop confirmation stores shift ID`() {
        val state = ShiftsUiState()
        val confirming = state.copy(showDropConfirmation = "shift-123")

        assertEquals("shift-123", confirming.showDropConfirmation)
    }

    @Test
    fun `dismiss drop confirmation clears shift ID`() {
        val state = ShiftsUiState(showDropConfirmation = "shift-123")
        val dismissed = state.copy(showDropConfirmation = null)

        assertNull(dismissed.showDropConfirmation)
    }

    @Test
    fun `error state can be cleared`() {
        val state = ShiftsUiState(error = "Network error")
        val cleared = state.copy(error = null)

        assertNull(cleared.error)
    }

    private fun mockShift(id: String) = org.llamenos.protocol.ShiftResponse(
        id = id,
        name = "Test Shift",
        startTime = "09:00",
        endTime = "17:00",
        days = listOf(1.0, 2.0, 3.0),
        userPubkeys = emptyList(),
        createdAt = "2026-03-01",
    )
}
