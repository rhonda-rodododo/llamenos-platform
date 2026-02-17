import type {
  MessagingAdapter,
  IncomingMessage,
  SendMessageParams,
  SendMediaParams,
  SendResult,
  ChannelStatus,
} from '../adapter'
import type { MessagingChannelType } from '../../../shared/types'

/**
 * AsteriskSMSAdapter -- thin delegation wrapper for Asterisk.
 * Asterisk has limited native SMS support, so this adapter delegates
 * all messaging operations to another provider (typically Twilio).
 * This keeps the factory/config pattern consistent: when the telephony
 * provider is Asterisk, SMS still works through a delegate.
 */
export class AsteriskSMSAdapter implements MessagingAdapter {
  readonly channelType: MessagingChannelType = 'sms' as const

  private delegate: MessagingAdapter

  constructor(delegateAdapter: MessagingAdapter) {
    this.delegate = delegateAdapter
  }

  async parseIncomingMessage(request: Request): Promise<IncomingMessage> {
    return this.delegate.parseIncomingMessage(request)
  }

  async validateWebhook(request: Request): Promise<boolean> {
    return this.delegate.validateWebhook(request)
  }

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    return this.delegate.sendMessage(params)
  }

  async sendMediaMessage(params: SendMediaParams): Promise<SendResult> {
    return this.delegate.sendMediaMessage(params)
  }

  async getChannelStatus(): Promise<ChannelStatus> {
    const delegateStatus = await this.delegate.getChannelStatus()

    return {
      connected: delegateStatus.connected,
      details: {
        ...delegateStatus.details,
        provider: 'asterisk',
        delegateProvider: delegateStatus.details?.provider ?? 'unknown',
        note: 'Asterisk SMS is delegated to an external provider. Voice is handled by Asterisk; SMS by the delegate.',
      },
      error: delegateStatus.error,
    }
  }
}
