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
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Save
import androidx.compose.material.icons.filled.Sms
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
    var replyText by remember { mutableStateOf("") }

    // Load replies when note is selected
    LaunchedEffect(note?.id) {
        note?.id?.let { viewModel.loadReplies(it) }
    }

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
                            stringResource(R.string.notes_editing)
                        } else {
                            stringResource(R.string.notes_detail)
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
                                viewModel.clearReplies()
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
                                    contentDescription = stringResource(R.string.notes_save),
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
                                    contentDescription = stringResource(R.string.notes_edit),
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
                                    contentDescription = stringResource(R.string.notes_copy),
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
                    text = stringResource(R.string.notes_not_found),
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
                        label = { Text(stringResource(R.string.notes_text_hint)) },
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
                                text = stringResource(R.string.notes_author),
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
                                text = stringResource(R.string.notes_date),
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
                                    label = { Text(stringResource(R.string.notes_call_id_badge, note.callId.take(8))) },
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
                                    label = { Text(stringResource(R.string.notes_chat_id_badge, note.conversationId.take(8))) },
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
                                text = stringResource(R.string.notes_updated, DateFormatUtils.formatDateVerbose(note.updatedAt)),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                modifier = Modifier.testTag("note-detail-updated"),
                            )
                        }
                    }
                }

                // ---- Thread Replies ----
                HorizontalDivider()

                // Thread header
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.testTag("note-thread-header"),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Reply,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.notes_replies),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(Modifier.weight(1f))
                    Text(
                        text = "${uiState.replies.size}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.testTag("note-reply-count"),
                    )
                }

                // Reply list
                if (uiState.isLoadingReplies) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp,
                        )
                    }
                } else if (uiState.replies.isEmpty()) {
                    Text(
                        text = stringResource(R.string.notes_no_replies),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier.testTag("note-no-replies"),
                    )
                } else {
                    uiState.replies.forEach { reply ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("note-reply-${reply.id}"),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                            ),
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                            ) {
                                Text(
                                    text = reply.text,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                Spacer(Modifier.height(4.dp))
                                Row {
                                    Text(
                                        text = reply.authorPubkey.take(8) + "...",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                                    )
                                    Spacer(Modifier.weight(1f))
                                    Text(
                                        text = DateFormatUtils.formatDate(reply.createdAt),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                                    )
                                }
                            }
                        }
                    }
                }

                // Reply input
                if (!uiState.isEditing) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextField(
                            value = replyText,
                            onValueChange = { replyText = it },
                            placeholder = { Text(stringResource(R.string.notes_reply_hint)) },
                            singleLine = true,
                            modifier = Modifier
                                .weight(1f)
                                .testTag("note-reply-input"),
                        )
                        Spacer(Modifier.width(8.dp))
                        IconButton(
                            onClick = {
                                if (replyText.isNotBlank()) {
                                    viewModel.sendReply(note.id, replyText.trim())
                                    replyText = ""
                                }
                            },
                            enabled = replyText.isNotBlank() && !uiState.isSendingReply,
                            modifier = Modifier.testTag("note-reply-send"),
                        ) {
                            if (uiState.isSendingReply) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp,
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.Send,
                                    contentDescription = stringResource(R.string.notes_reply_send),
                                    tint = if (replyText.isNotBlank()) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Loading overlay during save
    LoadingOverlay(
        isLoading = uiState.isSaving,
        message = stringResource(R.string.notes_saving),
    )
    } // Close Box
}