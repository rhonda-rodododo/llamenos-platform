package org.llamenos.hotline.ui.cases

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Comment
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.LinkOff
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.model.CaseInteraction
import org.llamenos.hotline.model.CaseRecord
import org.llamenos.hotline.model.EntityFieldDefinition
import org.llamenos.hotline.model.EntityTypeDefinition
import org.llamenos.hotline.model.EvidenceItem
import org.llamenos.hotline.model.RecordContact
import org.llamenos.hotline.util.DateFormatUtils

/**
 * Case detail screen showing record information across four tabs:
 * Details, Timeline, Contacts, and Evidence.
 *
 * The header shows the case number, entity type, and a status pill
 * that opens the quick status change sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CaseDetailScreen(
    viewModel: CaseManagementViewModel,
    recordId: String,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()

    val isNewCase = recordId == "new"

    // Load the record on entry
    LaunchedEffect(recordId) {
        if (!isNewCase) {
            viewModel.selectRecord(recordId)
        }
    }

    var showStatusSheet by remember { mutableStateOf(false) }
    var showCommentSheet by remember { mutableStateOf(false) }

    val record = uiState.selectedRecord
    val entityType = uiState.selectedEntityType

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = if (isNewCase && record == null) "New Case"
                            else record?.caseNumber ?: record?.id?.take(8) ?: "Case",
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.testTag("case-detail-header"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            viewModel.clearSelection()
                            onNavigateBack()
                        },
                        modifier = Modifier.testTag("case-detail-back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        modifier = modifier,
    ) { paddingValues ->
        when {
            uiState.isLoadingDetail && !isNewCase -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(48.dp)
                            .testTag("case-detail-loading"),
                    )
                }
            }

            uiState.detailError != null && !isNewCase -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = uiState.detailError ?: "Error",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.testTag("case-detail-error"),
                    )
                }
            }

            record != null || isNewCase -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues),
                ) {
                    // Status pill + entity type header
                    CaseDetailHeader(
                        record = record,
                        entityType = entityType,
                        isNewCase = isNewCase,
                        onStatusClick = { showStatusSheet = true },
                    )

                    // Tab row
                    val tabs = CaseDetailTab.entries
                    val selectedTabIndex = tabs.indexOf(uiState.activeTab)

                    TabRow(
                        selectedTabIndex = selectedTabIndex,
                    ) {
                        tabs.forEach { tab ->
                            Tab(
                                selected = uiState.activeTab == tab,
                                onClick = { viewModel.setActiveTab(tab) },
                                text = {
                                    Text(
                                        text = when (tab) {
                                            CaseDetailTab.DETAILS -> "Details"
                                            CaseDetailTab.TIMELINE -> "Timeline"
                                            CaseDetailTab.CONTACTS -> "Contacts"
                                            CaseDetailTab.EVIDENCE -> "Evidence"
                                        },
                                    )
                                },
                                modifier = Modifier.testTag(
                                    when (tab) {
                                        CaseDetailTab.DETAILS -> "case-tab-details"
                                        CaseDetailTab.TIMELINE -> "case-tab-timeline"
                                        CaseDetailTab.CONTACTS -> "case-tab-contacts"
                                        CaseDetailTab.EVIDENCE -> "case-tab-evidence"
                                    },
                                ),
                            )
                        }
                    }

                    // Tab content
                    if (record != null) {
                        when (uiState.activeTab) {
                            CaseDetailTab.DETAILS -> DetailsTab(
                                record = record,
                                entityType = entityType,
                                onAssignToMe = { viewModel.assignToMe(record.id) },
                                isAssigning = uiState.isAssigning,
                            )
                            CaseDetailTab.TIMELINE -> TimelineTab(
                                interactions = uiState.interactions,
                                isLoading = uiState.isLoadingInteractions,
                                error = uiState.interactionsError,
                                entityType = entityType,
                                onAddComment = { showCommentSheet = true },
                            )
                            CaseDetailTab.CONTACTS -> ContactsTab(
                                contacts = uiState.contacts,
                                isLoading = uiState.isLoadingContacts,
                                error = uiState.contactsError,
                                entityType = entityType,
                            )
                            CaseDetailTab.EVIDENCE -> EvidenceTab(
                                evidence = uiState.evidence,
                                isLoading = uiState.isLoadingEvidence,
                                error = uiState.evidenceError,
                            )
                        }
                    } else {
                        // New case — show empty form state
                        NewCaseContent(
                            activeTab = uiState.activeTab,
                        )
                    }

                    // Error snackbar
                    if (uiState.actionError != null) {
                        Text(
                            text = uiState.actionError ?: "",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier
                                .padding(16.dp)
                                .testTag("case-detail-action-error"),
                        )
                    }
                }
            }
        }
    }

    // Quick status change sheet
    if (showStatusSheet && record != null && entityType != null) {
        QuickStatusSheet(
            entityType = entityType,
            currentStatusHash = record.statusHash,
            onStatusSelected = { statusHash ->
                viewModel.updateStatus(record.id, statusHash)
                showStatusSheet = false
            },
            onDismiss = { showStatusSheet = false },
        )
    }

    // Add comment sheet
    if (showCommentSheet && record != null) {
        AddCommentSheet(
            onSubmit = { comment ->
                viewModel.addComment(record.id, comment)
                showCommentSheet = false
            },
            onDismiss = { showCommentSheet = false },
            isSubmitting = uiState.isAddingComment,
        )
    }
}

// ---- Header ----

@Composable
private fun CaseDetailHeader(
    record: CaseRecord?,
    entityType: EntityTypeDefinition?,
    isNewCase: Boolean = false,
    onStatusClick: () -> Unit,
) {
    val statusOption = record?.let { r ->
        entityType?.statuses?.find { it.value == r.statusHash }
    }
    val statusLabel = statusOption?.label ?: record?.statusHash ?: if (isNewCase) "New" else "—"
    val statusColor = statusOption?.color?.let { parseHexColor(it) }

    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        // Entity type label
        if (entityType != null) {
            Text(
                text = entityType.label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else if (isNewCase) {
            Text(
                text = "New Case",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Spacer(Modifier.weight(1f))

        // Status pill button
        OutlinedButton(
            onClick = onStatusClick,
            enabled = record != null,
            modifier = Modifier.testTag("case-status-pill"),
        ) {
            if (statusColor != null) {
                Icon(
                    imageVector = Icons.Filled.Circle,
                    contentDescription = null,
                    tint = statusColor,
                    modifier = Modifier.size(8.dp),
                )
                Spacer(Modifier.width(6.dp))
            }
            Text(
                text = statusLabel,
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}

// ---- New Case Content ----

/**
 * Placeholder content shown when creating a new case.
 * Renders the appropriate empty state for each tab.
 */
@Composable
private fun NewCaseContent(
    activeTab: CaseDetailTab,
) {
    when (activeTab) {
        CaseDetailTab.DETAILS -> {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = "New Case",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            text = "Connect to a hub to create cases",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                // Assign button placeholder
                Button(
                    onClick = { },
                    enabled = false,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("case-assign-btn"),
                ) {
                    Text("Assign to me")
                }
            }
        }
        CaseDetailTab.TIMELINE -> TimelineTab(
            interactions = emptyList(),
            isLoading = false,
            error = null,
            entityType = null,
            onAddComment = { },
        )
        CaseDetailTab.CONTACTS -> ContactsTab(
            contacts = emptyList(),
            isLoading = false,
            error = null,
            entityType = null,
        )
        CaseDetailTab.EVIDENCE -> EvidenceTab(
            evidence = emptyList(),
            isLoading = false,
            error = null,
        )
    }
}

// ---- Details Tab ----

@Composable
private fun DetailsTab(
    record: CaseRecord,
    entityType: EntityTypeDefinition?,
    onAssignToMe: () -> Unit,
    isAssigning: Boolean,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Summary section
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
            ),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "Summary",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                )
                // Case number
                if (record.caseNumber != null) {
                    DetailRow(label = "Case Number", value = record.caseNumber)
                }
                // Created at
                DetailRow(label = "Created", value = DateFormatUtils.formatDateVerbose(record.createdAt))
                // Updated at
                DetailRow(label = "Updated", value = DateFormatUtils.formatDateVerbose(record.updatedAt))
                // Assignment
                if (record.assignedTo.isNotEmpty()) {
                    DetailRow(
                        label = "Assigned to",
                        value = record.assignedTo.joinToString(", ") { it.take(8) + "..." },
                    )
                }
                // Closed at
                if (record.closedAt != null) {
                    DetailRow(label = "Closed", value = DateFormatUtils.formatDateVerbose(record.closedAt))
                }
            }
        }

        // Template fields section
        if (entityType != null && entityType.fields.isNotEmpty()) {
            TemplateFieldsSection(
                fields = entityType.fields,
                record = record,
            )
        }

        // Counts section
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
            ),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "Related",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                )
                DetailRow(label = "Interactions", value = record.interactionCount.toString())
                DetailRow(label = "Contacts", value = record.contactCount.toString())
                DetailRow(label = "Files", value = record.fileCount.toString())
                DetailRow(label = "Reports", value = record.reportCount.toString())
            }
        }

        // Assign to me button
        Button(
            onClick = onAssignToMe,
            enabled = !isAssigning,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("case-assign-btn"),
        ) {
            if (isAssigning) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
                Spacer(Modifier.width(8.dp))
            }
            Text("Assign to me")
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(0.4f),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(0.6f),
        )
    }
}

/**
 * Renders the entity type's custom fields section.
 * Since field values are E2EE-encrypted, this shows field labels
 * and marks encrypted fields. Decryption is handled by the caller
 * if they have the appropriate envelope.
 */
@Composable
private fun TemplateFieldsSection(
    fields: List<EntityFieldDefinition>,
    record: CaseRecord,
) {
    val sortedFields = fields.sortedBy { it.order }
    var currentSection: String? = null

    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Fields",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary,
            )

            sortedFields.forEach { field ->
                // Section header if the section changed
                if (field.section != null && field.section != currentSection) {
                    currentSection = field.section
                    Spacer(Modifier.height(4.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = field.section,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.testTag("case-field-section-${field.section}"),
                    )
                }

                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = field.label,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .weight(0.4f)
                            .testTag("case-field-label-${field.name}"),
                    )
                    Text(
                        text = if (record.encryptedFields != null) "[Encrypted]" else "-",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier
                            .weight(0.6f)
                            .testTag("case-field-value-${field.name}"),
                    )
                }
            }
        }
    }
}

// ---- Timeline Tab ----

@Composable
private fun TimelineTab(
    interactions: List<CaseInteraction>,
    isLoading: Boolean,
    error: String?,
    entityType: EntityTypeDefinition?,
    onAddComment: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
    ) {
        when {
            isLoading && interactions.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(36.dp)
                            .testTag("case-timeline-loading"),
                    )
                }
            }

            error != null && interactions.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            interactions.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "No interactions yet",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.testTag("case-timeline-empty"),
                    )
                }
            }

            else -> {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .testTag("case-timeline"),
                ) {
                    items(
                        items = interactions,
                        key = { it.id },
                    ) { interaction ->
                        TimelineItem(
                            interaction = interaction,
                            entityType = entityType,
                            modifier = Modifier.testTag("timeline-item-${interaction.id}"),
                        )
                    }
                }
            }
        }

        // Comment input row at bottom
        HorizontalDivider()
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            OutlinedButton(
                onClick = onAddComment,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("case-comment-input"),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Comment,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text("Add comment...")
            }
        }
    }
}

/**
 * A single timeline interaction item.
 * Shows type icon, author pubkey prefix, timestamp, and content preview.
 */
@Composable
private fun TimelineItem(
    interaction: CaseInteraction,
    entityType: EntityTypeDefinition?,
    modifier: Modifier = Modifier,
) {
    val icon: ImageVector = when (interaction.interactionType) {
        "comment" -> Icons.AutoMirrored.Filled.Comment
        "status_change" -> Icons.Filled.SwapHoriz
        "note" -> Icons.Filled.Description
        "call" -> Icons.Filled.Phone
        "file_upload" -> Icons.Filled.Upload
        "referral" -> Icons.Filled.LinkOff
        "assessment" -> Icons.Filled.Description
        else -> Icons.AutoMirrored.Filled.Comment
    }

    val typeLabel = when (interaction.interactionType) {
        "comment" -> "Comment"
        "status_change" -> "Status changed"
        "note" -> "Note linked"
        "call" -> "Call linked"
        "message" -> "Message"
        "file_upload" -> "File uploaded"
        "referral" -> "Referral"
        "assessment" -> "Assessment"
        else -> interaction.interactionType.replaceFirstChar { it.uppercase() }
    }

    // For status changes, show the status transition
    val statusChangeText = if (interaction.interactionType == "status_change") {
        val prevStatus = interaction.previousStatusHash?.let { hash ->
            entityType?.statuses?.find { it.value == hash }?.label ?: hash.take(8)
        }
        val newStatus = interaction.newStatusHash?.let { hash ->
            entityType?.statuses?.find { it.value == hash }?.label ?: hash.take(8)
        }
        if (prevStatus != null && newStatus != null) {
            "$prevStatus -> $newStatus"
        } else {
            null
        }
    } else {
        null
    }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = typeLabel,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .size(20.dp)
                    .padding(top = 2.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = typeLabel,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = DateFormatUtils.formatTimestamp(interaction.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    )
                }
                // Author
                Text(
                    text = interaction.authorPubkey.take(8) + "...",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                )
                // Status change details
                if (statusChangeText != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = statusChangeText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                // Encrypted content indicator
                if (interaction.encryptedContent != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "[Encrypted content]",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                    )
                }
                // Source link
                if (interaction.sourceId != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Linked: ${interaction.sourceId.take(8)}...",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                    )
                }
            }
        }
    }
}

// ---- Contacts Tab ----

@Composable
private fun ContactsTab(
    contacts: List<RecordContact>,
    isLoading: Boolean,
    error: String?,
    entityType: EntityTypeDefinition?,
) {
    when {
        isLoading && contacts.isEmpty() -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(36.dp)
                        .testTag("case-contacts-loading"),
                )
            }
        }

        error != null && contacts.isEmpty() -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }

        contacts.isEmpty() -> {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("case-contacts-tab"),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        imageVector = Icons.Filled.People,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                        modifier = Modifier.size(48.dp),
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "No contacts linked",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        else -> {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .testTag("case-contacts-tab"),
            ) {
                items(
                    items = contacts,
                    key = { it.contactId },
                ) { contact ->
                    ContactItem(
                        contact = contact,
                        entityType = entityType,
                    )
                }
            }
        }
    }
}

@Composable
private fun ContactItem(
    contact: RecordContact,
    entityType: EntityTypeDefinition?,
) {
    val roleLabel = entityType?.contactRoles?.find { it.value == contact.role }?.label
        ?: contact.role.replaceFirstChar { it.uppercase() }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Person,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = contact.contactId.take(12) + "...",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = DateFormatUtils.formatTimestamp(contact.addedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                )
            }
            // Role badge
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                ),
            ) {
                Text(
                    text = roleLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
    }
}

// ---- Evidence Tab ----

@Composable
private fun EvidenceTab(
    evidence: List<EvidenceItem>,
    isLoading: Boolean,
    error: String?,
) {
    when {
        isLoading && evidence.isEmpty() -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(36.dp)
                        .testTag("case-evidence-loading"),
                )
            }
        }

        error != null && evidence.isEmpty() -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }

        evidence.isEmpty() -> {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("case-evidence-tab"),
                contentAlignment = Alignment.Center,
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        imageVector = Icons.Filled.AttachFile,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                        modifier = Modifier.size(48.dp),
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "No evidence files",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        else -> {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .testTag("case-evidence-tab"),
            ) {
                items(
                    items = evidence,
                    key = { it.id },
                ) { item ->
                    EvidenceCard(item = item)
                }
            }
        }
    }
}

@Composable
private fun EvidenceCard(
    item: EvidenceItem,
) {
    val classificationIcon: ImageVector = when (item.classification) {
        "photo" -> Icons.Filled.AttachFile
        "video" -> Icons.Filled.AttachFile
        "document" -> Icons.Filled.Description
        "audio" -> Icons.Filled.AttachFile
        else -> Icons.Filled.AttachFile
    }

    val classificationLabel = item.classification.replaceFirstChar { it.uppercase() }
    val sizeText = formatFileSize(item.sizeBytes)

    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
        ) {
            Icon(
                imageVector = classificationIcon,
                contentDescription = classificationLabel,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.filename,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = sizeText,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    )
                    Text(
                        text = item.mimeType,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    )
                }
                Text(
                    text = DateFormatUtils.formatTimestamp(item.uploadedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                )
            }
            // Classification badge
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                ),
            ) {
                Text(
                    text = classificationLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
    }
}

/**
 * Format a file size in bytes to a human-readable string.
 */
private fun formatFileSize(bytes: Long): String {
    return when {
        bytes >= 1_073_741_824 -> "%.1f GB".format(bytes / 1_073_741_824.0)
        bytes >= 1_048_576 -> "%.1f MB".format(bytes / 1_048_576.0)
        bytes >= 1024 -> "%.1f KB".format(bytes / 1024.0)
        else -> "$bytes B"
    }
}
