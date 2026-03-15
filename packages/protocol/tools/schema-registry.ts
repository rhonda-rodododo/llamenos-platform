/**
 * Schema registry: imports Zod schemas from apps/worker/schemas/,
 * converts them to JSON Schema via Zod 4's toJSONSchema(), and
 * maps each to a PascalCase type name for quicktype codegen.
 */

import { toJSONSchema } from 'zod'

// --- Import all schemas from worker ---
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
  createNoteBodySchema,
  updateNoteBodySchema,
  createReplyBodySchema,

  // volunteers.ts
  volunteerResponseSchema,
  createVolunteerBodySchema,
  updateVolunteerBodySchema,
  adminUpdateVolunteerBodySchema,

  // calls.ts
  callRecordResponseSchema,
  callPresenceResponseSchema,
  banCallerBodySchema,

  // conversations.ts
  conversationResponseSchema,
  messageResponseSchema,
  sendMessageBodySchema,
  updateConversationBodySchema,
  claimConversationBodySchema,
  createConversationBodySchema,

  // shifts.ts
  shiftResponseSchema,
  myStatusResponseSchema,
  createShiftBodySchema,
  updateShiftBodySchema,
  fallbackGroupSchema,

  // blasts.ts
  blastResponseSchema,
  subscriberResponseSchema,
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
  createHubBodySchema,
  updateHubBodySchema,
  addHubMemberBodySchema,
  hubKeyEnvelopesBodySchema,

  // uploads.ts
  uploadResponseSchema,
  uploadInitBodySchema,

  // invites.ts
  inviteResponseSchema,
  inviteValidationResponseSchema,
  redeemInviteBodySchema,
  createInviteBodySchema,

  // settings.ts
  roleResponseSchema,
  customFieldResponseSchema,
  reportTypeResponseSchema,
  customFieldsBodySchema,
  createReportTypeBodySchema as settingsCreateReportTypeBodySchema,
  updateReportTypeBodySchema as settingsUpdateReportTypeBodySchema,

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
  createBanBodySchema,
  bulkBanBodySchema,

  // audit.ts
  auditEntryResponseSchema,

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

  // provisioning.ts
  provisionRoomResponseSchema,
  provisionRoomStatusResponseSchema,
  createRoomBodySchema,
  roomPayloadBodySchema,

  // webrtc.ts
  webrtcTokenResponseSchema,

  // system.ts
  systemStatusResponseSchema,

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
} from '../../../apps/worker/schemas'

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
  ['createNoteBodySchema', createNoteBodySchema],
  ['updateNoteBodySchema', updateNoteBodySchema],
  ['createReplyBodySchema', createReplyBodySchema],

  // Volunteers
  ['volunteerResponseSchema', volunteerResponseSchema],
  ['createVolunteerBodySchema', createVolunteerBodySchema],
  ['updateVolunteerBodySchema', updateVolunteerBodySchema],
  ['adminUpdateVolunteerBodySchema', adminUpdateVolunteerBodySchema],

  // Calls
  ['callRecordResponseSchema', callRecordResponseSchema],
  ['callPresenceResponseSchema', callPresenceResponseSchema],
  ['banCallerBodySchema', banCallerBodySchema],

  // Conversations
  ['conversationResponseSchema', conversationResponseSchema],
  ['messageResponseSchema', messageResponseSchema],
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

  // Blasts
  ['blastResponseSchema', blastResponseSchema],
  ['subscriberResponseSchema', subscriberResponseSchema],
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

  // Uploads
  ['uploadResponseSchema', uploadResponseSchema],
  ['uploadInitBodySchema', uploadInitBodySchema],

  // Invites
  ['inviteResponseSchema', inviteResponseSchema],
  ['inviteValidationResponseSchema', inviteValidationResponseSchema],
  ['redeemInviteBodySchema', redeemInviteBodySchema],
  ['createInviteBodySchema', createInviteBodySchema],

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

  // Bans
  ['banResponseSchema', banResponseSchema],
  ['createBanBodySchema', createBanBodySchema],
  ['bulkBanBodySchema', bulkBanBodySchema],

  // Audit
  ['auditEntryResponseSchema', auditEntryResponseSchema],

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

  // Provisioning
  ['provisionRoomResponseSchema', provisionRoomResponseSchema],
  ['provisionRoomStatusResponseSchema', provisionRoomStatusResponseSchema],
  ['createRoomBodySchema', createRoomBodySchema],
  ['roomPayloadBodySchema', roomPayloadBodySchema],

  // WebRTC
  ['webrtcTokenResponseSchema', webrtcTokenResponseSchema],

  // System
  ['systemStatusResponseSchema', systemStatusResponseSchema],

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
