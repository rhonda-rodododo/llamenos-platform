package org.llamenos.hotline.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.llamenos.hotline.R
import org.llamenos.hotline.model.Invite

/**
 * Invites management tab in the admin panel.
 *
 * Displays all invite codes with their status (unclaimed/claimed/expired).
 * A FAB allows creating new invite codes, which are shown in a dialog
 * for sharing.
 */
@Composable
fun InvitesTab(
    viewModel: AdminViewModel,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()
    val clipboardManager = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    // Create invite dialog
    if (uiState.showCreateInviteDialog) {
        CreateInviteDialog(
            createdCode = uiState.createdInviteCode,
            onDismiss = { viewModel.dismissCreateInviteDialog() },
            onCreateVolunteer = { viewModel.createInvite("volunteer") },
            onCreateAdmin = { viewModel.createInvite("admin") },
            onCopyCode = { code ->
                clipboardManager.setText(AnnotatedString(code))
                scope.launch {
                    snackbarHostState.showSnackbar("Invite code copied")
                }
            },
        )
    }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(
                onClick = { viewModel.showCreateInviteDialog() },
                modifier = Modifier.testTag("create-invite-fab"),
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = stringResource(R.string.invite_create),
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        modifier = modifier,
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            when {
                uiState.isLoadingInvites -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("invites-loading"),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }

                uiState.invites.isEmpty() && !uiState.isLoadingInvites -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp)
                            .testTag("invites-empty"),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Link,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                            )
                            Spacer(Modifier.height(12.dp))
                            Text(
                                text = stringResource(R.string.invites_empty),
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .fillMaxSize()
                            .testTag("invites-list"),
                    ) {
                        items(
                            items = uiState.invites,
                            key = { it.id },
                        ) { invite ->
                            InviteCard(
                                invite = invite,
                                onCopyCode = { code ->
                                    clipboardManager.setText(AnnotatedString(code))
                                    scope.launch {
                                        snackbarHostState.showSnackbar("Invite code copied")
                                    }
                                },
                            )
                        }
                    }
                }
            }

            // Error
            if (uiState.invitesError != null) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                        .testTag("invites-error"),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                    ),
                ) {
                    Text(
                        text = uiState.invitesError ?: "",
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }
        }
    }
}

/**
 * Card displaying a single invite code with its status and copy action.
 */
@Composable
private fun InviteCard(
    invite: Invite,
    onCopyCode: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isClaimed = invite.claimedBy != null
    val isExpired = try {
        val expiresAt = invite.expiresAt.replace("Z", "").replace("T", " ")
        val now = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }
        val expiryTime = now.parse(expiresAt)
        expiryTime != null && expiryTime.before(java.util.Date())
    } catch (_: Exception) {
        false
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("invite-card-${invite.id}"),
        colors = CardDefaults.cardColors(
            containerColor = if (isClaimed) {
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier.weight(1f),
            ) {
                // Invite code
                Text(
                    text = invite.code,
                    style = MaterialTheme.typography.bodyMedium.copy(
                        fontFamily = FontFamily.Monospace,
                    ),
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.testTag("invite-code-${invite.id}"),
                )

                Spacer(Modifier.height(4.dp))

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Role badge
                    AssistChip(
                        onClick = {},
                        label = {
                            Text(
                                text = invite.role.replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.labelSmall,
                            )
                        },
                        modifier = Modifier
                            .height(24.dp)
                            .testTag("invite-role-${invite.id}"),
                    )

                    // Status
                    Text(
                        text = when {
                            isClaimed -> "Claimed"
                            isExpired -> "Expired"
                            else -> "Active"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = when {
                            isClaimed -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                            isExpired -> MaterialTheme.colorScheme.error
                            else -> MaterialTheme.colorScheme.primary
                        },
                        modifier = Modifier.testTag("invite-status-${invite.id}"),
                    )
                }

                Spacer(Modifier.height(2.dp))
                Text(
                    text = formatInviteDate(invite.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                )
            }

            // Copy button (only for unclaimed invites)
            if (!isClaimed) {
                IconButton(
                    onClick = { onCopyCode(invite.code) },
                    modifier = Modifier.testTag("copy-invite-${invite.id}"),
                ) {
                    Icon(
                        imageVector = Icons.Filled.ContentCopy,
                        contentDescription = stringResource(R.string.invite_share),
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }
    }
}

/**
 * Dialog for creating a new invite code.
 *
 * Shows role selection buttons, then the generated code with a copy button.
 */
@Composable
private fun CreateInviteDialog(
    createdCode: String?,
    onDismiss: () -> Unit,
    onCreateVolunteer: () -> Unit,
    onCreateAdmin: () -> Unit,
    onCopyCode: (String) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.invite_create)) },
        text = {
            Column {
                if (createdCode != null) {
                    // Show the created invite code
                    Text(
                        text = stringResource(R.string.invite_code),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                        ),
                        modifier = Modifier.testTag("created-invite-code"),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = createdCode,
                                style = MaterialTheme.typography.bodyLarge.copy(
                                    fontFamily = FontFamily.Monospace,
                                ),
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.weight(1f),
                            )
                            IconButton(
                                onClick = { onCopyCode(createdCode) },
                                modifier = Modifier.testTag("copy-created-invite"),
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.ContentCopy,
                                    contentDescription = stringResource(R.string.invite_share),
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                    }
                } else {
                    // Role selection
                    Text(
                        text = "Select role for the new volunteer:",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(16.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        TextButton(
                            onClick = onCreateVolunteer,
                            modifier = Modifier
                                .weight(1f)
                                .testTag("create-volunteer-invite"),
                        ) {
                            Text("Volunteer")
                        }
                        TextButton(
                            onClick = onCreateAdmin,
                            modifier = Modifier
                                .weight(1f)
                                .testTag("create-admin-invite"),
                        ) {
                            Text("Admin")
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.testTag("close-invite-dialog"),
            ) {
                Text(if (createdCode != null) "Done" else stringResource(android.R.string.cancel))
            }
        },
        modifier = Modifier.testTag("create-invite-dialog"),
    )
}

/**
 * Format an ISO 8601 date string for invite display.
 */
private fun formatInviteDate(isoDate: String): String {
    return try {
        val parts = isoDate.replace("T", " ").replace("Z", "").split(" ")
        if (parts.size >= 2) {
            val dateParts = parts[0].split("-")
            if (dateParts.size == 3) {
                val months = listOf(
                    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
                )
                val monthIndex = dateParts[1].toIntOrNull()?.minus(1) ?: 0
                val month = months.getOrElse(monthIndex) { "???" }
                val day = dateParts[2].toIntOrNull() ?: 0
                "$month $day, ${dateParts[0]}"
            } else {
                isoDate
            }
        } else {
            isoDate
        }
    } catch (_: Exception) {
        isoDate
    }
}
