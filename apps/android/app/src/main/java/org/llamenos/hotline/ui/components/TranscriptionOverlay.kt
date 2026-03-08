package org.llamenos.hotline.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import org.llamenos.hotline.R
import org.llamenos.hotline.service.TranscriptionService
import org.llamenos.hotline.service.TranscriptionState

/**
 * Floating overlay that displays live transcription text during an active call.
 * Shows a compact, semi-transparent panel at the bottom of the screen with
 * real-time speech-to-text output. Includes controls to stop transcription
 * and copy the transcript.
 *
 * @param transcriptionService The transcription service providing live results
 * @param onDismiss Callback when the user dismisses the overlay
 * @param modifier Optional modifier
 */
@Composable
fun TranscriptionOverlay(
    transcriptionService: TranscriptionService,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by transcriptionService.state.collectAsState()
    val liveTranscript by transcriptionService.liveTranscript.collectAsState()
    var isExpanded by remember { mutableStateOf(true) }
    var showCopied by remember { mutableStateOf(false) }
    val clipboardManager = LocalClipboardManager.current
    val scrollState = rememberScrollState()

    // Auto-scroll to bottom when transcript updates
    LaunchedEffect(liveTranscript) {
        scrollState.animateScrollTo(scrollState.maxValue)
    }

    // Reset copied indicator after 2 seconds
    LaunchedEffect(showCopied) {
        if (showCopied) {
            delay(2000)
            showCopied = false
        }
    }

    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .testTag("transcription-overlay"),
            shape = RoundedCornerShape(16.dp),
            tonalElevation = 4.dp,
            shadowElevation = 8.dp,
        ) {
            Column {
                // Header bar with controls
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    // Status indicator
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier
                            .weight(1f)
                            .testTag("transcription-status"),
                    ) {
                        // Status dot
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(
                                    when (state) {
                                        is TranscriptionState.Transcribing ->
                                            MaterialTheme.colorScheme.error
                                        is TranscriptionState.Error ->
                                            MaterialTheme.colorScheme.tertiary
                                        else ->
                                            MaterialTheme.colorScheme.outline
                                    },
                                ),
                        )

                        Text(
                            text = when (state) {
                                is TranscriptionState.Idle ->
                                    stringResource(R.string.transcription_starting_transcription)
                                is TranscriptionState.Transcribing ->
                                    stringResource(R.string.transcription_transcription_active)
                                is TranscriptionState.Stopped ->
                                    stringResource(R.string.transcription_transcription_stopped)
                                is TranscriptionState.Error ->
                                    (state as TranscriptionState.Error).message
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }

                    // Copy button
                    if (liveTranscript.isNotEmpty()) {
                        IconButton(
                            onClick = {
                                clipboardManager.setText(AnnotatedString(liveTranscript))
                                showCopied = true
                            },
                            modifier = Modifier
                                .size(32.dp)
                                .testTag("transcription-copy"),
                        ) {
                            Icon(
                                imageVector = if (showCopied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                                contentDescription = stringResource(R.string.a11y_copy_to_clipboard),
                                modifier = Modifier.size(16.dp),
                                tint = if (showCopied) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                    }

                    // Expand/collapse toggle
                    IconButton(
                        onClick = { isExpanded = !isExpanded },
                        modifier = Modifier
                            .size(32.dp)
                            .testTag("transcription-toggle-expand"),
                    ) {
                        Icon(
                            imageVector = if (isExpanded) Icons.Filled.ExpandMore else Icons.Filled.ExpandLess,
                            contentDescription = if (isExpanded) "Collapse" else "Expand",
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    // Dismiss button
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .size(32.dp)
                            .testTag("transcription-dismiss"),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.a11y_remove_item),
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                // Transcript content
                AnimatedVisibility(
                    visible = isExpanded,
                    enter = expandVertically(),
                    exit = shrinkVertically(),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(150.dp)
                            .padding(horizontal = 14.dp)
                            .padding(bottom = 12.dp)
                            .verticalScroll(scrollState),
                    ) {
                        if (liveTranscript.isEmpty()) {
                            Text(
                                text = stringResource(R.string.transcription_no_speech_detected),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else {
                            Text(
                                text = liveTranscript,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }
            }
        }
    }
}
