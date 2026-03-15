package org.llamenos.hotline.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.api.VersionChecker
import org.llamenos.hotline.ui.components.UpdateBanner
import org.llamenos.hotline.ui.components.UpdateRequiredScreen
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import org.llamenos.hotline.api.NetworkMonitor
import org.llamenos.hotline.api.WebSocketService
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.crypto.KeystoreService
import org.llamenos.hotline.ui.admin.AdminScreen
import org.llamenos.hotline.ui.admin.ShiftDetailScreen
import org.llamenos.hotline.ui.admin.VolunteerDetailScreen
import org.llamenos.hotline.ui.auth.AuthViewModel
import org.llamenos.hotline.ui.calls.CallHistoryScreen
import org.llamenos.hotline.ui.calls.CallHistoryViewModel
import org.llamenos.hotline.ui.contacts.ContactsScreen
import org.llamenos.hotline.ui.contacts.ContactsViewModel
import org.llamenos.hotline.ui.contacts.ContactTimelineScreen
import org.llamenos.hotline.ui.contacts.ContactTimelineViewModel
import org.llamenos.hotline.ui.reports.ReportCreateScreen
import org.llamenos.hotline.ui.reports.ReportDetailScreen
import org.llamenos.hotline.ui.reports.ReportTypePickerScreen
import org.llamenos.hotline.ui.reports.ReportsScreen
import org.llamenos.hotline.ui.reports.ReportsViewModel
import org.llamenos.hotline.ui.reports.TypedReportCreateScreen
import org.llamenos.hotline.ui.auth.LoginScreen
import org.llamenos.hotline.ui.auth.OnboardingScreen
import org.llamenos.hotline.ui.auth.PINSetScreen
import org.llamenos.hotline.ui.auth.PINUnlockScreen
import org.llamenos.hotline.ui.conversations.ConversationDetailScreen
import org.llamenos.hotline.ui.messaging.BlastsScreen
import org.llamenos.hotline.ui.conversations.ConversationsViewModel
import org.llamenos.hotline.ui.help.HelpScreen
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

    /** Note creation form, optionally linked to a conversation or call. */
    data object NoteCreate : LlamenosRoute {
        override val route = "note_create"
        const val ROUTE_PATTERN = "note_create?conversationId={conversationId}&callId={callId}"
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

    /** Report creation form (legacy, no report type). */
    data object ReportCreate : LlamenosRoute {
        override val route = "report_create"
    }

    /** Report type picker for template-driven report creation. */
    data object ReportTypePicker : LlamenosRoute {
        override val route = "report_type_picker"
    }

    /** Typed report creation form with template fields. */
    data class TypedReportCreate(val reportTypeId: String) : LlamenosRoute {
        override val route = "typed_report_create/$reportTypeId"

        companion object {
            const val ROUTE_PATTERN = "typed_report_create/{reportTypeId}"
        }
    }

    /** Contacts list. */
    data object Contacts : LlamenosRoute {
        override val route = "contacts"
    }

    /** Report detail view. */
    data class ReportDetail(val reportId: String) : LlamenosRoute {
        override val route = "report/{reportId}"

        companion object {
            const val ROUTE_PATTERN = "report/{reportId}"
        }
    }

    /** Contact timeline view. */
    data class ContactTimeline(val contactHash: String) : LlamenosRoute {
        override val route = "contact/{contactHash}"

        companion object {
            const val ROUTE_PATTERN = "contact/{contactHash}"
        }
    }

    /** Admin panel. */
    data object Admin : LlamenosRoute {
        override val route = "admin"
    }

    /** Blasts (broadcast messages). */
    data object Blasts : LlamenosRoute {
        override val route = "blasts"
    }

    /** Help & Reference. */
    data object Help : LlamenosRoute {
        override val route = "help"
    }

    /** Volunteer detail/profile view. */
    data class VolunteerDetail(val pubkey: String) : LlamenosRoute {
        override val route = "volunteer/$pubkey"

        companion object {
            const val ROUTE_PATTERN = "volunteer/{pubkey}"
        }
    }

    /** Shift detail/assignment view. */
    data class ShiftDetail(val shiftId: String) : LlamenosRoute {
        override val route = "shift/$shiftId"

        companion object {
            const val ROUTE_PATTERN = "shift/{shiftId}"
        }
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
    versionChecker: VersionChecker,
    modifier: Modifier = Modifier,
) {
    val navController = rememberNavController()
    val authViewModel: AuthViewModel = hiltViewModel()
    val uiState by authViewModel.uiState.collectAsState()

    // Version check state
    var versionStatus by remember { mutableStateOf<VersionChecker.VersionStatus>(VersionChecker.VersionStatus.Unknown) }
    var showUpdateBanner by remember { mutableStateOf(false) }

    // Check API version compatibility on first composition
    LaunchedEffect(Unit) {
        val status = versionChecker.check()
        versionStatus = status
        when (status) {
            is VersionChecker.VersionStatus.UpdateAvailable -> showUpdateBanner = true
            else -> { /* no banner */ }
        }
    }

    // Force-update screen blocks the entire app
    if (versionStatus is VersionChecker.VersionStatus.ForceUpdate) {
        val hubUrl = keystoreService.retrieve(KeystoreService.KEY_HUB_URL) ?: ""
        UpdateRequiredScreen(hubUrl = hubUrl)
        return
    }

    // Determine start destination based on stored key presence
    val startDestination = if (uiState.hasStoredKeys) {
        LlamenosRoute.PINUnlock.route
    } else {
        LlamenosRoute.Login.route
    }

    Column(modifier = modifier) {
        // Soft-update banner (dismissible)
        if (showUpdateBanner) {
            UpdateBanner(onDismiss = { showUpdateBanner = false })
        }

    NavHost(
        navController = navController,
        startDestination = startDestination,
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
                onPanicWipe = {
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
                onNavigateToContacts = {
                    navController.navigate(LlamenosRoute.Contacts.route)
                },
                onNavigateToBlasts = {
                    navController.navigate(LlamenosRoute.Blasts.route)
                },
                onNavigateToHelp = {
                    navController.navigate(LlamenosRoute.Help.route)
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

        composable(
            LlamenosRoute.NoteCreate.ROUTE_PATTERN,
            arguments = listOf(
                navArgument("conversationId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("callId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
            ),
        ) { backStackEntry ->
            val notesViewModel: NotesViewModel = hiltViewModel()
            val conversationId = backStackEntry.arguments?.getString("conversationId")
            val callId = backStackEntry.arguments?.getString("callId")
            NoteCreateScreen(
                viewModel = notesViewModel,
                onNavigateBack = { navController.popBackStack() },
                conversationId = conversationId,
                callId = callId,
            )
        }

        composable(LlamenosRoute.ConversationDetail.ROUTE_PATTERN) {
            val conversationsViewModel: ConversationsViewModel = hiltViewModel()
            ConversationDetailScreen(
                viewModel = conversationsViewModel,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToNoteCreate = { conversationId ->
                    navController.navigate("note_create?conversationId=$conversationId")
                },
            )
        }

        composable(LlamenosRoute.Admin.route) {
            AdminScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToVolunteerDetail = { pubkey ->
                    navController.navigate("volunteer/$pubkey")
                },
                onNavigateToShiftDetail = { shiftId ->
                    navController.navigate("shift/$shiftId")
                },
            )
        }

        composable(LlamenosRoute.VolunteerDetail.ROUTE_PATTERN) { backStackEntry ->
            val pubkey = backStackEntry.arguments?.getString("pubkey") ?: ""
            VolunteerDetailScreen(
                pubkey = pubkey,
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.ShiftDetail.ROUTE_PATTERN) { backStackEntry ->
            val shiftId = backStackEntry.arguments?.getString("shiftId") ?: ""
            ShiftDetailScreen(
                shiftId = shiftId,
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.CallHistory.route) {
            val callHistoryViewModel: CallHistoryViewModel = hiltViewModel()
            CallHistoryScreen(
                viewModel = callHistoryViewModel,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToNoteCreate = { callId ->
                    navController.navigate("note_create?callId=$callId")
                },
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
                onNavigateToReportCreate = {
                    navController.navigate(LlamenosRoute.ReportCreate.route)
                },
                onNavigateToReportTypePicker = {
                    navController.navigate(LlamenosRoute.ReportTypePicker.route)
                },
            )
        }

        composable(LlamenosRoute.ReportCreate.route) {
            val reportsViewModel: ReportsViewModel = hiltViewModel()
            ReportCreateScreen(
                viewModel = reportsViewModel,
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.ReportTypePicker.route) {
            val reportsViewModel: ReportsViewModel = hiltViewModel()
            ReportTypePickerScreen(
                viewModel = reportsViewModel,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToTypedReport = { reportTypeId ->
                    navController.navigate("typed_report_create/$reportTypeId")
                },
                onNavigateToLegacyReport = {
                    navController.navigate(LlamenosRoute.ReportCreate.route)
                },
            )
        }

        composable(
            LlamenosRoute.TypedReportCreate.ROUTE_PATTERN,
            arguments = listOf(
                navArgument("reportTypeId") {
                    type = NavType.StringType
                },
            ),
        ) { backStackEntry ->
            val reportTypeId = backStackEntry.arguments?.getString("reportTypeId") ?: ""
            val reportsViewModel: ReportsViewModel = hiltViewModel()
            TypedReportCreateScreen(
                viewModel = reportsViewModel,
                reportTypeId = reportTypeId,
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.ReportDetail.ROUTE_PATTERN) {
            val reportsViewModel: ReportsViewModel = hiltViewModel()
            ReportDetailScreen(
                viewModel = reportsViewModel,
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.Contacts.route) {
            val contactsViewModel: ContactsViewModel = hiltViewModel()
            ContactsScreen(
                viewModel = contactsViewModel,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToTimeline = { contactHash ->
                    navController.navigate("contact/$contactHash")
                },
            )
        }

        composable(LlamenosRoute.ContactTimeline.ROUTE_PATTERN) { backStackEntry ->
            val contactHash = backStackEntry.arguments?.getString("contactHash") ?: ""
            val timelineViewModel: ContactTimelineViewModel = hiltViewModel()
            LaunchedEffect(contactHash) {
                timelineViewModel.loadTimeline(contactHash)
            }
            ContactTimelineScreen(
                viewModel = timelineViewModel,
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.Blasts.route) {
            BlastsScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.Help.route) {
            HelpScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }

        composable(LlamenosRoute.DeviceLink.route) {
            DeviceLinkScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }
    }
    } // Column
}
