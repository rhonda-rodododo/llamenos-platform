import { eq, and } from 'drizzle-orm'
import type { Database } from '../../db'
import {
  hubOnboardingState,
  providerConfigs,
  providerTemplates,
} from '../../db/schema'
import { SettingsService } from '../settings'
import { ProviderSetup } from './index'
import { ProviderApiError } from './types'
import type {
  ChannelConfig,
  HubOnboardingState,
  HubSetupStatus,
  HubUsage,
} from '@protocol/schemas/provider-setup'

const ONBOARDING_STEPS = [
  'template_selection',
  'channel_selection',
  'provider_connection',
  'phone_number',
  'channel_setup',
  'completion',
] as const

type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

function isValidStep(step: string): step is OnboardingStep {
  return ONBOARDING_STEPS.includes(step as OnboardingStep)
}

function getNextStep(current: OnboardingStep): OnboardingStep | null {
  const idx = ONBOARDING_STEPS.indexOf(current)
  if (idx === -1 || idx >= ONBOARDING_STEPS.length - 1) return null
  return ONBOARDING_STEPS[idx + 1]
}

export class HubOnboardService {
  private readonly settings: SettingsService

  constructor(
    private readonly db: Database,
    private readonly providerSetup: ProviderSetup,
  ) {
    this.settings = new SettingsService(db)
  }

  async startOnboarding(
    hubId: string,
    templateId?: string,
  ): Promise<HubOnboardingState> {
    const now = new Date().toISOString()

    let channelConfig: ChannelConfig = {
      voice: false,
      sms: false,
      email: false,
      signal: false,
      whatsapp: false,
      telegram: false,
      rcs: false,
    }

    if (templateId) {
      const [template] = await this.db
        .select()
        .from(providerTemplates)
        .where(eq(providerTemplates.id, templateId))
        .limit(1)

      if (template) {
        for (const ch of template.defaultChannels as string[]) {
          if (ch in channelConfig) {
            channelConfig[ch as keyof ChannelConfig] = true
          }
        }
      }
    }

    await this.db
      .insert(hubOnboardingState)
      .values({
        hubId,
        templateId: templateId ?? null,
        currentStep: 'template_selection',
        completedSteps: [],
        channelConfig,
        isComplete: false,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: hubOnboardingState.hubId,
        set: {
          templateId: templateId ?? null,
          currentStep: 'template_selection',
          completedSteps: [],
          channelConfig,
          isComplete: false,
          updatedAt: now,
        },
      })

    return {
      hubId,
      templateId,
      currentStep: 'template_selection',
      completedSteps: [],
      channelConfig,
      isComplete: false,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getOnboardingStatus(hubId: string): Promise<HubOnboardingState | null> {
    const [row] = await this.db
      .select()
      .from(hubOnboardingState)
      .where(eq(hubOnboardingState.hubId, hubId))
      .limit(1)

    if (!row) return null

    return {
      hubId: row.hubId,
      templateId: row.templateId ?? undefined,
      currentStep: row.currentStep,
      completedSteps: (row.completedSteps as string[]) ?? [],
      channelConfig: (row.channelConfig as ChannelConfig) ?? {},
      isComplete: row.isComplete,
      createdAt: row.createdAt?.toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
    }
  }

  async completeStep(
    hubId: string,
    step: string,
    data?: Record<string, unknown>,
  ): Promise<HubOnboardingState> {
    if (!isValidStep(step)) {
      throw new ProviderApiError(`Invalid step: ${step}`, 400, 'Invalid step')
    }

    const [row] = await this.db
      .select()
      .from(hubOnboardingState)
      .where(eq(hubOnboardingState.hubId, hubId))
      .limit(1)

    if (!row) {
      throw new ProviderApiError('Onboarding not started', 404, 'Not found')
    }

    const completed = new Set<string>(row.completedSteps as string[])
    const currentIdx = ONBOARDING_STEPS.indexOf(row.currentStep as OnboardingStep)
    const stepIdx = ONBOARDING_STEPS.indexOf(step as OnboardingStep)

    if (stepIdx < currentIdx) {
      throw new ProviderApiError(
        'Cannot complete a previous step',
        400,
        'Invalid step progression',
      )
    }

    if (stepIdx > currentIdx + 1) {
      throw new ProviderApiError(
        'Cannot skip steps',
        400,
        'Invalid step progression',
      )
    }

    completed.add(step)
    const nextStep = getNextStep(step as OnboardingStep)

    const updates: Record<string, unknown> = {
      completedSteps: Array.from(completed),
      updatedAt: new Date().toISOString(),
    }

    if (nextStep) {
      updates.currentStep = nextStep
    } else {
      updates.currentStep = 'completion'
      updates.isComplete = true
    }

    if (data?.channelConfig) {
      updates.channelConfig = {
        ...(row.channelConfig as Record<string, unknown>),
        ...(data.channelConfig as Record<string, unknown>),
      }
    }

    await this.db
      .update(hubOnboardingState)
      .set(updates)
      .where(eq(hubOnboardingState.hubId, hubId))

    return this.getOnboardingStatus(hubId) as Promise<HubOnboardingState>
  }

  async getHubSetupStatus(hubId: string): Promise<HubSetupStatus> {
    const [config] = await this.db
      .select()
      .from(providerConfigs)
      .where(eq(providerConfigs.hubId, hubId))
      .limit(1)

    const onboarding = await this.getOnboardingStatus(hubId)
    const settings = await this.settings.getHubProviderSettings(hubId)

    const channelsConfigured: string[] = []
    const channelsPending: string[] = []

    const channelConfig = (onboarding?.channelConfig ?? settings.channels ?? {}) as ChannelConfig
    for (const [channel, enabled] of Object.entries(channelConfig)) {
      if (enabled) {
        channelsConfigured.push(channel)
      } else {
        channelsPending.push(channel)
      }
    }

    return {
      hubId,
      providerConnected: config?.status === 'connected',
      providerType: config?.providerType as HubSetupStatus['providerType'],
      numbersProvisioned: (config?.phoneNumbers as string[])?.length ?? 0,
      channelsConfigured: channelsConfigured as HubSetupStatus['channelsConfigured'],
      channelsPending: channelsPending as HubSetupStatus['channelsPending'],
      a2pStatus: settings.subAccountEnabled ? 'configured' : undefined,
      onboardingComplete: onboarding?.isComplete ?? false,
    }
  }

  async completeOnboarding(hubId: string): Promise<{ ok: true }> {
    await this.db
      .update(hubOnboardingState)
      .set({
        isComplete: true,
        currentStep: 'completion',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(hubOnboardingState.hubId, hubId))

    const settings = await this.settings.getHubSettings(hubId)
    await this.settings.updateHubSettings(hubId, {
      ...settings,
      providerSetupComplete: true,
    })

    return { ok: true }
  }

  async getHubUsage(hubId: string): Promise<HubUsage> {
    const settings = await this.settings.getHubSettings(hubId)
    const usage = (settings.usage as HubUsage[]) ?? []

    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const current = usage.find((u) => u.month === month)

    return (
      current ?? {
        month,
        year: now.getFullYear(),
        phoneNumbers: 0,
        smsSent: 0,
        callsReceived: 0,
        signalMessagesSent: 0,
        whatsAppMessagesSent: 0,
      }
    )
  }

  async checkQuota(
    hubId: string,
    resource: string,
  ): Promise<{ allowed: boolean; limit: number; current: number }> {
    const settings = await this.settings.getHubSettings(hubId)
    const quotas = (settings.quotas as Record<string, number>) ?? {}
    const usage = (settings.usage as HubUsage[]) ?? []

    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentMonth = usage.find((u) => u.month === month)

    const limit = quotas[resource] ?? 0
    const current = (currentMonth?.[resource as keyof HubUsage] as number) ?? 0

    return { allowed: limit === 0 || current < limit, limit, current }
  }

  async enableChannel(hubId: string, channel: string): Promise<ChannelConfig> {
    const settings = await this.settings.getHubSettings(hubId)
    const channels = { ...(settings.channels as ChannelConfig) }
    if (channel in channels) {
      channels[channel as keyof ChannelConfig] = true
    }
    await this.settings.updateHubSettings(hubId, { ...settings, channels })
    return channels
  }

  async disableChannel(hubId: string, channel: string): Promise<ChannelConfig> {
    const settings = await this.settings.getHubSettings(hubId)
    const channels = { ...(settings.channels as ChannelConfig) }
    if (channel in channels) {
      channels[channel as keyof ChannelConfig] = false
    }
    await this.settings.updateHubSettings(hubId, { ...settings, channels })
    return channels
  }

  async switchProvider(
    hubId: string,
    newProviderType: string,
  ): Promise<{ ok: true }> {
    await this.db
      .delete(providerConfigs)
      .where(eq(providerConfigs.hubId, hubId))

    await this.db.insert(providerConfigs).values({
      id: crypto.randomUUID(),
      hubId,
      providerType: newProviderType,
      status: 'disconnected',
      capabilities: [],
      phoneNumbers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return { ok: true }
  }

  async provisionSubAccount(
    hubId: string,
    masterConfigId: string,
  ): Promise<{ subAccountId: string }> {
    const [master] = await this.db
      .select()
      .from(providerConfigs)
      .where(eq(providerConfigs.id, masterConfigId))
      .limit(1)

    if (!master) {
      throw new ProviderApiError('Master config not found', 404, 'Not found')
    }

    const subAccountId = crypto.randomUUID()

    await this.db.insert(providerConfigs).values({
      id: subAccountId,
      hubId,
      providerType: master.providerType,
      status: 'disconnected',
      capabilities: master.capabilities,
      phoneNumbers: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const settings = await this.settings.getHubSettings(hubId)
    await this.settings.updateHubSettings(hubId, {
      ...settings,
      subAccountEnabled: true,
      subAccountConfigId: subAccountId,
    })

    return { subAccountId }
  }
}
