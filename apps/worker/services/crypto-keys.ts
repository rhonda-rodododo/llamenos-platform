/**
 * CryptoKeysService — Phase 6 key management operations.
 *
 * Owns three domains introduced in Phase 6:
 *   - Sigchain: per-user hash-chained device/key event log
 *   - PUK envelopes: HPKE-encrypted PUK seed distribution
 *   - MLS messages: pending handshake message delivery
 */
import { and, asc, desc, eq, max } from 'drizzle-orm'
import type { Database } from '../db'
import { sigchainLinks, pukEnvelopes, mlsPendingMessages } from '../db/schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SigchainLinkRecord {
  id: string
  userPubkey: string
  seqNo: number
  linkType: string
  payload: unknown
  signature: string
  prevHash: string
  hash: string
  createdAt: string
}

export interface PukEnvelopeRecord {
  id: string
  userPubkey: string
  deviceId: string
  generation: number
  envelope: string
  createdAt: string
}

export interface MlsMessageRecord {
  id: string
  hubId: string
  recipientDeviceId: string
  messageType: string
  payload: unknown
  createdAt: string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CryptoKeysService {
  constructor(private readonly db: Database) {}

  // -------------------------------------------------------------------------
  // Sigchain
  // -------------------------------------------------------------------------

  /**
   * Fetch the full sigchain for a user, ordered by seqNo ascending.
   */
  async getSigchain(userPubkey: string): Promise<SigchainLinkRecord[]> {
    const rows = await this.db
      .select()
      .from(sigchainLinks)
      .where(eq(sigchainLinks.userPubkey, userPubkey))
      .orderBy(asc(sigchainLinks.seqNo))

    return rows.map(r => ({
      id: r.id,
      userPubkey: r.userPubkey,
      seqNo: r.seqNo,
      linkType: r.linkType,
      payload: r.payload,
      signature: r.signature,
      prevHash: r.prevHash,
      hash: r.hash,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  /**
   * Append a new sigchain link, validating hash-chain continuity.
   *
   * The server verifies:
   *   1. seqNo === expected (last seqNo + 1, or 0 for genesis)
   *   2. prevHash matches the hash of the current chain head
   *
   * Signature validation is left to the client — the server is an honest
   * delivery service that enforces ordering, not a trust anchor.
   *
   * Returns the persisted link on success.
   */
  async appendSigchainLink(userPubkey: string, link: {
    seqNo: number
    linkType: string
    payload: unknown
    signature: string
    prevHash: string
    hash: string
  }): Promise<SigchainLinkRecord> {
    // Fetch the chain tail (highest seqNo) in one query
    const [currentHead] = await this.db
      .select({
        seqNo: sigchainLinks.seqNo,
        hash: sigchainLinks.hash,
      })
      .from(sigchainLinks)
      .where(eq(sigchainLinks.userPubkey, userPubkey))
      .orderBy(desc(sigchainLinks.seqNo))
      .limit(1)
    const expectedSeqNo = currentHead === undefined ? 0 : currentHead.seqNo + 1
    const expectedPrevHash = currentHead?.hash ?? ''

    if (link.seqNo !== expectedSeqNo) {
      throw new CryptoKeyError(
        `sigchain sequence mismatch: expected ${expectedSeqNo}, got ${link.seqNo}`,
        409,
      )
    }
    if (link.prevHash !== expectedPrevHash) {
      throw new CryptoKeyError(
        'sigchain prevHash mismatch: does not match current chain head',
        409,
      )
    }

    const [inserted] = await this.db
      .insert(sigchainLinks)
      .values({
        userPubkey,
        seqNo: link.seqNo,
        linkType: link.linkType,
        payload: link.payload,
        signature: link.signature,
        prevHash: link.prevHash,
        hash: link.hash,
      })
      .returning()

    return {
      id: inserted.id,
      userPubkey: inserted.userPubkey,
      seqNo: inserted.seqNo,
      linkType: inserted.linkType,
      payload: inserted.payload,
      signature: inserted.signature,
      prevHash: inserted.prevHash,
      hash: inserted.hash,
      createdAt: inserted.createdAt.toISOString(),
    }
  }

  // -------------------------------------------------------------------------
  // PUK Envelopes
  // -------------------------------------------------------------------------

  /**
   * Store PUK seed envelopes for one or more devices after a rotation.
   * Existing envelopes for the same (deviceId, generation) are not duplicated
   * due to the unique constraint — callers should increment generation.
   */
  async distributePukEnvelopes(
    userPubkey: string,
    envelopes: Array<{ deviceId: string; generation: number; envelope: string }>,
  ): Promise<PukEnvelopeRecord[]> {
    if (envelopes.length === 0) return []

    const inserted = await this.db
      .insert(pukEnvelopes)
      .values(envelopes.map(e => ({
        userPubkey,
        deviceId: e.deviceId,
        generation: e.generation,
        envelope: e.envelope,
      })))
      .returning()

    return inserted.map(r => ({
      id: r.id,
      userPubkey: r.userPubkey,
      deviceId: r.deviceId,
      generation: r.generation,
      envelope: r.envelope,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  /**
   * Fetch the latest PUK envelope for a specific device.
   * Returns null if no envelope exists.
   */
  async getPukEnvelopeForDevice(
    userPubkey: string,
    deviceId: string,
  ): Promise<PukEnvelopeRecord | null> {
    // Get the maximum generation for this device
    const [maxRow] = await this.db
      .select({ maxGen: max(pukEnvelopes.generation) })
      .from(pukEnvelopes)
      .where(
        and(
          eq(pukEnvelopes.userPubkey, userPubkey),
          eq(pukEnvelopes.deviceId, deviceId),
        ),
      )

    if (maxRow.maxGen === null) return null

    const [row] = await this.db
      .select()
      .from(pukEnvelopes)
      .where(
        and(
          eq(pukEnvelopes.userPubkey, userPubkey),
          eq(pukEnvelopes.deviceId, deviceId),
          eq(pukEnvelopes.generation, maxRow.maxGen),
        ),
      )
      .limit(1)

    if (!row) return null

    return {
      id: row.id,
      userPubkey: row.userPubkey,
      deviceId: row.deviceId,
      generation: row.generation,
      envelope: row.envelope,
      createdAt: row.createdAt.toISOString(),
    }
  }

  // -------------------------------------------------------------------------
  // MLS Messages
  // -------------------------------------------------------------------------

  /**
   * Enqueue MLS messages for delivery to a set of recipient devices.
   */
  async enqueueMlsMessages(
    hubId: string,
    messages: Array<{
      recipientDeviceId: string
      messageType: string
      payload: unknown
    }>,
  ): Promise<void> {
    if (messages.length === 0) return

    await this.db.insert(mlsPendingMessages).values(
      messages.map(m => ({
        hubId,
        recipientDeviceId: m.recipientDeviceId,
        messageType: m.messageType,
        payload: m.payload,
      })),
    )
  }

  /**
   * Fetch pending MLS messages for a specific device in a hub, then delete them.
   * The server uses a fetch-and-delete pattern — messages are delivered once.
   */
  async fetchAndClearMlsMessages(
    hubId: string,
    deviceId: string,
  ): Promise<MlsMessageRecord[]> {
    const rows = await this.db
      .select()
      .from(mlsPendingMessages)
      .where(
        and(
          eq(mlsPendingMessages.hubId, hubId),
          eq(mlsPendingMessages.recipientDeviceId, deviceId),
        ),
      )

    if (rows.length === 0) return []

    // Delete fetched messages
    await this.db
      .delete(mlsPendingMessages)
      .where(
        and(
          eq(mlsPendingMessages.hubId, hubId),
          eq(mlsPendingMessages.recipientDeviceId, deviceId),
        ),
      )

    return rows.map(r => ({
      id: r.id,
      hubId: r.hubId,
      recipientDeviceId: r.recipientDeviceId,
      messageType: r.messageType,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  /**
   * Store a MLS KeyPackage uploaded by a device.
   * KeyPackages are stored as pending messages of type 'key_package' addressed
   * to the hub's group so any member can fetch them during a Welcome.
   */
  async uploadKeyPackage(
    hubId: string,
    deviceId: string,
    payload: unknown,
  ): Promise<void> {
    await this.db.insert(mlsPendingMessages).values({
      hubId,
      recipientDeviceId: deviceId,
      messageType: 'key_package',
      payload,
    })
  }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class CryptoKeyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 500 = 500,
  ) {
    super(message)
    this.name = 'CryptoKeyError'
  }
}
