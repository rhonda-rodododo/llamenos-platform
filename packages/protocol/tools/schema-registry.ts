/**
 * Schema registry: auto-discovers Zod schemas exported from packages/protocol/schemas/,
 * converts them to JSON Schema via Zod 4's toJSONSchema(), and
 * maps each to a PascalCase type name for quicktype codegen.
 *
 * Auto-discovery rules:
 *   - Export name must end in "Schema"
 *   - Export value must be a ZodType instance
 *   - Export name must not be in EXCLUDED_SCHEMAS
 */

import { toJSONSchema, ZodType } from 'zod'
import * as schemaExports from '../schemas'

/**
 * Schemas excluded from codegen:
 * - Query schemas (URL parameter validation, not wire types)
 * - Primitive validator schemas (string refinements, not standalone types)
 * - Overly generic schemas with no useful mobile representation
 */
const EXCLUDED_SCHEMAS = new Set([
  // Query schemas — URL parameter validation, not wire types
  'listRecordsQuerySchema',
  'listAuditQuerySchema',
  'listBlastsQuerySchema',
  'listContactsQuerySchema',
  'listConversationsQuerySchema',
  'listEventsQuerySchema',
  'listEvidenceQuerySchema',
  'listFilesQuerySchema',
  'listInteractionsQuerySchema',
  'listNotesQuerySchema',
  'listReportsQuerySchema',
  'listSubscribersQuerySchema',
  'callHistoryQuerySchema',

  // Primitive validator schemas — string refinements, not standalone types
  'pubkeySchema',
  'e164PhoneSchema',
  'eciesPubkeySchema',
  'uuidSchema',
  'isoDateSchema',

  // Overly generic response schemas
  'okResponseSchema',

  // Bare enum schemas used as building blocks (already inlined in parent schemas)
  'channelTypeSchema',
  'customFieldContextSchema',
  'identifierTypeSchema',
  'interactionTypeSchema',
  'locationPrecisionSchema',
  'messagingChannelTypeSchema',
  'telephonyProviderTypeSchema',
  'relationshipDirectionSchema',
  'directoryContactTypeSchema',
  'entityCategorySchema',
])

export interface SchemaRegistryEntry {
  name: string
  jsonSchema: object
}

/**
 * Strip "Schema" suffix and capitalize first letter to produce PascalCase type name.
 * e.g. "noteResponseSchema" -> "NoteResponse"
 *      "createNoteBodySchema" -> "CreateNoteBody"
 */
function toPascalCase(schemaName: string): string {
  const withoutSuffix = schemaName.replace(/Schema$/, '')
  return withoutSuffix.charAt(0).toUpperCase() + withoutSuffix.slice(1)
}

/**
 * Returns all Zod schemas converted to JSON Schema with PascalCase type names.
 * Each entry can be fed directly to quicktype's JSONSchemaInput.
 */
export function getSchemaRegistry(): SchemaRegistryEntry[] {
  const entries: SchemaRegistryEntry[] = []

  for (const [exportName, schema] of Object.entries(schemaExports)) {
    // Only process ZodType instances whose export name ends in Schema
    if (!(schema instanceof ZodType)) continue
    if (!exportName.endsWith('Schema')) continue
    if (EXCLUDED_SCHEMAS.has(exportName)) continue

    const name = toPascalCase(exportName)
    try {
      const jsonSchema = toJSONSchema(schema, { unrepresentable: 'any' })
      entries.push({ name, jsonSchema })
    } catch (err) {
      console.warn(`Warning: Could not convert ${exportName} to JSON Schema, skipping: ${err}`)
    }
  }

  return entries
}
