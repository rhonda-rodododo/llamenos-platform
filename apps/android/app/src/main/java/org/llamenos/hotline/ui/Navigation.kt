package org.llamenos.hotline.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import org.llamenos.hotline.api.NetworkMonitor
import org.llamenos.hotline.api.WebSocketService
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.crypto.KeystoreService
import org.llamenos.hotline.ui.admin.AdminScreen
import org.llamenos.hotline.ui.auth.AuthViewModel
import org.llamenos.hotline.ui.calls.CallHistoryScreen
import org.llamenos.hotline.ui.calls.CallHistoryViewModel
import org.llamenos.hotline.ui.reports.ReportsScreen
import org.llamenos.hotline.ui.reports.ReportsViewModel
import org.llamenos.hotline.ui.auth.LoginScreen
import org.llamenos.hotline.ui.auth.OnboardingScreen
import org.llamenos.hotline.ui.auth.PINSetScreen
import org.llamenos.hotline.ui.auth.PINUnlockScreen
import org.llamenos.hotline.ui.conversations.ConversationDetailScreen
import org.llamenos.hotline.ui.conversations.ConversationsViewModel
import org.llamenos.hotline.ui.notes.NoteCreateScreen
import org.llamenos.hotline.ui.notes.NoteDetailScreen
import org.llamenos.hotline.ui.notes.NotesViewModel
import org.llamenos.hotline.ui.settings.DeviceLinkScreen

/**
 * Type-safe route definitions for the navigation graph.
 *
 * Each route is a sealed interface member with a unique [route] string.
 * This avoids raw string matching throughout the codebase.
 */
sealed interface LlamenosRoute {
    val route: String

    /** Hub URL input, nsec import, or new identity creation. */
    data object Login : LlamenosRoute {
        override val route = "login"
    }

    /** Display generated nsec for user to back up. */
    data object Onboarding : LlamenosRoute {
        override val route = "onboarding"
    }

    /** Set a new PIN (enter + confirm). */
    data object PINSet : LlamenosRoute {
        override val route = "pin_set"
    }

    /** Unlock with existing PIN. */
    data object PINUnlock : LlamenosRoute {
        override val route = "pin_unlock"
    }

    /** Main screen with bottom navigation (Dashboard, Notes, Conversations, Shifts, Settings). */
    data object Main : LlamenosRoute {
        override val route = "main"
    }

    /** Note detail view. */
    data class NoteDetail(val noteId: String) : LlamenosRoute {
        override val route = "note/{noteId}"

        companion object {
            const val ROUTE_PATTERN = "note/{noteId}"
        }
    }

    /** Note creation form. */
    data object NoteCreate : LlamenosRoute {
        override val route = "note_create"
    }

    /** Conversation detail view. */
    data class ConversationDetail(val conversationId: String) : LlamenosRoute {
        override val route = "conversation/{conversationId}"

        companion object {
            const val ROUTE_PATTERN = "conversation/{conversationId}"
        }
    }

    /** Call history list. */
    data object CallHistory : LlamenosRoute {
        override val route = "call_history"
    }

    /** Reports list. */
    data object Reports : LlamenosRoute {
        override val route = "reports"
    }

    /** Report detail view. */
    data class ReportDetail(val reportId: String) : LlamenosRoute {
        override val route = "report/{reportId}"

        companion object {
            const val ROUTE_PATTERN = "report/{reportId}"
        }
    }

    /** Admin panel. */
    data object Admin : LlamenosRoute {
        override val route = "admin"
    }

    /** Device linking via QR code. */
    data object DeviceLink : LlamenosRoute {
        override val route = "device_link"
    }
}

/**
 * Root navigation composable for the llamenos app.
 *
 * Determines the start destination based on whether encrypted keys exist
 * in secure storage:
 * - Keys exist -> PINUnlock (user has previously set up)
 * - No keys -> Login (fresh install or after reset)
 *
 * The [AuthViewModel] is scoped to the NavHost so it survives screen
 * transitions within the auth flow. The [MainScreen] contains bottom
 * navigation with Dashboard, Notes, Conversations, Shifts, and Settings tabs.
 *
 * @param cryptoService Injected from [MainActivity] for determining auth state
 * @param webSocketService Injected for passing to MainScreen
 * @param keystoreService Injected for hub URL access in MainScreen
 */
@Composable
fun LlamenosNavigation(
    cryptoService: CryptoService,
    webSocketService: WebSocketService,
    keystoreService: KeystoreService,
    networkMonitor: NetworkMonitor,
    modifier: Modifier = Modifier,
) {
    val navController = rememberNavController()
    val authViewModel: AuthViewModel = hiltViewModel()
    val uiState by authViewModel.uiState.collectAsState()

    // Determine start destination based on stored key presence
    val startDestination = if (uiState.hasStoredKeys) {
        LlamenosRoute.PINUnlock.route
    } else {
        LlamenosRoute.Login.route
    }

    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier,
    ) {
        composable(LlamenosRoute.Login.route) {
            LoginScreen(
                viewModel = authViewModel,
                onNavigateToOnboarding = {
                    navController.navigate(LlamenosRoute.Onboarding.route) {
                        popUpTo(LlamenosRoute.Login.route) { inclusive = false }
                    }
                },
                onNavigateToPinSet = {
                    navController.navigate(LlamenosRoute.PINSet.route) {
                        popUpTo(LlamenosRoute.Login.route) { inclusive = false }
                    }
                },
            )
        }

        composable(LlamenosRoute.Onboarding.route) {
            OnboardingScreen(
                viewModel = authViewModel,
                onNavigateToPinSet = {
                    navController.navigate(LlamenosRoute.PINSet.route) {
                        // Clear onboarding from back stack -- nsec should not be re-shown
                        popUpTo(LlamenosRoute.Onboarding.route) { inclusive = true }
                    }
                },
            )
        }

        composable(LlamenosRoute.PINSet.route) {
            PINSetScreen(
                viewModel = authViewModel,
                onAuthenticated = {
                    navController.navigate(LlamenosRoute.Main.route) {
                        // Clear entire auth flow from back stack
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }

        composable(LlamenosRoute.PINUnlock.route) {
            PINUnlockScreen(
                viewModel = authViewModel,
                onAuthenticated = {
                    navController.navigate(LlamenosRoute.Main.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onResetIdentity = {
                    navController.navigate(LlamenosRoute.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }

        composable(LlamenosRoute.Main.route) {
            MainScreen(
                cryptoService = cryptoService,
                webSocketService = webSocketService,
                keystoreService = keystoreService,
                networkMonitor = networkMonitor,
                onLock = {
                    cryptoService.lock()
                    authViewModel.resetPinEntry()
                    navController.navigate(LlamenosRoute.PINUnlock.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onLogout = {
                    authViewModel.resetAuthState()
                    navController.navigate(LlamenosRoute.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onNavigateToNoteDetail = { noteId ->
                    navController.navigate("note/$noteId")
                },
                onNavigateToNoteCreate = {
                    navController.navigate(LlamenosRoute.NoteCreate.route)
                },
                onNavigateToConversationDetail = { conversationId ->
                    navController.navigate("conversation/$conversationId")
                },
                onNavigateToAdmin = {
                    navController.navigate(LlamenosRoute.Admin.route)
                },
                onNavigateToCallHistory = {
                    navController.navigate(LlamenosRoute.CallHistory.route)
                },
                onNavigateToReports = {
                    navController.navigate(LlamenosRoute.Reports.route)
                },
                onNavigateToDeviceLink = {
                    navController.navigate(LlamenosRoute.DeviceLink.route)
                },
            )
        }

        composable(LlamenosRoute.NoteDetail.ROUTE_PATTERN) {
            val notesViewModel: NotesViewModel = hiltViewModel()
            NoteDetailScreen(
                viewModel = notesViewModel,
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.NoteCreate.route) {
            val notesViewModel: NotesViewModel = hiltViewModel()
            NoteCreateScreen(
                viewModel = notesViewModel,
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.ConversationDetail.ROUTE_PATTERN) {
            val conversationsViewModel: ConversationsViewModel = hiltViewModel()
            ConversationDetailScreen(
                viewModel = conversationsViewModel,
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.Admin.route) {
            AdminScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.CallHistory.route) {
            val callHistoryViewModel: CallHistoryViewModel = hiltViewModel()
            CallHistoryScreen(
                viewModel = callHistoryViewModel,
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.Reports.route) {
            val reportsViewModel: ReportsViewModel = hiltViewModel()
            ReportsScreen(
                viewModel = reportsViewModel,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToReportDetail = { reportId ->
                    navController.navigate("report/$reportId")
                },
            )
        }

        composable(LlamenosRoute.DeviceLink.route) {
            DeviceLinkScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }
    }
}
