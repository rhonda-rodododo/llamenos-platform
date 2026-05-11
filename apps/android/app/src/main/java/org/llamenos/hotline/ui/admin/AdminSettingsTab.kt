package org.llamenos.hotline.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Topic
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R
import kotlin.math.roundToInt

/**
 * Admin settings tab with transcription, report categories, telephony,
 * call settings, IVR languages, and spam mitigation configuration.
 *
 * Each section is a Material 3 Card. Settings are persisted server-side
 * via the admin API. Sections with multiple fields have explicit Save buttons.
 */
@Composable
fun AdminSettingsTab(
    viewModel: AdminViewModel,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()

    // Add Category Dialog
    if (uiState.showAddCategoryDialog) {
        AddCategoryDialog(
            onDismiss = { viewModel.dismissAddCategoryDialog() },
            onConfirm = { name -> viewModel.addReportCategory(name) },
        )
    }

    when {
        uiState.isLoadingSettings -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .testTag("admin-settings-loading"),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }

        else -> {
            Column(
                modifier = modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // --- Transcription Section ---
                TranscriptionSection(
                    transcriptionEnabled = uiState.transcriptionEnabled,
                    transcriptionOptOut = uiState.transcriptionOptOut,
                    onToggleTranscription = { viewModel.toggleTranscription(it) },
                    onToggleOptOut = { viewModel.toggleTranscriptionOptOut(it) },
                )

                // --- Report Categories Section ---
                ReportCategoriesSection(
                    categories = uiState.reportCategories,
                    isLoading = uiState.isLoadingCategories,
                    error = uiState.categoriesError,
                    onAddCategory = { viewModel.showAddCategoryDialog() },
                    onDeleteCategory = { viewModel.deleteReportCategory(it) },
                )

                // --- Telephony Section ---
                TelephonySection(
                    provider = uiState.telephonyProvider,
                    accountSid = uiState.telephonyAccountSid,
                    authToken = uiState.telephonyAuthToken,
                    phoneNumber = uiState.telephonyPhoneNumber,
                    isLoading = uiState.isLoadingTelephony,
                    error = uiState.telephonyError,
                    onProviderChange = { viewModel.updateTelephonyProvider(it) },
                    onAccountSidChange = { viewModel.updateTelephonyAccountSid(it) },
                    onAuthTokenChange = { viewModel.updateTelephonyAuthToken(it) },
                    onPhoneNumberChange = { viewModel.updateTelephonyPhoneNumber(it) },
                    onSave = { viewModel.saveTelephonySettings() },
                )

                // --- Call Settings Section ---
                CallSettingsSection(
                    ringTimeout = uiState.ringTimeout,
                    maxCallDuration = uiState.maxCallDuration,
                    parallelRingCount = uiState.parallelRingCount,
                    isLoading = uiState.isLoadingCallSettings,
                    error = uiState.callSettingsError,
                    onRingTimeoutChange = { viewModel.updateRingTimeout(it) },
                    onMaxCallDurationChange = { viewModel.updateMaxCallDuration(it) },
                    onParallelRingCountChange = { viewModel.updateParallelRingCount(it) },
                    onSave = { viewModel.saveCallSettings() },
                )

                // --- IVR Languages Section ---
                IvrLanguagesSection(
                    languages = uiState.ivrLanguages,
                    isLoading = uiState.isLoadingIvrLanguages,
                    error = uiState.ivrLanguagesError,
                    onToggleLanguage = { code, enabled -> viewModel.toggleIvrLanguage(code, enabled) },
                    onSave = { viewModel.saveIvrLanguages() },
                )

                // --- Spam Settings Section ---
                SpamSettingsSection(
                    maxCallsPerHour = uiState.maxCallsPerHour,
                    voiceCaptchaEnabled = uiState.voiceCaptchaEnabled,
                    knownNumberBypass = uiState.knownNumberBypass,
                    isLoading = uiState.isLoadingSpamSettings,
                    error = uiState.spamSettingsError,
                    onMaxCallsPerHourChange = { viewModel.updateMaxCallsPerHour(it) },
                    onToggleVoiceCaptcha = { viewModel.toggleVoiceCaptcha(it) },
                    onToggleKnownNumberBypass = { viewModel.toggleKnownNumberBypass(it) },
                    onSave = { viewModel.saveSpamSettings() },
                )

                // Global error
                if (uiState.settingsError != null) {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("admin-settings-error"),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                    ) {
                        Text(
                            text = uiState.settingsError ?: "",
                            modifier = Modifier.padding(16.dp),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                        )
                    }
                }
            }
        }
    }
}

// ---- Transcription Section ----

@Composable
internal fun TranscriptionSection(
    transcriptionEnabled: Boolean,
    transcriptionOptOut: Boolean,
    onToggleTranscription: (Boolean) -> Unit,
    onToggleOptOut: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("admin-transcription-card"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            SectionHeader(
                icon = Icons.Filled.Mic,
                title = stringResource(R.string.settings_transcription),
            )

            Spacer(Modifier.height(16.dp))

            SettingsToggleRow(
                title = stringResource(R.string.admin_transcription_enabled),
                description = stringResource(R.string.admin_transcription_enabled_desc),
                checked = transcriptionEnabled,
                onCheckedChange = onToggleTranscription,
                testTag = "transcription-enabled-toggle",
            )

            Spacer(Modifier.height(12.dp))

            SettingsToggleRow(
                title = stringResource(R.string.admin_transcription_optout),
                description = stringResource(R.string.admin_transcription_optout_desc),
                checked = transcriptionOptOut,
                onCheckedChange = onToggleOptOut,
                testTag = "transcription-optout-toggle",
            )
        }
    }
}

// ---- Report Categories Section ----

@Composable
internal fun ReportCategoriesSection(
    categories: List<org.llamenos.hotline.model.ReportCategory>,
    isLoading: Boolean,
    error: String?,
    onAddCategory: () -> Unit,
    onDeleteCategory: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("admin-report-categories-card"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                SectionHeader(
                    icon = Icons.Filled.Topic,
                    title = stringResource(R.string.admin_report_categories),
                )
                IconButton(
                    onClick = onAddCategory,
                    modifier = Modifier.testTag("add-category-button"),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = stringResource(R.string.admin_report_category_add),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }

            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                }
            } else if (categories.isEmpty()) {
                Text(
                    text = stringResource(R.string.admin_report_category_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            } else {
                categories.forEach { category ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("category-item-${category.id}"),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = category.name,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(
                            onClick = { onDeleteCategory(category.id) },
                            modifier = Modifier.testTag("delete-category-${category.id}"),
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Delete,
                                contentDescription = stringResource(R.string.admin_report_category_delete_confirm),
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                    HorizontalDivider()
                }
            }

            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

// ---- Telephony Section ----

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TelephonySection(
    provider: String,
    accountSid: String,
    authToken: String,
    phoneNumber: String,
    isLoading: Boolean,
    error: String?,
    onProviderChange: (String) -> Unit,
    onAccountSidChange: (String) -> Unit,
    onAuthTokenChange: (String) -> Unit,
    onPhoneNumberChange: (String) -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val providers = listOf("twilio", "signalwire", "vonage", "plivo", "asterisk")
    val providerLabels = mapOf(
        "twilio" to "Twilio",
        "signalwire" to "SignalWire",
        "vonage" to "Vonage",
        "plivo" to "Plivo",
        "asterisk" to "Asterisk",
    )
    var expanded by remember { mutableStateOf(false) }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("admin-telephony-card"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            SectionHeader(
                icon = Icons.Filled.Phone,
                title = stringResource(R.string.admin_telephony_settings),
            )

            Spacer(Modifier.height(12.dp))

            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                }
            } else {
                // Provider dropdown
                ExposedDropdownMenuBox(
                    expanded = expanded,
                    onExpandedChange = { expanded = it },
                ) {
                    OutlinedTextField(
                        value = providerLabels[provider] ?: provider,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.admin_telephony_provider)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            .testTag("telephony-provider-select"),
                    )
                    ExposedDropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false },
                    ) {
                        providers.forEach { p ->
                            DropdownMenuItem(
                                text = { Text(providerLabels[p] ?: p) },
                                onClick = {
                                    onProviderChange(p)
                                    expanded = false
                                },
                            )
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))

                OutlinedTextField(
                    value = accountSid,
                    onValueChange = onAccountSidChange,
                    label = { Text(stringResource(R.string.admin_telephony_account_sid)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("telephony-account-sid"),
                )

                Spacer(Modifier.height(8.dp))

                OutlinedTextField(
                    value = authToken,
                    onValueChange = onAuthTokenChange,
                    label = { Text(stringResource(R.string.admin_telephony_auth_token)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("telephony-auth-token"),
                )

                Spacer(Modifier.height(8.dp))

                OutlinedTextField(
                    value = phoneNumber,
                    onValueChange = onPhoneNumberChange,
                    label = { Text(stringResource(R.string.admin_telephony_phone_number)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("telephony-phone-number"),
                )

                Spacer(Modifier.height(12.dp))

                Button(
                    onClick = onSave,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("telephony-save-button"),
                ) {
                    Text(stringResource(R.string.action_save))
                }
            }

            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

// ---- Call Settings Section ----

@Composable
internal fun CallSettingsSection(
    ringTimeout: Int,
    maxCallDuration: Int,
    parallelRingCount: Int,
    isLoading: Boolean,
    error: String?,
    onRingTimeoutChange: (Int) -> Unit,
    onMaxCallDurationChange: (Int) -> Unit,
    onParallelRingCountChange: (Int) -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("admin-call-settings-card"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            SectionHeader(
                icon = Icons.Filled.Call,
                title = stringResource(R.string.admin_call_settings),
            )

            Spacer(Modifier.height(12.dp))

            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                }
            } else {
                // Ring timeout slider (15-60s)
                SliderSetting(
                    label = stringResource(R.string.admin_call_ring_timeout),
                    value = ringTimeout.toFloat(),
                    valueRange = 15f..60f,
                    steps = 8,
                    valueLabel = stringResource(R.string.admin_seconds_unit, ringTimeout),
                    onValueChange = { onRingTimeoutChange(it.roundToInt()) },
                    testTag = "ring-timeout-slider",
                )

                Spacer(Modifier.height(12.dp))

                // Max call duration slider (5-120 min)
                SliderSetting(
                    label = stringResource(R.string.admin_call_max_duration),
                    value = maxCallDuration.toFloat(),
                    valueRange = 5f..120f,
                    steps = 22,
                    valueLabel = stringResource(R.string.admin_minutes_unit, maxCallDuration),
                    onValueChange = { onMaxCallDurationChange(it.roundToInt()) },
                    testTag = "max-call-duration-slider",
                )

                Spacer(Modifier.height(12.dp))

                // Parallel ring count slider (1-10)
                SliderSetting(
                    label = stringResource(R.string.admin_call_parallel_ring),
                    value = parallelRingCount.toFloat(),
                    valueRange = 1f..10f,
                    steps = 8,
                    valueLabel = parallelRingCount.toString(),
                    onValueChange = { onParallelRingCountChange(it.roundToInt()) },
                    testTag = "parallel-ring-count-slider",
                )

                Spacer(Modifier.height(12.dp))

                Button(
                    onClick = onSave,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("call-settings-save-button"),
                ) {
                    Text(stringResource(R.string.action_save))
                }
            }

            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

// ---- IVR Languages Section ----

/**
 * All 13 supported IVR languages with their codes and native labels.
 */
internal val IVR_LANGUAGE_LIST = listOf(
    "en" to "English",
    "es" to "Espa\u00f1ol",
    "zh" to "\u4e2d\u6587",
    "tl" to "Tagalog",
    "vi" to "Ti\u1ebfng Vi\u1ec7t",
    "ar" to "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
    "fr" to "Fran\u00e7ais",
    "ht" to "Krey\u00f2l Ayisyen",
    "ko" to "\ud55c\uad6d\uc5b4",
    "ru" to "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
    "hi" to "\u0939\u093f\u0928\u094d\u0926\u0940",
    "pt" to "Portugu\u00eas",
    "de" to "Deutsch",
)

@Composable
internal fun IvrLanguagesSection(
    languages: Map<String, Boolean>,
    isLoading: Boolean,
    error: String?,
    onToggleLanguage: (String, Boolean) -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("admin-ivr-languages-card"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            SectionHeader(
                icon = Icons.Filled.Language,
                title = stringResource(R.string.admin_ivr_settings),
            )

            Spacer(Modifier.height(12.dp))

            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                }
            } else {
                IVR_LANGUAGE_LIST.forEach { (code, label) ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("ivr-language-$code"),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = "$label ($code)",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        Switch(
                            checked = languages[code] ?: false,
                            onCheckedChange = { onToggleLanguage(code, it) },
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                Button(
                    onClick = onSave,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("ivr-languages-save-button"),
                ) {
                    Text(stringResource(R.string.action_save))
                }
            }

            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

// ---- Spam Settings Section ----

@Composable
internal fun SpamSettingsSection(
    maxCallsPerHour: Int,
    voiceCaptchaEnabled: Boolean,
    knownNumberBypass: Boolean,
    isLoading: Boolean,
    error: String?,
    onMaxCallsPerHourChange: (Int) -> Unit,
    onToggleVoiceCaptcha: (Boolean) -> Unit,
    onToggleKnownNumberBypass: (Boolean) -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("admin-spam-settings-card"),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            SectionHeader(
                icon = Icons.Filled.Shield,
                title = stringResource(R.string.admin_spam_settings),
            )

            Spacer(Modifier.height(12.dp))

            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                }
            } else {
                // Max calls per hour slider (1-100)
                SliderSetting(
                    label = stringResource(R.string.admin_spam_max_calls),
                    value = maxCallsPerHour.toFloat(),
                    valueRange = 1f..100f,
                    steps = 98,
                    valueLabel = maxCallsPerHour.toString(),
                    onValueChange = { onMaxCallsPerHourChange(it.roundToInt()) },
                    testTag = "max-calls-per-hour-slider",
                )

                Spacer(Modifier.height(12.dp))

                SettingsToggleRow(
                    title = stringResource(R.string.admin_spam_captcha),
                    description = stringResource(R.string.admin_spam_captcha_desc),
                    checked = voiceCaptchaEnabled,
                    onCheckedChange = onToggleVoiceCaptcha,
                    testTag = "voice-captcha-toggle",
                )

                Spacer(Modifier.height(12.dp))

                SettingsToggleRow(
                    title = stringResource(R.string.admin_spam_known_bypass),
                    description = stringResource(R.string.admin_spam_known_bypass_desc),
                    checked = knownNumberBypass,
                    onCheckedChange = onToggleKnownNumberBypass,
                    testTag = "known-number-bypass-toggle",
                )

                Spacer(Modifier.height(12.dp))

                Button(
                    onClick = onSave,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("spam-settings-save-button"),
                ) {
                    Text(stringResource(R.string.action_save))
                }
            }

            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

// ---- Shared Composables ----

@Composable
internal fun SectionHeader(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    modifier: Modifier = Modifier,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
internal fun SettingsToggleRow(
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    testTag: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .testTag(testTag),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
        )
    }
}

@Composable
internal fun SliderSetting(
    label: String,
    value: Float,
    valueRange: ClosedFloatingPointRange<Float>,
    steps: Int,
    valueLabel: String,
    onValueChange: (Float) -> Unit,
    testTag: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = valueLabel,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        Slider(
            value = value,
            onValueChange = onValueChange,
            valueRange = valueRange,
            steps = steps,
            modifier = Modifier.testTag(testTag),
        )
    }
}

// ---- Add Category Dialog ----

@Composable
internal fun AddCategoryDialog(
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var name by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.admin_report_category_add)) },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(stringResource(R.string.admin_report_category_name)) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("category-name-input"),
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(name) },
                enabled = name.isNotBlank(),
                modifier = Modifier.testTag("confirm-add-category"),
            ) {
                Text(stringResource(R.string.action_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(android.R.string.cancel))
            }
        },
    )
}
