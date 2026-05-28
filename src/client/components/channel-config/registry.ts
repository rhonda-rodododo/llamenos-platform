import { MessageSquare, Phone, Shield, Send, Smartphone } from 'lucide-react'
import type { MessagingChannelType } from '@protocol/schemas/settings'
import type { ChannelConfigEntry } from './types'
import { CHANNEL_SECURITY, CHANNEL_LABELS } from '@shared/types'
import { SMSChannelSection } from './sms-channel-section'
import { WhatsAppChannelSection } from './whatsapp-channel-section'
import { TelegramChannelSection } from './telegram-channel-section'
import { SignalChannelSection } from '@/components/admin-settings/signal-channel-section'
import { RCSChannelSection } from '@/components/admin-settings/rcs-channel-section'

export const channelConfigRegistry: Record<MessagingChannelType, ChannelConfigEntry> = {
  sms: {
    component: SMSChannelSection,
    label: CHANNEL_LABELS.sms,
    icon: Phone,
    security: CHANNEL_SECURITY.sms,
    hasA2pApproval: true,
    requiresTelephonyProvider: true,
  },
  whatsapp: {
    component: WhatsAppChannelSection,
    label: CHANNEL_LABELS.whatsapp,
    icon: MessageSquare,
    security: CHANNEL_SECURITY.whatsapp,
    hasA2pApproval: false,
    requiresTelephonyProvider: false,
  },
  signal: {
    component: SignalChannelSection,
    label: CHANNEL_LABELS.signal,
    icon: Shield,
    security: CHANNEL_SECURITY.signal,
    hasA2pApproval: false,
    requiresTelephonyProvider: false,
  },
  telegram: {
    component: TelegramChannelSection,
    label: CHANNEL_LABELS.telegram,
    icon: Send,
    security: CHANNEL_SECURITY.telegram,
    hasA2pApproval: false,
    requiresTelephonyProvider: false,
  },
  rcs: {
    component: RCSChannelSection,
    label: CHANNEL_LABELS.rcs,
    icon: Smartphone,
    security: CHANNEL_SECURITY.rcs,
    hasA2pApproval: false,
    requiresTelephonyProvider: false,
  },
}

/** Ordered list of channels for consistent rendering */
export const CHANNEL_ORDER: MessagingChannelType[] = ['sms', 'whatsapp', 'signal', 'telegram', 'rcs']
