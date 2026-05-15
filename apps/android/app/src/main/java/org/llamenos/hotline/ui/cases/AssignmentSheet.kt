package org.llamenos.hotline.ui.cases

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.llamenos.hotline.R

/**
 * Bottom sheet for assigning a volunteer to a case record.
 *
 * Loads ranked suggestions from the assignment scoring API and lets the
 * admin select one volunteer to assign. Shows per-component score breakdown:
 * workload, language match, and specialization match.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssignmentSheet(
    recordId: String,
    language: String? = null,
    viewModel: AssignmentViewModel,
    onDismiss: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 32.dp),
        ) {
            // Header
            Text(
                text = stringResource(R.string.assignment_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .padding(horizontal = 24.dp, vertical = 16.dp)
                    .testTag("assignment-sheet-title"),
            )

            HorizontalDivider()

            when {
                uiState.isLoading -> {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(48.dp)
                            .testTag("assignment-loading"),
                    ) {
                        CircularProgressIndicator()
                    }
                }

                uiState.error != null -> {
                    Text(
                        text = uiState.error ?: "",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier
                            .padding(24.dp)
                            .testTag("assignment-error"),
                    )
                }

                uiState.suggestions.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp)
                            .testTag("assignment-empty"),
                    ) {
                        Text(
                            text = stringResource(R.string.assignment_no_volunteers),
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = stringResource(R.string.assignment_no_volunteers_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("assignment-suggestions"),
                    ) {
                        items(
                            items = uiState.suggestions,
                            key = { it.pubkey },
                        ) { suggestion ->
                            SuggestionItem(
                                suggestion = suggestion,
                                isAssigning = uiState.isAssigning,
                                onAssign = {
                                    viewModel.assign(recordId, suggestion.pubkey) {
                                        onDismiss()
                                    }
                                },
                            )
                            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SuggestionItem(
    suggestion: VolunteerSuggestion,
    isAssigning: Boolean,
    onAssign: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .testTag("suggestion-${suggestion.pubkey.take(8)}"),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth(),
        ) {
            // Volunteer ID + score
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f),
            ) {
                Icon(
                    imageVector = Icons.Filled.Person,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = suggestion.pubkey.take(12) + "…",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = suggestion.score.toString(),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.testTag("suggestion-score"),
                )
            }

            Spacer(Modifier.width(12.dp))

            // Assign button
            Button(
                onClick = onAssign,
                enabled = !isAssigning,
                modifier = Modifier.testTag("assign-btn-${suggestion.pubkey.take(8)}"),
            ) {
                if (isAssigning) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(14.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text(stringResource(R.string.assignment_assign_btn))
                }
            }
        }

        Spacer(Modifier.height(6.dp))

        // Score breakdown chips
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // Workload: show active/max
            SuggestionChip(
                onClick = {},
                label = {
                    Text(
                        text = "${suggestion.activeCaseCount}/${suggestion.maxCases}",
                        style = MaterialTheme.typography.labelSmall,
                    )
                },
                modifier = Modifier.testTag("workload-chip"),
            )

            // Language match
            if (suggestion.languageScore > 0) {
                SuggestionChip(
                    onClick = {},
                    label = {
                        Text(
                            text = stringResource(R.string.assignment_language_match),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    },
                    modifier = Modifier.testTag("language-chip"),
                )
            }

            // Specialization match
            if (suggestion.specializationScore > 0) {
                SuggestionChip(
                    onClick = {},
                    label = {
                        Text(
                            text = stringResource(
                                R.string.assignment_specialization_label,
                            ) + " ${suggestion.matchedSpecializations.size}",
                            style = MaterialTheme.typography.labelSmall,
                        )
                    },
                    modifier = Modifier.testTag("spec-chip"),
                )
            }
        }
    }
}
