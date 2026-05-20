package org.llamenos.hotline.ui.admin

import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.llamenos.hotline.R
import org.llamenos.hotline.model.EntityFieldDefinition
import org.llamenos.hotline.model.EntityTypeDefinition

/**
 * Read-only entity type detail screen with tabs for Fields, Statuses, and Config.
 * No editing — schema management is desktop-only.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SchemaDetailScreen(
    entityType: EntityTypeDefinition,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf(
        stringResource(R.string.schema_fields),
        stringResource(R.string.schema_statuses),
        stringResource(R.string.schema_configuration),
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = entityType.label,
                        modifier = Modifier.testTag("schema-detail-title"),
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.testTag("schema-detail-back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.schema_browser_title),
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            // Overview card
            OverviewCard(entityType = entityType)

            // Tab row
            TabRow(
                selectedTabIndex = selectedTab,
                modifier = Modifier.testTag("schema-detail-tabs"),
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title) },
                        modifier = Modifier.testTag("schema-detail-tab-$index"),
                    )
                }
            }

            // Tab content
            when (selectedTab) {
                0 -> FieldsTab(fields = entityType.fields)
                1 -> StatusesTab(entityType = entityType)
                2 -> ConfigTab(entityType = entityType)
            }
        }
    }
}

// MARK: - Overview Card

@Composable
private fun OverviewCard(
    entityType: EntityTypeDefinition,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp)
            .testTag("schema-detail-overview"),
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
                text = entityType.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )

            if (entityType.description.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = entityType.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (entityType.category.value.isNotEmpty()) {
                    DetailChip(text = entityType.category.value)
                }
                DetailChip(text = "${entityType.fields.size} fields")
                DetailChip(text = "${entityType.statuses.size} statuses")
            }
        }
    }
}

// MARK: - Fields Tab

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FieldsTab(
    fields: List<EntityFieldDefinition>,
    modifier: Modifier = Modifier,
) {
    if (fields.isEmpty()) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .testTag("schema-fields-empty"),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.schema_no_fields),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    } else {
        Column(
            modifier = modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
                .testTag("schema-fields-list"),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            fields.sortedBy { it.order }.forEach { field ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("schema-field-${field.id}"),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant,
                    ),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                    ) {
                        // Name and type
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = field.label,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.weight(1f),
                            )

                            // Type chip
                            Text(
                                text = field.type.value,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier
                                    .background(
                                        MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                                        RoundedCornerShape(12.dp),
                                    )
                                    .padding(horizontal = 8.dp, vertical = 3.dp),
                            )
                        }

                        Spacer(Modifier.height(4.dp))

                        // Badges
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            if (field.required) {
                                RequiredBadge()
                            } else {
                                OptionalBadge()
                            }

                            if (field.accessLevel != org.llamenos.protocol.SharedAccessLevel.All) {
                                AccessLevelBadge(level = field.accessLevel.value)
                            }

                            if (field.section != null) {
                                DetailChip(text = field.section.orEmpty())
                            }
                        }

                        if (field.helpText != null) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = field.helpText.orEmpty(),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Statuses Tab

@Composable
private fun StatusesTab(
    entityType: EntityTypeDefinition,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
            .testTag("schema-statuses-list"),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        // Statuses
        Text(
            text = stringResource(R.string.schema_statuses),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 8.dp),
        )

        entityType.statuses.forEach { status ->
            StatusRow(
                value = status.value,
                label = status.label,
                color = status.color,
                isDefault = status.value == entityType.defaultStatus,
                isClosed = entityType.closedStatuses.contains(status.value) || status.isClosed == true,
            )
            HorizontalDivider()
        }

        // Severities
        val severities = entityType.severities
        if (!severities.isNullOrEmpty()) {
            Spacer(Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.schema_severities),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 8.dp),
            )

            severities.forEach { severity ->
                StatusRow(
                    value = severity.value,
                    label = severity.label,
                    color = severity.color,
                    isDefault = severity.value == entityType.defaultSeverity,
                    isClosed = false,
                )
                HorizontalDivider()
            }
        }

        // Contact Roles
        val contactRoles = entityType.contactRoles
        if (!contactRoles.isNullOrEmpty()) {
            Spacer(Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.schema_contact_roles),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 8.dp),
            )

            contactRoles.forEach { role ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Person,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = role.label,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun StatusRow(
    value: String,
    label: String,
    color: String?,
    isDefault: Boolean,
    isClosed: Boolean,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp)
            .testTag("schema-status-$value"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Color dot
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(
                    parseHexColorLocal(color) ?: MaterialTheme.colorScheme.primary,
                ),
        )

        Spacer(Modifier.width(10.dp))

        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )

        if (isDefault) {
            Text(
                text = stringResource(R.string.schema_default),
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .background(
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                        RoundedCornerShape(12.dp),
                    )
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            )
        }

        if (isClosed) {
            Spacer(Modifier.width(4.dp))
            Text(
                text = stringResource(R.string.schema_closed),
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .background(
                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f),
                        RoundedCornerShape(12.dp),
                    )
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            )
        }
    }
}

// MARK: - Config Tab

@Composable
private fun ConfigTab(
    entityType: EntityTypeDefinition,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
            .testTag("schema-config-tab"),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        val numberPrefix = entityType.numberPrefix
        if (numberPrefix != null) {
            ConfigRow(
                label = stringResource(R.string.schema_number_prefix),
                value = numberPrefix,
            )
            HorizontalDivider()
        }

        ConfigToggleRow(
            label = stringResource(R.string.schema_numbering),
            enabled = entityType.numberingEnabled,
        )
        HorizontalDivider()

        ConfigToggleRow(
            label = stringResource(R.string.schema_sub_records),
            enabled = entityType.allowSubRecords,
        )
        HorizontalDivider()

        ConfigToggleRow(
            label = stringResource(R.string.schema_file_attachments),
            enabled = entityType.allowFileAttachments,
        )
        HorizontalDivider()

        ConfigToggleRow(
            label = stringResource(R.string.schema_interactions),
            enabled = entityType.allowInteractionLinks,
        )
        HorizontalDivider()

        ConfigRow(
            label = stringResource(R.string.schema_access_level),
            value = entityType.defaultAccessLevel.value,
        )
        HorizontalDivider()

        ConfigRow(
            label = stringResource(R.string.schema_label_plural),
            value = entityType.labelPlural,
        )

        val templateId = entityType.templateID
        if (templateId != null) {
            HorizontalDivider()
            ConfigRow(
                label = stringResource(R.string.schema_template),
                value = templateId,
            )
        }
    }
}

@Composable
private fun ConfigRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun ConfigToggleRow(
    label: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
        )
        Icon(
            imageVector = if (enabled) Icons.Filled.Check else Icons.Filled.Close,
            contentDescription = null,
            tint = if (enabled) Color(0xFF22C55E) else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp),
        )
    }
}

// MARK: - Badge Components

@Composable
private fun RequiredBadge(modifier: Modifier = Modifier) {
    Text(
        text = stringResource(R.string.schema_required),
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold,
        color = Color.White,
        modifier = modifier
            .background(MaterialTheme.colorScheme.error, RoundedCornerShape(12.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
private fun OptionalBadge(modifier: Modifier = Modifier) {
    Text(
        text = stringResource(R.string.schema_optional),
        fontSize = 10.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier
            .background(
                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f),
                RoundedCornerShape(12.dp),
            )
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
private fun AccessLevelBadge(
    level: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .background(
                Color(0xFFF97316).copy(alpha = 0.12f),
                RoundedCornerShape(12.dp),
            )
            .padding(horizontal = 6.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Lock,
            contentDescription = null,
            tint = Color(0xFFF97316),
            modifier = Modifier.size(10.dp),
        )
        Text(
            text = level,
            fontSize = 10.sp,
            color = Color(0xFFF97316),
        )
    }
}

@Composable
private fun DetailChip(
    text: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text = text,
        fontSize = 11.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier
            .background(
                MaterialTheme.colorScheme.surfaceContainerHighest,
                RoundedCornerShape(12.dp),
            )
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

// MARK: - Helpers

/**
 * Parse a hex color string into a Compose Color. File-private to avoid
 * redeclaration with SchemaBrowserScreen.kt's version.
 */
private fun parseHexColorLocal(hex: String?): Color? {
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
