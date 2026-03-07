package org.llamenos.hotline.ui.admin

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.R

/**
 * Admin panel screen with tabbed sections for managing the hotline.
 *
 * Contains four tabs: Volunteers, Ban List, Audit Log, and Invites.
 * Only accessible to users with admin permissions. Each tab loads its
 * data lazily on first selection.
 *
 * @param onNavigateBack Callback to navigate back to settings
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminScreen(
    onNavigateBack: () -> Unit,
    onNavigateToVolunteerDetail: (String) -> Unit = {},
    onNavigateToShiftDetail: (String) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: AdminViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.admin_title),
                        modifier = Modifier.testTag("admin-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.testTag("admin-back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.nav_dashboard),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                ),
            )
        },
        modifier = modifier,
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            // Tab row — scrollable to fit 5 tabs on narrow screens
            ScrollableTabRow(
                selectedTabIndex = uiState.selectedTab.ordinal,
                modifier = Modifier.testTag("admin-tabs"),
                edgePadding = 0.dp,
            ) {
                AdminTab.entries.forEach { tab ->
                    Tab(
                        selected = uiState.selectedTab == tab,
                        onClick = { viewModel.selectTab(tab) },
                        text = {
                            Text(
                                text = when (tab) {
                                    AdminTab.VOLUNTEERS -> stringResource(R.string.admin_volunteers)
                                    AdminTab.BANS -> stringResource(R.string.admin_bans)
                                    AdminTab.AUDIT -> stringResource(R.string.admin_audit)
                                    AdminTab.INVITES -> stringResource(R.string.admin_invites)
                                    AdminTab.FIELDS -> stringResource(R.string.admin_fields)
                                    AdminTab.SHIFTS -> stringResource(R.string.shifts_schedule)
                                    AdminTab.SETTINGS -> stringResource(R.string.settings_title)
                                },
                            )
                        },
                        modifier = Modifier.testTag("admin-tab-${tab.name.lowercase()}"),
                    )
                }
            }

            // Tab content
            when (uiState.selectedTab) {
                AdminTab.VOLUNTEERS -> VolunteersTab(
                    viewModel = viewModel,
                    onNavigateToVolunteerDetail = onNavigateToVolunteerDetail,
                )
                AdminTab.BANS -> BanListTab(viewModel = viewModel)
                AdminTab.AUDIT -> AuditLogTab(viewModel = viewModel)
                AdminTab.INVITES -> InvitesTab(viewModel = viewModel)
                AdminTab.FIELDS -> CustomFieldsTab(viewModel = viewModel)
                AdminTab.SHIFTS -> ShiftScheduleTab(
                    viewModel = viewModel,
                    onNavigateToShiftDetail = onNavigateToShiftDetail,
                )
                AdminTab.SETTINGS -> AdminSettingsTab(viewModel = viewModel)
            }
        }
    }
}
