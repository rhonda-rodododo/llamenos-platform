package org.llamenos.hotline.ui.notes

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.llamenos.hotline.R
import org.llamenos.hotline.ui.components.LoadingOverlay
import org.llamenos.hotline.util.DateFormatUtils

/**
 * Note detail screen showing the full decrypted note content.
 *
 * Displays:
 * - Full note text in a [SelectionContainer] for copy support
 * - Custom field values (if any)
 * - Metadata: author pubkey, date, associated call/conversation
 * - Copy action in the top bar
 *
 * @param viewModel Shared NotesViewModel with the selected note
 * @param onNavigateBack Callback to navigate back to the notes list
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoteDetailScreen(
    viewModel: NotesViewModel,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()
    val note = uiState.selectedNote
    val clipboardManager = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val copiedMessage = stringResource(R.string.note_copied)
    var editText by remember { mutableStateOf("") }

    // Sync edit text when entering edit mode
    LaunchedEffect(uiState.isEditing) {
        if (uiState.isEditing && note != null) {
            editText = note.text
        }
    }

    // Show save errors in snackbar
    LaunchedEffect(uiState.saveError) {
        uiState.saveError?.let { error ->
            scope.launch {
                snackbarHostState.showSnackbar(error)
                viewModel.clearSaveError()
            }
        }
    }

    Box(modifier = modifier) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = if (uiState.isEditing) {
                            stringResource(R.string.note_editing)
                        } else {
                            stringResource(R.string.note_detail)
                        },
                        modifier = Modifier.testTag("note-detail-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            if (uiState.isEditing) {
                                viewModel.cancelEditing()
                            } else {
                                viewModel.clearSelectedNote()
                                onNavigateBack()
                            }
                        },
                        modifier = Modifier.testTag("note-detail-back"),
                    ) {
                        Icon(
                            imageVector = if (uiState.isEditing) {
                                Icons.Filled.Close
                            } else {
                                Icons.AutoMirrored.Filled.ArrowBack
                            },
                            contentDescription = stringResource(R.string.nav_dashboard),
                        )
                    }
                },
                actions = {
                    if (note != null) {
                        if (uiState.isEditing) {
                            // Save button in edit mode
                            IconButton(
                                onClick = {
                                    if (editText.isNotBlank()) {
                                        viewModel.updateNote(note.id, editText.trim(), emptyMap())
                                    }
                                },
                                enabled = editText.isNotBlank() && !uiState.isSaving,
                                modifier = Modifier.testTag("note-save-button"),
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Save,
                                    contentDescription = stringResource(R.string.note_save),
                                )
                            }
                        } else {
                            // Edit button
                            IconButton(
                                onClick = { viewModel.startEditing() },
                                modifier = Modifier.testTag("note-edit-button"),
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Edit,
                                    contentDescription = stringResource(R.string.note_edit),
                                )
                            }

                            // Copy button
                            IconButton(
                                onClick = {
                                    clipboardManager.setText(AnnotatedString(note.text))
                                    scope.launch {
                                        snackbarHostState.showSnackbar(copiedMessage)
                                    }
                                },
                                modifier = Modifier.testTag("note-copy-button"),
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.ContentCopy,
                                    contentDescription = stringResource(R.string.note_copy),
                                )
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { paddingValues ->
        if (note == null) {
            // Note not found — should not happen in normal flow
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = stringResource(R.string.note_not_found),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("note-not-found"),
                )
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Main note text — read or edit mode
                if (uiState.isEditing) {
                    OutlinedTextField(
                        value = editText,
                        onValueChange = { editText = it },
                        label = { Text(stringResource(R.string.note_text_hint)) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .testTag("note-edit-input"),
                        maxLines = 10,
                        singleLine = false,
                    )
                } else {
                    SelectionContainer {
                        Text(
                            text = note.text,
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("note-detail-text"),
                        )
                    }
                }

                // Custom fields
                if (!note.fields.isNullOrEmpty()) {
                    HorizontalDivider()

                    note.fields.forEach { (key, value) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("note-field-$key"),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = key,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.weight(1f),
                            )
                            Text(
                                text = value.displayValue(),
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.weight(2f),
                            )
                        }
                    }
                }

                HorizontalDivider()

                // Metadata card
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("note-metadata-card"),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        // Author
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = stringResource(R.string.note_author),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.weight(1f))
                            Text(
                                text = note.authorPubkey.take(8) + "..." + note.authorPubkey.takeLast(8),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.testTag("note-detail-author"),
                            )
                        }

                        // Date
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = stringResource(R.string.note_date),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.weight(1f))
                            Text(
                                text = DateFormatUtils.formatDateVerbose(note.createdAt),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.testTag("note-detail-date"),
                            )
                        }

                        // Context badges
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            if (note.callId != null) {
                                AssistChip(
                                    onClick = {},
                                    label = { Text(stringResource(R.string.note_call_id_badge, note.callId.take(8))) },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Filled.Phone,
                                            contentDescription = null,
                                            modifier = Modifier.size(16.dp),
                                        )
                                    },
                                    modifier = Modifier.testTag("note-detail-call-chip"),
                                )
                            }
                            if (note.conversationId != null) {
                                AssistChip(
                                    onClick = {},
                                    label = { Text(stringResource(R.string.note_chat_id_badge, note.conversationId.take(8))) },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Filled.Sms,
                                            contentDescription = null,
                                            modifier = Modifier.size(16.dp),
                                        )
                                    },
                                    modifier = Modifier.testTag("note-detail-chat-chip"),
                                )
                            }
                        }

                        // Updated date
                        if (note.updatedAt != null) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = stringResource(R.string.note_updated, DateFormatUtils.formatDateVerbose(note.updatedAt)),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                modifier = Modifier.testTag("note-detail-updated"),
                            )
                        }
                    }
                }
            }
        }
    }

    // Loading overlay during save
    LoadingOverlay(
        isLoading = uiState.isSaving,
        message = stringResource(R.string.note_saving),
    )
    } // Close Box
}