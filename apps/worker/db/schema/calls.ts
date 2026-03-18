/**
 * Calls domain tables: active calls and encrypted call history records.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { jsonb } from '../bun-jsonb'

// ---------------------------------------------------------------------------
// active_calls
// ---------------------------------------------------------------------------

export const activeCalls = pgTable(
  'active_calls',
  {
    callId: text('call_id').primaryKey(),
    hubId: text('hub_id'),
    callerNumber: text('caller_number').notNull(),
    callerLast4: text('caller_last4'),
    answeredBy: text('answered_by'),
    status: text('status').notNull().default('ringing'),
    hasTranscription: boolean('has_transcription').default(false),
    hasVoicemail: boolean('has_voicemail').default(false),
    hasRecording: boolean('has_recording').default(false),
    recordingSid: text('recording_sid'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    duration: integer('duration'),
  },
  (table) => [
    index('active_calls_hub_id_status_idx').on(table.hubId, table.status),
    index('active_calls_started_at_idx').on(table.startedAt.desc()),
  ],
)

// ---------------------------------------------------------------------------
// call_records
// ---------------------------------------------------------------------------

export const callRecords = pgTable(
  'call_records',
  {
    callId: text('call_id').primaryKey(),
    hubId: text('hub_id'),
    callerLast4: text('caller_last4'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    duration: integer('duration'),
    status: text('status').notNull(),
    hasTranscription: boolean('has_transcription').default(false),
    hasVoicemail: boolean('has_voicemail').default(false),
    hasRecording: boolean('has_recording').default(false),
    recordingSid: text('recording_sid'),
    encryptedContent: text('encrypted_content').notNull(),
    adminEnvelopes: jsonb('admin_envelopes').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('call_records_hub_id_idx').on(table.hubId),
    index('call_records_started_at_idx').on(table.startedAt.desc()),
  ],
)
