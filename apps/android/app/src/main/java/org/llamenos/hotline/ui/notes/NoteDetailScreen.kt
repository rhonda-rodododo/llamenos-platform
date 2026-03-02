package org.llamenos.hotline.ui.notes

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.note_detail),
                        modifier = Modifier.testTag("note-detail-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            viewModel.clearSelectedNote()
                            onNavigateBack()
                        },
                        modifier = Modifier.testTag("note-detail-back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.nav_dashboard),
                        )
                    }
                },
                actions = {
                    if (note != null) {
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
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        modifier = modifier,
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
                    text = "Note not found",
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
                // Main note text
                SelectionContainer {
                    Text(
                        text = note.text,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("note-detail-text"),
                    )
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
                                text = formatDetailDate(note.createdAt),
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
                                text = "Updated: ${formatDetailDate(note.updatedAt)}",
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
}

/**
 * Format date for the detail view — more verbose than the list card format.
 */
private fun formatDetailDate(isoDate: String): String {
    return try {
        val parts = isoDate.replace("T", " ").replace("Z", "").split(" ")
        if (parts.size >= 2) {
            val dateParts = parts[0].split("-")
            if (dateParts.size == 3) {
                val months = listOf(
                    "January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"
                )
                val monthIndex = dateParts[1].toIntOrNull()?.minus(1) ?: 0
                val month = months.getOrElse(monthIndex) { "???" }
                val day = dateParts[2].toIntOrNull() ?: 0
                val year = dateParts[0]
                val time = parts[1].take(5)
                "$month $day, $year at $time"
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
