package org.llamenos.hotline.ui.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.hotline.R
import org.llamenos.hotline.model.EntityTypeDefinition

/**
 * Read-only schema browser screen. Shows a list of entity types
 * defined for the hub. Tapping navigates to a detail view.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SchemaBrowserScreen(
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SchemaBrowserViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    // If an entity type is selected, show detail
    val selected = uiState.selectedEntityType
    if (selected != null) {
        SchemaDetailScreen(
            entityType = selected,
            onNavigateBack = { viewModel.clearSelection() },
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.schema_browser_title),
                        modifier = Modifier.testTag("schema-browser-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.testTag("schema-browser-back"),
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
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .testTag("schema-browser-loading"),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }

            uiState.error != null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .testTag("schema-browser-error"),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = uiState.error ?: "",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.error,
                        )
                        Spacer(Modifier.height(16.dp))
                        TextButton(onClick = { viewModel.loadEntityTypes() }) {
                            Text(stringResource(R.string.action_retry))
                        }
                    }
                }
            }

            uiState.entityTypes.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .testTag("schema-browser-empty"),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Filled.Description,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(48.dp),
                        )
                        Spacer(Modifier.height(12.dp))
                        Text(
                            text = stringResource(R.string.schema_browser_empty),
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            text = stringResource(R.string.schema_browser_empty_desc),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            else -> {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                        .padding(horizontal = 16.dp)
                        .testTag("schema-browser-list"),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 16.dp),
                ) {
                    items(uiState.entityTypes, key = { it.id }) { entityType ->
                        EntityTypeCard(
                            entityType = entityType,
                            onClick = { viewModel.selectEntityType(entityType) },
                        )
                    }
                }
            }
        }
    }
}

// MARK: - EntityTypeCard

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EntityTypeCard(
    entityType: EntityTypeDefinition,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag("schema-entity-${entityType.id}"),
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
            // Icon
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        parseHexColor(entityType.color)
                            ?.copy(alpha = 0.12f)
                            ?: MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = categoryIcon(entityType.category.value),
                    contentDescription = null,
                    tint = parseHexColor(entityType.color) ?: MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp),
                )
            }

            Spacer(Modifier.width(12.dp))

            // Content
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = entityType.label,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                if (entityType.description.isNotEmpty()) {
                    Text(
                        text = entityType.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                Spacer(Modifier.height(4.dp))

                // Metadata chips
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    MetadataChip(
                        text = stringResource(R.string.schema_fields_count, entityType.fields.size),
                        icon = Icons.Filled.ListAlt,
                    )
                    MetadataChip(
                        text = stringResource(R.string.schema_statuses_count, entityType.statuses.size),
                        icon = null,
                        dotColor = MaterialTheme.colorScheme.primary,
                    )
                    if (entityType.category.value.isNotEmpty()) {
                        MetadataChip(
                            text = entityType.category.value,
                            icon = Icons.Filled.Folder,
                        )
                    }
                }
            }
        }
    }
}

// MARK: - MetadataChip

@Composable
private fun MetadataChip(
    text: String,
    icon: ImageVector?,
    modifier: Modifier = Modifier,
    dotColor: Color? = null,
) {
    Row(
        modifier = modifier
            .background(
                MaterialTheme.colorScheme.surfaceContainerHighest,
                RoundedCornerShape(12.dp),
            )
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(12.dp),
            )
        }
        if (dotColor != null) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(dotColor),
            )
        }
        Text(
            text = text,
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// MARK: - Helpers

private fun categoryIcon(category: String): ImageVector {
    return when (category) {
        "event" -> Icons.Filled.CalendarMonth
        "contact" -> Icons.Filled.Person
        else -> Icons.Filled.Description
    }
}

/**
 * Parse a hex color string like "#EF4444" or "EF4444" into a Compose Color.
 * Returns null if parsing fails.
 */
private fun parseHexColor(hex: String?): Color? {
    if (hex.isNullOrBlank()) return null
    val cleaned = hex.removePrefix("#")
    if (cleaned.length != 6) return null
    return try {
        val colorInt = cleaned.toLong(16)
        Color(
            red = ((colorInt shr 16) and 0xFF) / 255f,
            green = ((colorInt shr 8) and 0xFF) / 255f,
            blue = (colorInt and 0xFF) / 255f,
        )
    } catch (_: NumberFormatException) {
        null
    }
}

// MARK: - SchemaBrowserTab

/**
 * Inline tab version of the schema browser for use within the AdminScreen.
 * Loads entity types and allows tapping to view details inline.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SchemaBrowserTab(
    modifier: Modifier = Modifier,
    viewModel: SchemaBrowserViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    // If an entity type is selected, show detail inline
    val selected = uiState.selectedEntityType
    if (selected != null) {
        SchemaDetailScreen(
            entityType = selected,
            onNavigateBack = { viewModel.clearSelection() },
        )
        return
    }

    when {
        uiState.isLoading -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .testTag("schema-tab-loading"),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }

        uiState.error != null -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .testTag("schema-tab-error"),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = uiState.error ?: "",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(Modifier.height(16.dp))
                    TextButton(onClick = { viewModel.loadEntityTypes() }) {
                        Text(stringResource(R.string.action_retry))
                    }
                }
            }
        }

        uiState.entityTypes.isEmpty() -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .testTag("schema-tab-empty"),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Filled.Description,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(48.dp),
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = stringResource(R.string.schema_browser_empty),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = stringResource(R.string.schema_browser_empty_desc),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        else -> {
            LazyColumn(
                modifier = modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp)
                    .testTag("schema-tab-list"),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 16.dp),
            ) {
                items(uiState.entityTypes, key = { it.id }) { entityType ->
                    EntityTypeCard(
                        entityType = entityType,
                        onClick = { viewModel.selectEntityType(entityType) },
                    )
                }
            }
        }
    }
}
