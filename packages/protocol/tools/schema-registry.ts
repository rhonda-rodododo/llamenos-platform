/**
 * Schema registry: imports Zod schemas from packages/protocol/schemas/,
 * converts them to JSON Schema via Zod 4's toJSONSchema(), and
 * maps each to a PascalCase type name for quicktype codegen.
 */

import { toJSONSchema } from 'zod'

// --- Import all schemas from protocol ---
import {
  // common.ts — shared types
  paginationSchema,
  cursorPaginationSchema,
  errorResponseSchema,
  recipientEnvelopeSchema,
  keyEnvelopeSchema,
  fileKeyEnvelopeSchema,
  encryptedMetadataEntrySchema,

  // auth.ts
  loginResponseSchema,
  meResponseSchema,
  loginBodySchema,
  bootstrapBodySchema,
  profileUpdateBodySchema,
  availabilityBodySchema,
  transcriptionToggleBodySchema,

  // notes.ts
  noteResponseSchema,
  noteListResponseSchema,
  noteRepliesResponseSchema,
  createNoteBodySchema,
  updateNoteBodySchema,
  createReplyBodySchema,

  // volunteers.ts
  volunteerResponseSchema,
  volunteerListResponseSchema,
  volunteerMetricsResponseSchema,
  createVolunteerBodySchema,
  updateVolunteerBodySchema,
  adminUpdateVolunteerBodySchema,

  // calls.ts
  callRecordResponseSchema,
  callPresenceResponseSchema,
  callHistoryResponseSchema,
  banCallerBodySchema,
  activeCallsResponseSchema,
  todayCountResponseSchema,
  callerIdentifyResponseSchema,
  callActionResponseSchema,
  banCallResponseSchema,

  // conversations.ts
  conversationResponseSchema,
  conversationListResponseSchema,
  messageResponseSchema,
  messageListResponseSchema,
  sendMessageBodySchema,
  updateConversationBodySchema,
  claimConversationBodySchema,
  createConversationBodySchema,

  // shifts.ts
  shiftResponseSchema,
  myStatusResponseSchema,
  shiftListResponseSchema,
  createShiftBodySchema,
  updateShiftBodySchema,
  fallbackGroupSchema,

  // blasts.ts
  blastResponseSchema,
  subscriberResponseSchema,
  subscriberListResponseSchema,
  blastListResponseSchema,
  importSubscribersResponseSchema,
  subscriberStatsResponseSchema,
  blastSettingsResponseSchema,
  createBlastBodySchema,
  updateBlastBodySchema,
  scheduleBlastBodySchema,
  importSubscribersBodySchema,
  updateBlastSettingsBodySchema,
  messagingPreferencesBodySchema,

  // reports.ts
  reportResponseSchema,
  reportMessageResponseSchema,
  createReportBodySchema,
  reportMessageBodySchema,
  assignReportBodySchema,
  updateReportBodySchema,

  // hubs.ts
  hubResponseSchema,
  hubMemberResponseSchema,
  hubListResponseSchema,
  hubDetailResponseSchema,
  hubKeyEnvelopeResponseSchema,
  createHubBodySchema,
  updateHubBodySchema,
  addHubMemberBodySchema,
  hubKeyEnvelopesBodySchema,

  // uploads.ts
  uploadResponseSchema,
  uploadInitBodySchema,
  uploadInitResponseSchema,
  chunkUploadResponseSchema,
  uploadCompleteResponseSchema,
  uploadStatusResponseSchema,

  // invites.ts
  inviteResponseSchema,
  inviteValidationResponseSchema,
  inviteListResponseSchema,
  redeemInviteBodySchema,
  createInviteBodySchema,

  // settings.ts
  roleResponseSchema,
  customFieldResponseSchema,
  reportTypeResponseSchema,
  customFieldsBodySchema,
  createReportTypeBodySchema as settingsCreateReportTypeBodySchema,
  updateReportTypeBodySchema as settingsUpdateReportTypeBodySchema,
  customFieldsListResponseSchema,
  roleListResponseSchema,
  reportTypeListResponseSchema,
  ivrAudioPromptsResponseSchema,
  successResponseSchema,
  permissionsCatalogResponseSchema,
  migrationStatusResponseSchema,
  cleanupMetricsResponseSchema,
  ttlOverridesResponseSchema,

  // report-types.ts (CMS — Epic 343)
  reportTypeDefinitionSchema,
  reportFieldDefinitionSchema,
  createCmsReportTypeBodySchema,
  updateCmsReportTypeBodySchema,
  ttlOverridesBodySchema,
  setupCompleteBodySchema,
  spamSettingsSchema,
  callSettingsSchema,
  messagingConfigSchema,
  telephonyProviderSchema,
  createRoleSchema,
  updateRoleSchema,
  webauthnSettingsSchema,
  transcriptionSettingsSchema,
  ivrLanguagesSchema,
  setupStateSchema,

  // bans.ts
  banResponseSchema,
  banListResponseSchema,
  bulkBanResponseSchema,
  createBanBodySchema,
  bulkBanBodySchema,

  // audit.ts
  auditEntryResponseSchema,
  auditListResponseSchema,

  // devices.ts
  deviceResponseSchema,
  registerDeviceBodySchema,
  voipTokenBodySchema,

  // files.ts
  fileResponseSchema,
  shareFileBodySchema,

  // webauthn.ts
  webauthnCredentialResponseSchema,
  webauthnChallengeResponseSchema,
  authenticateBodySchema,
  addCredentialBodySchema,
  registerCredentialBodySchema,
  webauthnOptionsResponseSchema,
  webauthnLoginResponseSchema,
  webauthnCredentialsListResponseSchema,

  // provisioning.ts
  provisionRoomResponseSchema,
  provisionRoomStatusResponseSchema,
  createRoomBodySchema,
  roomPayloadBodySchema,

  // webrtc.ts
  webrtcTokenResponseSchema,
  sipTokenResponseSchema,
  telephonyStatusResponseSchema,

  // system.ts
  systemStatusResponseSchema,
  systemHealthResponseSchema,

  // events.ts
  eventSchema,
  eventDetailsSchema,
  caseEventSchema,
  reportEventSchema,
  createEventBodySchema,
  updateEventBodySchema,
  linkRecordToEventBodySchema,
  linkReportToEventBodySchema,
  eventListResponseSchema,
  caseEventListResponseSchema,
  reportEventListResponseSchema,

  // contact-relationships.ts
  contactRelationshipSchema,
  createRelationshipBodySchema,
  affinityGroupSchema,
  groupMemberSchema,
  groupMemberListResponseSchema,
  createAffinityGroupBodySchema,
  updateAffinityGroupBodySchema,
  addGroupMemberBodySchema,
  affinityGroupDetailsSchema,
  contactRelationshipListResponseSchema,
  affinityGroupListResponseSchema,
  affinityGroupWithMembersResponseSchema,

  // interactions.ts
  caseInteractionSchema,
  createInteractionBodySchema,
  interactionContentSchema,
  interactionListResponseSchema,
  sourceInteractionLookupResponseSchema,

  // report-links.ts
  reportCaseLinkSchema,
  linkReportToCaseBodySchema,
  linkCaseToReportBodySchema,
  reportCaseLinkListResponseSchema,
  casesForReportListResponseSchema,

  // evidence.ts
  evidenceClassificationSchema,
  custodyActionSchema,
  custodyEntrySchema,
  evidenceMetadataSchema,
  uploadEvidenceBodySchema,
  logCustodyEventBodySchema,
  verifyIntegrityBodySchema,
  evidenceListResponseSchema,
  custodyChainResponseSchema,
  verifyIntegrityResponseSchema,

  // entity-schema.ts — CMS entity type definitions
  enumOptionSchema,
  entityFieldDefinitionSchema,
  entityCategorySchema,
  entityTypeDefinitionSchema,
  relationshipTypeDefinitionSchema,
  createEntityTypeBodySchema,
  updateEntityTypeBodySchema,
  createRelationshipTypeBodySchema,
  updateRelationshipTypeBodySchema,
  caseNumberBodySchema,
  entityTypeListResponseSchema,
  relationshipTypeListResponseSchema,
  caseNumberResponseSchema,
  templateListResponseSchema,
  templateApplyResponseSchema,
  templateUpdatesResponseSchema,
  rolesFromTemplateResponseSchema,
  enabledResponseSchema,

  // report-types.ts — CMS list response
  cmsReportTypeListResponseSchema,

  // reports.ts — list/wrapper responses
  reportListResponseSchema,
  reportCategoriesResponseSchema,
  reportFilesResponseSchema,
  reportLinkedCasesResponseSchema,

  // files.ts — response schemas
  fileEnvelopesResponseSchema,
  fileMetadataResponseSchema,

  // setup.ts — response schemas
  setupStateResponseSchema,
  connectionTestResponseSchema,

  // contacts.ts (legacy) — response schemas
  contactTimelineListResponseSchema,
  contactTimelineDetailResponseSchema,

  // config.ts
  configResponseSchema,
  configVerifyResponseSchema,

  // health.ts
  healthResponseSchema,
  livenessResponseSchema,
  readinessResponseSchema,

  // metrics.ts
  metricsResponseSchema,

  // records.ts — CMS case records
  recordSchema,
  recordListResponseSchema,
  recordContactListResponseSchema,
  envelopeRecipientsResponseSchema,
  suggestAssigneesResponseSchema,
  recordsByContactResponseSchema,
  createRecordBodySchema,
  updateRecordBodySchema,
  listRecordsQuerySchema,
  recordContactSchema,
  linkContactBodySchema,
  assignBodySchema,
  unassignBodySchema,
} from '../schemas'

import type { ZodType } from 'zod'

/**
 * Registry entry: maps a Zod schema to a PascalCase type name.
 */
interface RegistryEntry {
  name: string
  schema: ZodType
}

/**
 * Strip "Schema" suffix and convert camelCase to PascalCase.
 * e.g. "noteResponseSchema" -> "NoteResponse"
 *      "createNoteBodySchema" -> "CreateNoteBody"
 */
function toPascalCase(schemaName: string): string {
  const withoutSuffix = schemaName.replace(/Schema$/, '')
  return withoutSuffix.charAt(0).toUpperCase() + withoutSuffix.slice(1)
}

/**
 * All schemas to include in codegen, with their variable names.
 * Excludes query schemas (query parameter validation, not wire types)
 * and okResponseSchema (too generic).
 */
const schemaEntries: Array<[string, ZodType]> = [
  // Common shared types
  ['paginationSchema', paginationSchema],
  ['cursorPaginationSchema', cursorPaginationSchema],
  ['errorResponseSchema', errorResponseSchema],
  ['recipientEnvelopeSchema', recipientEnvelopeSchema],
  ['keyEnvelopeSchema', keyEnvelopeSchema],
  ['fileKeyEnvelopeSchema', fileKeyEnvelopeSchema],
  ['encryptedMetadataEntrySchema', encryptedMetadataEntrySchema],

  // Auth
  ['loginResponseSchema', loginResponseSchema],
  ['meResponseSchema', meResponseSchema],
  ['loginBodySchema', loginBodySchema],
  ['bootstrapBodySchema', bootstrapBodySchema],
  ['profileUpdateBodySchema', profileUpdateBodySchema],
  ['availabilityBodySchema', availabilityBodySchema],
  ['transcriptionToggleBodySchema', transcriptionToggleBodySchema],

  // Notes
  ['noteResponseSchema', noteResponseSchema],
  ['noteListResponseSchema', noteListResponseSchema],
  ['noteRepliesResponseSchema', noteRepliesResponseSchema],
  ['createNoteBodySchema', createNoteBodySchema],
  ['updateNoteBodySchema', updateNoteBodySchema],
  ['createReplyBodySchema', createReplyBodySchema],

  // Volunteers
  ['volunteerResponseSchema', volunteerResponseSchema],
  ['volunteerListResponseSchema', volunteerListResponseSchema],
  ['volunteerMetricsResponseSchema', volunteerMetricsResponseSchema],
  ['createVolunteerBodySchema', createVolunteerBodySchema],
  ['updateVolunteerBodySchema', updateVolunteerBodySchema],
  ['adminUpdateVolunteerBodySchema', adminUpdateVolunteerBodySchema],

  // Calls
  ['callRecordResponseSchema', callRecordResponseSchema],
  ['callPresenceResponseSchema', callPresenceResponseSchema],
  ['callHistoryResponseSchema', callHistoryResponseSchema],
  ['banCallerBodySchema', banCallerBodySchema],
  ['activeCallsResponseSchema', activeCallsResponseSchema],
  ['todayCountResponseSchema', todayCountResponseSchema],
  ['callerIdentifyResponseSchema', callerIdentifyResponseSchema],
  ['callActionResponseSchema', callActionResponseSchema],
  ['banCallResponseSchema', banCallResponseSchema],

  // Conversations
  ['conversationResponseSchema', conversationResponseSchema],
  ['conversationListResponseSchema', conversationListResponseSchema],
  ['messageResponseSchema', messageResponseSchema],
  ['messageListResponseSchema', messageListResponseSchema],
  ['sendMessageBodySchema', sendMessageBodySchema],
  ['updateConversationBodySchema', updateConversationBodySchema],
  ['claimConversationBodySchema', claimConversationBodySchema],
  ['createConversationBodySchema', createConversationBodySchema],

  // Shifts
  ['shiftResponseSchema', shiftResponseSchema],
  ['myStatusResponseSchema', myStatusResponseSchema],
  ['createShiftBodySchema', createShiftBodySchema],
  ['updateShiftBodySchema', updateShiftBodySchema],
  ['fallbackGroupSchema', fallbackGroupSchema],
  ['shiftListResponseSchema', shiftListResponseSchema],

  // Blasts
  ['blastResponseSchema', blastResponseSchema],
  ['subscriberResponseSchema', subscriberResponseSchema],
  ['subscriberListResponseSchema', subscriberListResponseSchema],
  ['blastListResponseSchema', blastListResponseSchema],
  ['importSubscribersResponseSchema', importSubscribersResponseSchema],
  ['subscriberStatsResponseSchema', subscriberStatsResponseSchema],
  ['blastSettingsResponseSchema', blastSettingsResponseSchema],
  ['createBlastBodySchema', createBlastBodySchema],
  ['updateBlastBodySchema', updateBlastBodySchema],
  ['scheduleBlastBodySchema', scheduleBlastBodySchema],
  ['importSubscribersBodySchema', importSubscribersBodySchema],
  ['updateBlastSettingsBodySchema', updateBlastSettingsBodySchema],
  ['messagingPreferencesBodySchema', messagingPreferencesBodySchema],

  // Reports
  ['reportResponseSchema', reportResponseSchema],
  ['reportMessageResponseSchema', reportMessageResponseSchema],
  ['createReportBodySchema', createReportBodySchema],
  ['reportMessageBodySchema', reportMessageBodySchema],
  ['assignReportBodySchema', assignReportBodySchema],
  ['updateReportBodySchema', updateReportBodySchema],

  // Hubs
  ['hubResponseSchema', hubResponseSchema],
  ['hubMemberResponseSchema', hubMemberResponseSchema],
  ['createHubBodySchema', createHubBodySchema],
  ['updateHubBodySchema', updateHubBodySchema],
  ['addHubMemberBodySchema', addHubMemberBodySchema],
  ['hubKeyEnvelopesBodySchema', hubKeyEnvelopesBodySchema],
  ['hubListResponseSchema', hubListResponseSchema],
  ['hubDetailResponseSchema', hubDetailResponseSchema],
  ['hubKeyEnvelopeResponseSchema', hubKeyEnvelopeResponseSchema],

  // Uploads
  ['uploadResponseSchema', uploadResponseSchema],
  ['uploadInitBodySchema', uploadInitBodySchema],
  ['uploadInitResponseSchema', uploadInitResponseSchema],
  ['chunkUploadResponseSchema', chunkUploadResponseSchema],
  ['uploadCompleteResponseSchema', uploadCompleteResponseSchema],
  ['uploadStatusResponseSchema', uploadStatusResponseSchema],

  // Invites
  ['inviteResponseSchema', inviteResponseSchema],
  ['inviteValidationResponseSchema', inviteValidationResponseSchema],
  ['redeemInviteBodySchema', redeemInviteBodySchema],
  ['createInviteBodySchema', createInviteBodySchema],
  ['inviteListResponseSchema', inviteListResponseSchema],

  // Settings
  ['roleResponseSchema', roleResponseSchema],
  ['customFieldResponseSchema', customFieldResponseSchema],
  ['reportTypeResponseSchema', reportTypeResponseSchema],
  ['customFieldsBodySchema', customFieldsBodySchema],
  ['createReportTypeBodySchema', settingsCreateReportTypeBodySchema],
  ['updateReportTypeBodySchema', settingsUpdateReportTypeBodySchema],

  // CMS Report Types (Epic 343)
  ['reportTypeDefinitionSchema', reportTypeDefinitionSchema],
  ['reportFieldDefinitionSchema', reportFieldDefinitionSchema],
  ['createCmsReportTypeBodySchema', createCmsReportTypeBodySchema],
  ['updateCmsReportTypeBodySchema', updateCmsReportTypeBodySchema],

  ['ttlOverridesBodySchema', ttlOverridesBodySchema],
  ['setupCompleteBodySchema', setupCompleteBodySchema],
  ['spamSettingsSchema', spamSettingsSchema],
  ['callSettingsSchema', callSettingsSchema],
  ['messagingConfigSchema', messagingConfigSchema],
  ['telephonyProviderSchema', telephonyProviderSchema],
  ['createRoleSchema', createRoleSchema],
  ['updateRoleSchema', updateRoleSchema],
  ['webauthnSettingsSchema', webauthnSettingsSchema],
  ['transcriptionSettingsSchema', transcriptionSettingsSchema],
  ['ivrLanguagesSchema', ivrLanguagesSchema],
  ['setupStateSchema', setupStateSchema],
  ['customFieldsListResponseSchema', customFieldsListResponseSchema],
  ['roleListResponseSchema', roleListResponseSchema],
  ['reportTypeListResponseSchema', reportTypeListResponseSchema],
  ['ivrAudioPromptsResponseSchema', ivrAudioPromptsResponseSchema],
  ['successResponseSchema', successResponseSchema],
  ['permissionsCatalogResponseSchema', permissionsCatalogResponseSchema],
  ['migrationStatusResponseSchema', migrationStatusResponseSchema],
  ['cleanupMetricsResponseSchema', cleanupMetricsResponseSchema],
  ['ttlOverridesResponseSchema', ttlOverridesResponseSchema],

  // Bans
  ['banResponseSchema', banResponseSchema],
  ['banListResponseSchema', banListResponseSchema],
  ['bulkBanResponseSchema', bulkBanResponseSchema],
  ['createBanBodySchema', createBanBodySchema],
  ['bulkBanBodySchema', bulkBanBodySchema],

  // Audit
  ['auditEntryResponseSchema', auditEntryResponseSchema],
  ['auditListResponseSchema', auditListResponseSchema],

  // Devices
  ['deviceResponseSchema', deviceResponseSchema],
  ['registerDeviceBodySchema', registerDeviceBodySchema],
  ['voipTokenBodySchema', voipTokenBodySchema],

  // Files
  ['fileResponseSchema', fileResponseSchema],
  ['shareFileBodySchema', shareFileBodySchema],

  // WebAuthn
  ['webauthnCredentialResponseSchema', webauthnCredentialResponseSchema],
  ['webauthnChallengeResponseSchema', webauthnChallengeResponseSchema],
  ['authenticateBodySchema', authenticateBodySchema],
  ['addCredentialBodySchema', addCredentialBodySchema],
  ['registerCredentialBodySchema', registerCredentialBodySchema],
  ['webauthnOptionsResponseSchema', webauthnOptionsResponseSchema],
  ['webauthnLoginResponseSchema', webauthnLoginResponseSchema],
  ['webauthnCredentialsListResponseSchema', webauthnCredentialsListResponseSchema],

  // Provisioning
  ['provisionRoomResponseSchema', provisionRoomResponseSchema],
  ['provisionRoomStatusResponseSchema', provisionRoomStatusResponseSchema],
  ['createRoomBodySchema', createRoomBodySchema],
  ['roomPayloadBodySchema', roomPayloadBodySchema],

  // WebRTC
  ['webrtcTokenResponseSchema', webrtcTokenResponseSchema],
  ['sipTokenResponseSchema', sipTokenResponseSchema],
  ['telephonyStatusResponseSchema', telephonyStatusResponseSchema],

  // System
  ['systemStatusResponseSchema', systemStatusResponseSchema],
  ['systemHealthResponseSchema', systemHealthResponseSchema],

  // Events
  ['eventSchema', eventSchema],
  ['eventDetailsSchema', eventDetailsSchema],
  ['caseEventSchema', caseEventSchema],
  ['reportEventSchema', reportEventSchema],
  ['createEventBodySchema', createEventBodySchema],
  ['updateEventBodySchema', updateEventBodySchema],
  ['linkRecordToEventBodySchema', linkRecordToEventBodySchema],
  ['linkReportToEventBodySchema', linkReportToEventBodySchema],
  ['eventListResponseSchema', eventListResponseSchema],
  ['caseEventListResponseSchema', caseEventListResponseSchema],
  ['reportEventListResponseSchema', reportEventListResponseSchema],

  // Contact Relationships & Affinity Groups
  ['contactRelationshipSchema', contactRelationshipSchema],
  ['createRelationshipBodySchema', createRelationshipBodySchema],
  ['affinityGroupSchema', affinityGroupSchema],
  ['groupMemberSchema', groupMemberSchema],
  ['groupMemberListResponseSchema', groupMemberListResponseSchema],
  ['createAffinityGroupBodySchema', createAffinityGroupBodySchema],
  ['updateAffinityGroupBodySchema', updateAffinityGroupBodySchema],
  ['addGroupMemberBodySchema', addGroupMemberBodySchema],
  ['affinityGroupDetailsSchema', affinityGroupDetailsSchema],
  ['contactRelationshipListResponseSchema', contactRelationshipListResponseSchema],
  ['affinityGroupListResponseSchema', affinityGroupListResponseSchema],
  ['affinityGroupWithMembersResponseSchema', affinityGroupWithMembersResponseSchema],

  // Interactions
  ['caseInteractionSchema', caseInteractionSchema],
  ['createInteractionBodySchema', createInteractionBodySchema],
  ['interactionContentSchema', interactionContentSchema],
  ['interactionListResponseSchema', interactionListResponseSchema],
  ['sourceInteractionLookupResponseSchema', sourceInteractionLookupResponseSchema],

  // Report-Case Links
  ['reportCaseLinkSchema', reportCaseLinkSchema],
  ['linkReportToCaseBodySchema', linkReportToCaseBodySchema],
  ['linkCaseToReportBodySchema', linkCaseToReportBodySchema],
  ['reportCaseLinkListResponseSchema', reportCaseLinkListResponseSchema],
  ['casesForReportListResponseSchema', casesForReportListResponseSchema],

  // Evidence & Chain of Custody
  ['evidenceClassificationSchema', evidenceClassificationSchema],
  ['custodyActionSchema', custodyActionSchema],
  ['custodyEntrySchema', custodyEntrySchema],
  ['evidenceMetadataSchema', evidenceMetadataSchema],
  ['uploadEvidenceBodySchema', uploadEvidenceBodySchema],
  ['logCustodyEventBodySchema', logCustodyEventBodySchema],
  ['verifyIntegrityBodySchema', verifyIntegrityBodySchema],
  ['evidenceListResponseSchema', evidenceListResponseSchema],
  ['custodyChainResponseSchema', custodyChainResponseSchema],
  ['verifyIntegrityResponseSchema', verifyIntegrityResponseSchema],

  // Entity Schema (CMS entity type definitions)
  ['enumOptionSchema', enumOptionSchema],
  ['entityFieldDefinitionSchema', entityFieldDefinitionSchema],
  ['entityCategorySchema', entityCategorySchema],
  ['entityTypeDefinitionSchema', entityTypeDefinitionSchema],
  ['relationshipTypeDefinitionSchema', relationshipTypeDefinitionSchema],
  ['createEntityTypeBodySchema', createEntityTypeBodySchema],
  ['updateEntityTypeBodySchema', updateEntityTypeBodySchema],
  ['createRelationshipTypeBodySchema', createRelationshipTypeBodySchema],
  ['updateRelationshipTypeBodySchema', updateRelationshipTypeBodySchema],
  ['caseNumberBodySchema', caseNumberBodySchema],
  ['entityTypeListResponseSchema', entityTypeListResponseSchema],
  ['relationshipTypeListResponseSchema', relationshipTypeListResponseSchema],
  ['caseNumberResponseSchema', caseNumberResponseSchema],
  ['templateListResponseSchema', templateListResponseSchema],
  ['templateApplyResponseSchema', templateApplyResponseSchema],
  ['templateUpdatesResponseSchema', templateUpdatesResponseSchema],
  ['rolesFromTemplateResponseSchema', rolesFromTemplateResponseSchema],
  ['enabledResponseSchema', enabledResponseSchema],
  ['cmsReportTypeListResponseSchema', cmsReportTypeListResponseSchema],

  // Reports — list/wrapper responses
  ['reportListResponseSchema', reportListResponseSchema],
  ['reportCategoriesResponseSchema', reportCategoriesResponseSchema],
  ['reportFilesResponseSchema', reportFilesResponseSchema],
  ['reportLinkedCasesResponseSchema', reportLinkedCasesResponseSchema],

  // Files — response schemas
  ['fileEnvelopesResponseSchema', fileEnvelopesResponseSchema],
  ['fileMetadataResponseSchema', fileMetadataResponseSchema],

  // Setup — response schemas
  ['setupStateResponseSchema', setupStateResponseSchema],
  ['connectionTestResponseSchema', connectionTestResponseSchema],

  // Contact Timeline (aggregated interaction view)
  ['contactTimelineListResponseSchema', contactTimelineListResponseSchema],
  ['contactTimelineDetailResponseSchema', contactTimelineDetailResponseSchema],

  // Records (CMS case records)
  ['recordSchema', recordSchema],
  ['recordListResponseSchema', recordListResponseSchema],
  ['recordContactListResponseSchema', recordContactListResponseSchema],
  ['envelopeRecipientsResponseSchema', envelopeRecipientsResponseSchema],
  ['suggestAssigneesResponseSchema', suggestAssigneesResponseSchema],
  ['recordsByContactResponseSchema', recordsByContactResponseSchema],
  ['createRecordBodySchema', createRecordBodySchema],
  ['updateRecordBodySchema', updateRecordBodySchema],
  ['listRecordsQuerySchema', listRecordsQuerySchema],
  ['recordContactSchema', recordContactSchema],
  ['linkContactBodySchema', linkContactBodySchema],
  ['assignBodySchema', assignBodySchema],
  ['unassignBodySchema', unassignBodySchema],

  // Config
  ['configResponseSchema', configResponseSchema],
  ['configVerifyResponseSchema', configVerifyResponseSchema],

  // Health
  ['healthResponseSchema', healthResponseSchema],
  ['livenessResponseSchema', livenessResponseSchema],
  ['readinessResponseSchema', readinessResponseSchema],

  // Metrics
  ['metricsResponseSchema', metricsResponseSchema],
]

export interface SchemaRegistryEntry {
  name: string
  jsonSchema: object
}

/**
 * Returns all Zod schemas converted to JSON Schema with PascalCase type names.
 * Each entry can be fed directly to quicktype's JSONSchemaInput.
 */
export function getSchemaRegistry(): SchemaRegistryEntry[] {
  const entries: SchemaRegistryEntry[] = []

  for (const [varName, schema] of schemaEntries) {
    const name = toPascalCase(varName)
    try {
      const jsonSchema = toJSONSchema(schema, { unrepresentable: 'any' })
      entries.push({ name, jsonSchema })
    } catch (err) {
      console.warn(`Warning: Could not convert ${varName} to JSON Schema, skipping: ${err}`)
    }
  }

  return entries
}
