package org.llamenos.hotline.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTextInput
import org.junit.Rule
import org.junit.Test
import org.llamenos.hotline.model.RecoveryGroupInfo
import org.llamenos.hotline.model.RecoverySessionStatus
import org.llamenos.hotline.model.ShareHolderLiveness
import org.llamenos.hotline.ui.admin.RecoveryRequestsScreen
import org.llamenos.hotline.ui.admin.RecoveryTeamConfigScreen
import org.llamenos.hotline.ui.auth.AccountRecoveryScreen
import org.llamenos.hotline.ui.auth.RecoveryStep

/**
 * Compose UI tests for recovery group screens.
 *
 * These tests render individual composables in isolation with fake data,
 * verifying layout, interaction, and state-dependent rendering. They do
 * NOT require a running backend -- all data is passed directly to composables.
 */
class RecoveryGroupTest {

    @get:Rule
    val composeRule = createComposeRule()

    // ── RecoveryTeamConfigScreen (setup state) ──────────────────────────────

    @Test
    fun recoveryTeamSetup_showsThresholdAndTotalPickers() {
        composeRule.setContent {
            RecoveryTeamConfigScreen(
                groupInfo = null,
                isLoading = false,
                error = null,
                onSetup = { _, _, _, _ -> },
                onRotate = {},
            )
        }
        composeRule.onNodeWithTag("recovery-threshold-picker").assertIsDisplayed()
        composeRule.onNodeWithTag("recovery-total-picker").assertIsDisplayed()
        composeRule.onNodeWithTag("setup-recovery-team-button").assertIsDisplayed()
    }

    @Test
    fun recoveryTeamSetup_setupButtonIsEnabledByDefault() {
        // Default values: threshold=3, total=5 — valid configuration
        composeRule.setContent {
            RecoveryTeamConfigScreen(
                groupInfo = null,
                isLoading = false,
                error = null,
                onSetup = { _, _, _, _ -> },
                onRotate = {},
            )
        }
        composeRule.onNodeWithTag("setup-recovery-team-button").assertIsEnabled()
    }

    @Test
    fun recoveryTeamConfigured_showsStatusCard() {
        composeRule.setContent {
            RecoveryTeamConfigScreen(
                groupInfo = sampleGroupInfo,
                isLoading = false,
                error = null,
                onSetup = { _, _, _, _ -> },
                onRotate = {},
            )
        }
        composeRule.onNodeWithTag("recovery-status-card").assertIsDisplayed()
        composeRule.onNodeWithTag("rotate-recovery-team-button").assertIsDisplayed()
    }

    // ── RecoveryRequestsScreen ──────────────────────────────────────────────

    @Test
    fun recoveryRequests_showsEmptyStateWhenNoRequests() {
        composeRule.setContent {
            RecoveryRequestsScreen(
                activeRequests = emptyList(),
                historyRequests = emptyList(),
                isLoading = false,
                error = null,
                onApprove = {},
                onCancel = {},
                onUrgentOverride = { _, _, _ -> },
            )
        }
        composeRule.onNodeWithTag("recovery-requests-empty").assertIsDisplayed()
    }

    @Test
    fun recoveryRequests_showsActiveRequestCard() {
        composeRule.setContent {
            RecoveryRequestsScreen(
                activeRequests = listOf(sampleSession),
                historyRequests = emptyList(),
                isLoading = false,
                error = null,
                onApprove = {},
                onCancel = {},
                onUrgentOverride = { _, _, _ -> },
            )
        }
        composeRule.onNodeWithTag("recovery-request-card-${sampleSession.sessionId}")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("approve-recovery-${sampleSession.sessionId}")
            .assertIsDisplayed()
    }

    // ── AccountRecoveryScreen ───────────────────────────────────────────────

    @Test
    fun accountRecovery_startButtonDisabledWithEmptyInputs() {
        composeRule.setContent {
            AccountRecoveryScreen(
                onInitiateRecovery = { _, _ -> },
                onVerifyCode = {},
                onSetPin = {},
                currentStep = RecoveryStep.IDENTIFIER,
                isLoading = false,
                error = null,
                contributionCount = 0,
                threshold = 3,
                delayRemainingMs = null,
            )
        }
        composeRule.onNodeWithTag("start-recovery-button").assertIsNotEnabled()
    }

    @Test
    fun accountRecovery_startButtonEnabledWithInputs() {
        composeRule.setContent {
            AccountRecoveryScreen(
                onInitiateRecovery = { _, _ -> },
                onVerifyCode = {},
                onSetPin = {},
                currentStep = RecoveryStep.IDENTIFIER,
                isLoading = false,
                error = null,
                contributionCount = 0,
                threshold = 3,
                delayRemainingMs = null,
            )
        }
        composeRule.onNodeWithTag("recovery-identifier-input").performTextInput("test@example.com")
        composeRule.onNodeWithTag("recovery-hub-input").performTextInput("test-hub-id")
        composeRule.onNodeWithTag("start-recovery-button").assertIsEnabled()
    }

    @Test
    fun accountRecovery_waitingStepShowsSpinner() {
        composeRule.setContent {
            AccountRecoveryScreen(
                onInitiateRecovery = { _, _ -> },
                onVerifyCode = {},
                onSetPin = {},
                currentStep = RecoveryStep.WAITING,
                isLoading = false,
                error = null,
                contributionCount = 1,
                threshold = 3,
                delayRemainingMs = null,
            )
        }
        composeRule.onNodeWithTag("recovery-waiting-spinner").assertIsDisplayed()
        composeRule.onNodeWithTag("recovery-approval-count").assertIsDisplayed()
    }

    @Test
    fun accountRecovery_completeStepShowsSuccess() {
        composeRule.setContent {
            AccountRecoveryScreen(
                onInitiateRecovery = { _, _ -> },
                onVerifyCode = {},
                onSetPin = {},
                currentStep = RecoveryStep.COMPLETE,
                isLoading = false,
                error = null,
                contributionCount = 3,
                threshold = 3,
                delayRemainingMs = null,
            )
        }
        composeRule.onNodeWithTag("recovery-complete-card").assertIsDisplayed()
    }

    // ── Test data ───────────────────────────────────────────────────────────

    private val sampleGroupInfo = RecoveryGroupInfo(
        publicKey = "aabbccdd00112233",
        threshold = 3,
        totalShares = 5,
        commitments = listOf("commit1", "commit2", "commit3"),
        sigchainLinkHash = "linkhash123",
        delayHours = 24,
        emergencyFloorHours = 4,
        createdAt = "2026-01-01T00:00:00Z",
        rotatedAt = null,
        shareHolderLiveness = listOf(
            ShareHolderLiveness(
                holderPubkey = "holder1pubkey0011223344",
                lastLivenessProof = "2026-01-10T00:00:00Z",
            ),
            ShareHolderLiveness(
                holderPubkey = "holder2pubkey5566778899",
                lastLivenessProof = null,
            ),
        ),
    )

    private val sampleSession = RecoverySessionStatus(
        sessionId = "session-001",
        hubId = "hub-test",
        userPubkey = "userpubkey001122334455",
        newDevicePubkey = "newdevice001122",
        status = "verified",
        contributionCount = 1,
        threshold = 3,
        delayRemainingMs = null,
        expiresAt = "2026-01-15T00:00:00Z",
        createdAt = "2026-01-14T00:00:00Z",
        contributions = null,
        emergencyOverride = null,
    )
}
