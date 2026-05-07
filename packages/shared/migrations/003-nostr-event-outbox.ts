/**
 * Migration 003: Nostr Event Outbox table.
 *
 * LEGACY: The Nostr relay (strfry) was replaced by an in-process WebSocket
 * relay (ConnectionManager in apps/worker/lib/ws-manager.ts). This migration
 * is preserved for schema consistency — the table may still exist in databases
 * that ran this migration. Do NOT delete migration files.
 *
 * This is a PostgreSQL DDL migration (not a KV data migration).
 * The actual table creation is handled in initPostgresPool() alongside
 * kv_store and alarms tables, because PostgreSQL DDL must run before
 * any DOs or services start.
 *
 * This file documents the schema for reference and changelog purposes.
 *
 * Table: nostr_event_outbox
 * Purpose: Persistent outbox for Nostr relay event delivery with retry.
 *
 * Schema:
 *   id            SERIAL PRIMARY KEY
 *   event_json    JSONB NOT NULL      — Signed Nostr event ready for relay
 *   created_at    TIMESTAMPTZ         — When the event was enqueued
 *   attempts      INTEGER DEFAULT 0   — Delivery attempt count
 *   next_retry_at TIMESTAMPTZ         — When to retry (exponential backoff)
 *   status        TEXT DEFAULT 'pending' — pending | delivering | delivered
 *
 * Index: idx_outbox_pending ON (status, next_retry_at) WHERE status = 'pending'
 *
 * Lifecycle:
 *   1. publish() inserts with status='pending'
 *   2. Poller claims batch with FOR UPDATE SKIP LOCKED, sets status='delivering'
 *   3. On success: status='delivered' (cleaned up after 1 hour)
 *   4. On failure: status='pending', attempts++, next_retry_at += backoff
 *   5. Events with >20 attempts are cleaned up after 24 hours
 */
