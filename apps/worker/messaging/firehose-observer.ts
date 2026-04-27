/**
 * Firehose Observer — intercepts Signal group messages and buffers them
 * for connected firehose inference agents.
 *
 * This observer is invoked from the messaging router when a Signal webhook
 * arrives with a group message. If the group is linked to an active firehose
 * connection, the message is encrypted and buffered for later extraction.
 *
 * Privacy: The message content and sender info are envelope-encrypted
 * before storage — only the firehose agent's nsec can decrypt them.
 */
import { LABEL_FIREHOSE_BUFFER_ENCRYPT } from '@shared/crypto-labels'
import { encryptMessageForStorage } from '../lib/crypto'
import { createLogger } from '../lib/logger'
import type { FirehoseService } from '../services/firehose'

const log = createLogger('messaging.firehose-observer')

export interface FirehoseGroupMessage {
  signalGroupId: string
  senderIdentifier: string
  senderIdentifierHash: string
  senderUsername: string
  content: string
  timestamp: Date
  hubId?: string
}

/**
 * Check if a Signal group message should be buffered for a firehose connection,
 * and if so, encrypt and store it.
 *
 * Returns true if the message was buffered (connection found and active).
 */
export async function observeFirehoseMessage(
  firehose: FirehoseService,
  msg: FirehoseGroupMessage,
): Promise<boolean> {
  // Look up connection by signal group ID
  const conn = await firehose.findConnectionBySignalGroup(msg.signalGroupId, msg.hubId)
  if (!conn) return false
  if (conn.status !== 'active') return false

  try {
    // Encrypt message content for the agent
    const { encryptedContent, readerEnvelopes } = encryptMessageForStorage(
      msg.content,
      [conn.agentPubkey],
    )

    const contentEnvelope = JSON.stringify({
      encrypted: encryptedContent,
      envelopes: readerEnvelopes,
    })

    // Encrypt sender info separately (data minimization — agent only needs
    // username for extraction, not the actual phone number)
    const senderInfo = JSON.stringify({
      identifier: msg.senderIdentifier,
      identifierHash: msg.senderIdentifierHash,
      username: msg.senderUsername,
      timestamp: msg.timestamp.getTime(),
    })

    const { encryptedContent: encSender, readerEnvelopes: senderEnvelopes } = encryptMessageForStorage(
      senderInfo,
      [conn.agentPubkey],
    )

    const senderEnvelope = JSON.stringify({
      encrypted: encSender,
      envelopes: senderEnvelopes,
    })

    // Calculate expiry based on connection's buffer TTL
    const expiresAt = new Date(
      msg.timestamp.getTime() + conn.bufferTtlDays * 24 * 60 * 60 * 1000,
    )

    await firehose.addBufferMessage(conn.id, {
      signalTimestamp: msg.timestamp,
      encryptedContent: contentEnvelope,
      encryptedSenderInfo: senderEnvelope,
      expiresAt,
    })

    log.info('Buffered firehose message', {
      connectionId: conn.id,
      groupId: msg.signalGroupId,
    })

    return true
  } catch (err) {
    log.error('Failed to buffer firehose message', {
      connectionId: conn.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
