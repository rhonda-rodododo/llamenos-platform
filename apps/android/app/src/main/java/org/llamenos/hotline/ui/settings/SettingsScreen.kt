package org.llamenos.hotline.ui.settings

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.NavigateNext
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.Switch
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.llamenos.hotline.BuildConfig
import org.llamenos.hotline.R
import org.llamenos.hotline.api.WebSocketService

/**
 * Settings screen with collapsible sections for profile, identity, theme, and more.
 *
 * Organized into default/operational settings visible to all users,
 * with an Advanced Settings section for technical configuration.
 */
@Composable
fun SettingsScreen(
    npub: String,
    hubUrl: String,
    connectionState: WebSocketService.ConnectionState,
    displayName: String,
    phone: String,
    selectedTheme: String,
    onUpdateProfile: (name: String, phone: String) -> Unit,
    onThemeChange: (String) -> Unit,
    notifyCalls: Boolean,
    notifyShifts: Boolean,
    notifyGeneral: Boolean,
    onNotifyCallsChange: (Boolean) -> Unit,
    onNotifyShiftsChange: (Boolean) -> Unit,
    onNotifyGeneralChange: (Boolean) -> Unit,
    onLock: () -> Unit,
    onLogout: () -> Unit,
    onPanicWipe: () -> Unit,
    onNavigateToAdmin: () -> Unit,
    onNavigateToDeviceLink: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showLogoutDialog by remember { mutableStateOf(false) }
    var showPanicWipeDialog by remember { mutableStateOf(false) }
    val clipboardManager = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val copiedMessage = stringResource(R.string.settings_npub_copied)
    val profileUpdatedMessage = stringResource(R.string.profile_updated)

    // Profile form state
    var editDisplayName by rememberSaveable { mutableStateOf(displayName) }
    var editPhone by rememberSaveable { mutableStateOf(phone) }

    // Section expansion state
    var profileExpanded by rememberSaveable { mutableStateOf(true) }
    var identityExpanded by rememberSaveable { mutableStateOf(false) }
    var themeExpanded by rememberSaveable { mutableStateOf(false) }
    var keyBackupExpanded by rememberSaveable { mutableStateOf(false) }
    var notificationsExpanded by rememberSaveable { mutableStateOf(false) }
    var hubExpanded by rememberSaveable { mutableStateOf(false) }
    var advancedExpanded by rememberSaveable { mutableStateOf(false) }

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text(stringResource(R.string.logout)) },
            text = {
                Text(stringResource(R.string.settings_logout_confirm_message))
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutDialog = false
                        onLogout()
                    },
                    modifier = Modifier.testTag("confirm-logout-button"),
                ) {
                    Text(
                        text = stringResource(R.string.logout),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showLogoutDialog = false },
                    modifier = Modifier.testTag("cancel-logout-button"),
                ) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
            modifier = Modifier.testTag("logout-confirmation-dialog"),
        )
    }

    if (showPanicWipeDialog) {
        AlertDialog(
            onDismissRequest = { showPanicWipeDialog = false },
            icon = {
                Icon(
                    imageVector = Icons.Filled.Warning,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(32.dp),
                )
            },
            title = { Text(stringResource(R.string.panic_wipe_title)) },
            text = {
                Text(stringResource(R.string.panic_wipe_message))
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showPanicWipeDialog = false
                        onPanicWipe()
                    },
                    modifier = Modifier.testTag("confirm-panic-wipe-button"),
                ) {
                    Text(
                        text = stringResource(R.string.panic_wipe_title),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showPanicWipeDialog = false },
                    modifier = Modifier.testTag("cancel-panic-wipe-button"),
                ) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
            modifier = Modifier.testTag("panic-wipe-dialog"),
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        modifier = modifier,
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // ---- Profile section (collapsible) ----
            SettingsSection(
                title = stringResource(R.string.settings_profile),
                expanded = profileExpanded,
                onToggle = { profileExpanded = !profileExpanded },
                testTag = "settings-profile-section",
            ) {
                OutlinedTextField(
                    value = editDisplayName,
                    onValueChange = { editDisplayName = it },
                    label = { Text(stringResource(R.string.settings_display_name)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings-display-name-input"),
                )

                Spacer(Modifier.height(8.dp))

                OutlinedTextField(
                    value = editPhone,
                    onValueChange = { editPhone = it },
                    label = { Text(stringResource(R.string.settings_phone)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings-phone-input"),
                )

                Spacer(Modifier.height(8.dp))

                // npub display
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = npub,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = FontFamily.Monospace,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .weight(1f)
                            .testTag("settings-npub"),
                    )
                    IconButton(
                        onClick = {
                            clipboardManager.setText(AnnotatedString(npub))
                            scope.launch {
                                snackbarHostState.showSnackbar(copiedMessage)
                            }
                        },
                        modifier = Modifier.testTag("copy-npub-button"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.ContentCopy,
                            contentDescription = stringResource(R.string.settings_copy_npub),
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }

                Spacer(Modifier.height(8.dp))

                Button(
                    onClick = {
                        onUpdateProfile(editDisplayName, editPhone)
                        scope.launch {
                            snackbarHostState.showSnackbar(profileUpdatedMessage)
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings-update-profile-button"),
                ) {
                    Text(stringResource(R.string.profile_update))
                }
            }

            // ---- Theme section (collapsible) ----
            SettingsSection(
                title = stringResource(R.string.settings_theme),
                expanded = themeExpanded,
                onToggle = { themeExpanded = !themeExpanded },
                testTag = "settings-theme-section",
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ThemeButton(
                        label = stringResource(R.string.settings_theme_light),
                        icon = Icons.Filled.LightMode,
                        selected = selectedTheme == "light",
                        onClick = { onThemeChange("light") },
                        testTag = "theme-light-button",
                        modifier = Modifier.weight(1f),
                    )
                    ThemeButton(
                        label = stringResource(R.string.settings_theme_dark),
                        icon = Icons.Filled.DarkMode,
                        selected = selectedTheme == "dark",
                        onClick = { onThemeChange("dark") },
                        testTag = "theme-dark-button",
                        modifier = Modifier.weight(1f),
                    )
                    ThemeButton(
                        label = stringResource(R.string.settings_theme_system),
                        icon = Icons.Filled.PhoneAndroid,
                        selected = selectedTheme == "system",
                        onClick = { onThemeChange("system") },
                        testTag = "theme-system-button",
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // ---- Key Backup section (collapsible) ----
            SettingsSection(
                title = stringResource(R.string.settings_key_backup),
                expanded = keyBackupExpanded,
                onToggle = { keyBackupExpanded = !keyBackupExpanded },
                testTag = "settings-key-backup-section",
            ) {
                Text(
                    text = stringResource(R.string.settings_key_backup_desc),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Spacer(Modifier.height(8.dp))

                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f),
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("key-backup-warning"),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Key,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.settings_key_backup_warning),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                    }
                }
            }

            // ---- Notifications section (collapsible) ----
            SettingsSection(
                title = stringResource(R.string.settings_notifications),
                expanded = notificationsExpanded,
                onToggle = { notificationsExpanded = !notificationsExpanded },
                testTag = "settings-notifications-section",
            ) {
                Text(
                    text = stringResource(R.string.settings_notifications_desc),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Spacer(Modifier.height(8.dp))

                NotificationToggle(
                    label = stringResource(R.string.settings_notify_calls),
                    checked = notifyCalls,
                    onCheckedChange = onNotifyCallsChange,
                    testTag = "notify-calls-toggle",
                )
                NotificationToggle(
                    label = stringResource(R.string.settings_notify_shifts),
                    checked = notifyShifts,
                    onCheckedChange = onNotifyShiftsChange,
                    testTag = "notify-shifts-toggle",
                )
                NotificationToggle(
                    label = stringResource(R.string.settings_notify_general),
                    checked = notifyGeneral,
                    onCheckedChange = onNotifyGeneralChange,
                    testTag = "notify-general-toggle",
                )
            }

            // ---- Identity / Hub section (collapsible) ----
            SettingsSection(
                title = stringResource(R.string.settings_hub),
                expanded = hubExpanded,
                onToggle = { hubExpanded = !hubExpanded },
                testTag = "settings-hub-section",
            ) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("settings-hub-card"),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    ),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                    ) {
                        if (hubUrl.isNotEmpty()) {
                            Text(
                                text = hubUrl,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.testTag("settings-hub-url"),
                            )
                            Spacer(Modifier.height(8.dp))
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val (statusColor, statusText) = when (connectionState) {
                                WebSocketService.ConnectionState.CONNECTED ->
                                    MaterialTheme.colorScheme.primary to stringResource(R.string.status_connected)
                                WebSocketService.ConnectionState.CONNECTING ->
                                    MaterialTheme.colorScheme.tertiary to stringResource(R.string.status_connecting)
                                WebSocketService.ConnectionState.RECONNECTING ->
                                    MaterialTheme.colorScheme.tertiary to stringResource(R.string.status_reconnecting)
                                WebSocketService.ConnectionState.DISCONNECTED ->
                                    MaterialTheme.colorScheme.error to stringResource(R.string.status_disconnected)
                            }

                            Icon(
                                imageVector = Icons.Filled.Circle,
                                contentDescription = null,
                                tint = statusColor,
                                modifier = Modifier.size(10.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = statusText,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.testTag("settings-connection-status"),
                            )
                        }
                    }
                }
            }

            // ---- Identity card ----
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("settings-identity-card"),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                ),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                ) {
                    Text(
                        text = stringResource(R.string.settings_identity),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = npub,
                        style = MaterialTheme.typography.bodySmall.copy(
                            fontFamily = FontFamily.Monospace,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            // ---- Navigation cards ----

            // Device link
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onNavigateToDeviceLink)
                    .testTag("settings-device-link-card"),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                ),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Link,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp),
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.settings_link_device),
                            style = MaterialTheme.typography.titleSmall,
                        )
                        Text(
                            text = stringResource(R.string.settings_device_link_desc),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Icon(
                        imageVector = Icons.Filled.NavigateNext,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Admin panel
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onNavigateToAdmin)
                    .testTag("settings-admin-card"),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant,
                ),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.AdminPanelSettings,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp),
                    )
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.settings_admin),
                            style = MaterialTheme.typography.titleSmall,
                        )
                        Text(
                            text = stringResource(R.string.settings_admin_desc),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Icon(
                        imageVector = Icons.Filled.NavigateNext,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // ---- Advanced Settings (collapsible) ----
            SettingsSection(
                title = stringResource(R.string.settings_advanced),
                expanded = advancedExpanded,
                onToggle = { advancedExpanded = !advancedExpanded },
                testTag = "settings-advanced-section",
            ) {
                Text(
                    text = stringResource(R.string.settings_advanced_desc),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            HorizontalDivider()

            // Lock app button
            Button(
                onClick = onLock,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("settings-lock-button"),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                ),
            ) {
                Icon(Icons.Filled.Lock, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.lock_app))
            }

            // Logout button
            Button(
                onClick = { showLogoutDialog = true },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("settings-logout-button"),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                ),
            ) {
                Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.logout))
            }

            // Emergency wipe
            Button(
                onClick = { showPanicWipeDialog = true },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("settings-panic-wipe-button"),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
            ) {
                Icon(Icons.Filled.Warning, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.panic_wipe_title))
            }

            // App version
            Spacer(Modifier.height(16.dp))
            Text(
                text = "${stringResource(R.string.settings_version)}: ${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .testTag("settings-version"),
            )
        }
    }
}

/**
 * Reusable collapsible settings section with animated expand/collapse.
 */
@Composable
private fun SettingsSection(
    title: String,
    expanded: Boolean,
    onToggle: () -> Unit,
    testTag: String,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag(testTag),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggle)
                    .padding(16.dp)
                    .testTag("$testTag-header"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                    contentDescription = stringResource(
                        if (expanded) R.string.settings_collapse else R.string.settings_expand,
                    ),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically(),
                exit = shrinkVertically(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
                ) {
                    content()
                }
            }
        }
    }
}

/**
 * Theme selection button (light/dark/system).
 */
@Composable
private fun ThemeButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
    testTag: String,
    modifier: Modifier = Modifier,
) {
    if (selected) {
        FilledTonalButton(
            onClick = onClick,
            modifier = modifier.testTag(testTag),
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(4.dp))
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    } else {
        OutlinedButton(
            onClick = onClick,
            modifier = modifier.testTag(testTag),
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(4.dp))
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}

/**
 * Notification toggle row with label and switch.
 */
@Composable
private fun NotificationToggle(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    testTag: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .testTag(testTag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
        )
    }
}
