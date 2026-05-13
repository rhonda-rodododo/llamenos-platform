# EP05a: Channel Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dynamic channel config registry on desktop, extract shared primitives from existing Signal/RCS sections, add SMS/WhatsApp/Telegram channel config sections across all platforms (desktop + iOS + Android), and wire up A2P registration management in settings.

**Architecture:** A frontend channel config registry maps each `MessagingChannelType` to its config component, icon, and metadata. The admin settings page iterates the registry instead of hardcoding channel imports. Shared primitives (`ChannelStatusBanner`, `ConnectionTestButton`, `AutoResponseFields`, `A2pRegistrationPanel`) are extracted from existing patterns and reused by all channel sections. iOS and Android implement equivalent registry-driven channel config lists natively.

**Tech Stack:** React + shadcn/ui + Lucide (desktop), SwiftUI (iOS), Kotlin/Compose + Material 3 + Hilt (Android), Bun/Hono (backend API), packages/i18n (localization), Playwright (E2E), BDD (backend)

**Spec:** `docs/superpowers/specs/2026-05-11-EP05-messaging-blast-system-design.md`

---

## File Structure

### Desktop (new)
- `src/client/components/channel-config/types.ts` — ChannelConfigProps, ChannelConfigEntry interfaces
- `src/client/components/channel-config/registry.ts` — Channel config registry (type to component mapping)
- `src/client/components/channel-config/channel-status-banner.tsx` — Shared: enabled/disabled + security + A2P status badges
- `src/client/components/channel-config/connection-test-button.tsx` — Shared: async test with success/failure badge
- `src/client/components/channel-config/auto-response-fields.tsx` — Shared: autoResponse + afterHoursResponse textareas
- `src/client/components/channel-config/a2p-registration-panel.tsx` — Shared: A2P brand/campaign forms + status polling
- `src/client/components/channel-config/sms-channel-section.tsx` — SMS config
- `src/client/components/channel-config/whatsapp-channel-section.tsx` — WhatsApp config
- `src/client/components/channel-config/telegram-channel-section.tsx` — Telegram config

### Desktop (modify)
- `src/client/lib/api.ts` — Add A2P API client functions
- `src/client/routes/admin/settings.tsx` — Replace hardcoded channel imports with registry iteration
- `src/client/components/admin-settings/signal-channel-section.tsx` — Refactor to use shared primitives
- `src/client/components/admin-settings/rcs-channel-section.tsx` — Refactor to use shared primitives

### iOS (new)
- `apps/ios/Sources/Services/MessagingConfigService.swift` — API client for messaging config + A2P
- `apps/ios/Sources/Views/Settings/Channels/ChannelConfigListView.swift` — Dynamic channel list from registry
- `apps/ios/Sources/Views/Settings/Channels/SMSChannelConfigView.swift` — SMS config + A2P panel
- `apps/ios/Sources/Views/Settings/Channels/WhatsAppChannelConfigView.swift` — WhatsApp config
- `apps/ios/Sources/Views/Settings/Channels/TelegramChannelConfigView.swift` — Telegram config
- `apps/ios/Sources/Views/Settings/Channels/SignalChannelConfigView.swift` — Signal config (native equivalent)
- `apps/ios/Sources/Views/Settings/Channels/RCSChannelConfigView.swift` — RCS config (native equivalent)
- `apps/ios/Sources/Views/Settings/Channels/A2pRegistrationView.swift` — Shared A2P panel
- `apps/ios/Sources/Views/Settings/Channels/ConnectionTestButton.swift` — Shared test button
- `apps/ios/Sources/Views/Settings/Channels/AutoResponseFields.swift` — Shared auto-response fields
- `apps/ios/Tests/LlamenosTests/MessagingConfigServiceTests.swift` — Unit tests
- `apps/ios/Tests/LlamenosUITests/ChannelConfigUITests.swift` — XCUITests

### Android (new)
- `apps/android/app/src/main/java/org/llamenos/hotline/api/MessagingConfigRepository.kt` — API client
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/ChannelConfigListScreen.kt` — Dynamic channel list
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/ChannelConfigViewModel.kt` — ViewModel for channel config
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/SmsChannelConfigScreen.kt` — SMS config + A2P panel
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/WhatsAppChannelConfigScreen.kt` — WhatsApp config
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/TelegramChannelConfigScreen.kt` — Telegram config
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/SignalChannelConfigScreen.kt` — Signal config
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/RcsChannelConfigScreen.kt` — RCS config
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/A2pRegistrationSection.kt` — Shared A2P panel
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/ConnectionTestButton.kt` — Shared test button
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/AutoResponseFields.kt` — Shared auto-response fields
- `apps/android/app/src/test/java/org/llamenos/hotline/api/MessagingConfigRepositoryTest.kt` — Unit tests
- `apps/android/app/src/androidTest/java/org/llamenos/hotline/ui/admin/channels/ChannelConfigScreenTest.kt` — UI tests

### i18n (modify)
- `packages/i18n/locales/en.json` — Add ~25 channel config keys
- `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json` — Translations

### BDD (new)
- `packages/test-specs/features/admin/channel-config.feature` — Gherkin scenarios
- `tests/steps/backend/channel-config.steps.ts` — Step definitions

### Playwright (new)
- `tests/channel-config.spec.ts` — Desktop E2E tests

---

## Task 1: Channel Config Types and Registry

**Files:**
- New: `src/client/components/channel-config/types.ts`
- New: `src/client/components/channel-config/registry.ts`

- [ ] **Step 1: Create the types file**

Create `src/client/components/channel-config/types.ts`:

```typescript
import type { LucideIcon } from 'lucide-react'
import type { MessagingConfig } from '@shared/types'
import type { MessagingChannelType } from '@protocol/schemas/settings'
import type { TransportSecurity } from '@shared/types'

export interface ChannelConfigProps {
  config: MessagingConfig
  onConfigChange: (config: MessagingConfig) => void
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
}

export interface ChannelConfigEntry {
  component: React.ComponentType<ChannelConfigProps>
  label: string
  icon: LucideIcon
  security: TransportSecurity
  hasA2pApproval: boolean
  requiresTelephonyProvider: boolean
}
```

- [ ] **Step 2: Create the registry file with stubs**

Create `src/client/components/channel-config/registry.ts`:

```typescript
import { lazy } from 'react'
import { MessageSquare, Phone, Shield, Send, Smartphone } from 'lucide-react'
import type { MessagingChannelType } from '@protocol/schemas/settings'
import type { ChannelConfigEntry } from './types'
import { CHANNEL_SECURITY, CHANNEL_LABELS } from '@shared/types'

// Lazy-loaded channel config components
const SMSChannelSection = lazy(() =>
  import('./sms-channel-section').then(m => ({ default: m.SMSChannelSection }))
)
const WhatsAppChannelSection = lazy(() =>
  import('./whatsapp-channel-section').then(m => ({ default: m.WhatsAppChannelSection }))
)
const TelegramChannelSection = lazy(() =>
  import('./telegram-channel-section').then(m => ({ default: m.TelegramChannelSection }))
)
const SignalChannelSection = lazy(() =>
  import('@/components/admin-settings/signal-channel-section').then(m => ({ default: m.SignalChannelSection }))
)
const RCSChannelSection = lazy(() =>
  import('@/components/admin-settings/rcs-channel-section').then(m => ({ default: m.RCSChannelSection }))
)

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
```

- [ ] **Step 3: Verify types compile**

Run: `bun run typecheck`
Expected: Should pass (channel section components do not exist yet but are lazy-loaded, so TS only checks the import paths at build time).

- [ ] **Step 4: Commit**

```bash
git add src/client/components/channel-config/types.ts src/client/components/channel-config/registry.ts
git commit -m "feat(channels): add channel config types and registry for dynamic channel rendering"
```

---

## Task 2: Shared Primitive — ConnectionTestButton

**Files:**
- New: `src/client/components/channel-config/connection-test-button.tsx`

- [ ] **Step 1: Create the ConnectionTestButton component**

Create `src/client/components/channel-config/connection-test-button.tsx`:

```typescript
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { testMessagingChannel } from '@/lib/api'

interface ConnectionTestButtonProps {
  channel: string
  disabled?: boolean
}

export function ConnectionTestButton({ channel, disabled }: ConnectionTestButtonProps) {
  const { t } = useTranslation()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testMessagingChannel(channel)
      setTestResult(res.connected)
    } catch {
      setTestResult(false)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={handleTest} disabled={disabled || testing} data-testid={`test-${channel}-btn`}>
        {testing ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> {t('channels.shared.testing')}</>
        ) : (
          t('channels.shared.testConnection')
        )}
      </Button>
      {testResult !== null && (
        <Badge variant="outline" className={testResult ? 'text-green-600' : 'text-red-600'}>
          {testResult ? (
            <><CheckCircle2 className="h-3 w-3" /> {t('channels.shared.testSuccess')}</>
          ) : (
            <><XCircle className="h-3 w-3" /> {t('channels.shared.testFailed')}</>
          )}
        </Badge>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/channel-config/connection-test-button.tsx
git commit -m "feat(channels): add shared ConnectionTestButton primitive"
```

---

## Task 3: Shared Primitive — AutoResponseFields

**Files:**
- New: `src/client/components/channel-config/auto-response-fields.tsx`

- [ ] **Step 1: Create the AutoResponseFields component**

Create `src/client/components/channel-config/auto-response-fields.tsx`:

```typescript
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface AutoResponseFieldsProps {
  autoResponse: string
  afterHoursResponse: string
  onAutoResponseChange: (value: string) => void
  onAfterHoursResponseChange: (value: string) => void
  idPrefix: string
}

export function AutoResponseFields({
  autoResponse,
  afterHoursResponse,
  onAutoResponseChange,
  onAfterHoursResponseChange,
  idPrefix,
}: AutoResponseFieldsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-auto-response`}>
          {t('channels.shared.autoResponse')}
        </Label>
        <Textarea
          id={`${idPrefix}-auto-response`}
          value={autoResponse}
          onChange={(e) => onAutoResponseChange(e.target.value)}
          placeholder={t('channels.shared.autoResponsePlaceholder')}
          rows={2}
          data-testid={`${idPrefix}-auto-response`}
        />
        <p className="text-xs text-muted-foreground">
          {t('channels.shared.autoResponseHelp')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-after-hours`}>
          {t('channels.shared.afterHoursResponse')}
        </Label>
        <Textarea
          id={`${idPrefix}-after-hours`}
          value={afterHoursResponse}
          onChange={(e) => onAfterHoursResponseChange(e.target.value)}
          placeholder={t('channels.shared.afterHoursPlaceholder')}
          rows={2}
          data-testid={`${idPrefix}-after-hours`}
        />
        <p className="text-xs text-muted-foreground">
          {t('channels.shared.afterHoursHelp')}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/channel-config/auto-response-fields.tsx
git commit -m "feat(channels): add shared AutoResponseFields primitive"
```

---

## Task 4: Shared Primitive — ChannelStatusBanner

**Files:**
- New: `src/client/components/channel-config/channel-status-banner.tsx`

- [ ] **Step 1: Create the ChannelStatusBanner component**

Create `src/client/components/channel-config/channel-status-banner.tsx`:

```typescript
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Shield, ShieldAlert, ShieldOff, ShieldCheck } from 'lucide-react'
import type { TransportSecurity } from '@shared/types'
import type { BrandStatus, CampaignStatus } from '@worker/services/provider-setup/a2p-registration'

interface ChannelStatusBannerProps {
  channelName: string
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  security: TransportSecurity
  a2pBrandStatus?: BrandStatus
  a2pCampaignStatus?: CampaignStatus
}

const securityIcons: Record<TransportSecurity, typeof Shield> = {
  none: ShieldOff,
  'provider-encrypted': ShieldAlert,
  'e2ee-to-bridge': ShieldCheck,
  e2ee: Shield,
}

const securityColors: Record<TransportSecurity, string> = {
  none: 'text-red-600',
  'provider-encrypted': 'text-yellow-600',
  'e2ee-to-bridge': 'text-blue-600',
  e2ee: 'text-green-600',
}

export function ChannelStatusBanner({
  channelName,
  enabled,
  onEnabledChange,
  security,
  a2pBrandStatus,
  a2pCampaignStatus,
}: ChannelStatusBannerProps) {
  const { t } = useTranslation()
  const SecurityIcon = securityIcons[security]

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label htmlFor={`${channelName}-enabled`} className="font-medium">
            {t('channels.shared.enableChannel', { channel: channelName })}
          </Label>
        </div>
        <Switch
          id={`${channelName}-enabled`}
          checked={enabled}
          onCheckedChange={onEnabledChange}
          data-testid={`${channelName}-enabled-toggle`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={securityColors[security]}>
          <SecurityIcon className="mr-1 h-3 w-3" />
          {t(`channels.shared.security.${security}`)}
        </Badge>

        {a2pBrandStatus && a2pBrandStatus !== 'skipped' && (
          <Badge
            variant="outline"
            className={
              a2pBrandStatus === 'approved' ? 'text-green-600' :
              a2pBrandStatus === 'pending' ? 'text-yellow-600' :
              a2pBrandStatus === 'failed' ? 'text-red-600' :
              'text-muted-foreground'
            }
          >
            {t('channels.a2p.brandStatus', { status: t(`channels.a2p.status.${a2pBrandStatus}`) })}
          </Badge>
        )}

        {a2pCampaignStatus && a2pCampaignStatus !== 'skipped' && (
          <Badge
            variant="outline"
            className={
              a2pCampaignStatus === 'approved' ? 'text-green-600' :
              a2pCampaignStatus === 'pending' ? 'text-yellow-600' :
              a2pCampaignStatus === 'failed' ? 'text-red-600' :
              'text-muted-foreground'
            }
          >
            {t('channels.a2p.campaignStatus', { status: t(`channels.a2p.status.${a2pCampaignStatus}`) })}
          </Badge>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/channel-config/channel-status-banner.tsx
git commit -m "feat(channels): add shared ChannelStatusBanner with security and A2P badges"
```

---

## Task 5: A2P API Client Functions

**Files:**
- Modify: `src/client/lib/api.ts`

- [ ] **Step 1: Add A2P API functions to the client**

In `src/client/lib/api.ts`, add after the `testMessagingChannel` function (around line 1032):

```typescript
// --- A2P Registration ---

export interface A2pRegistration {
  id: string
  hubId: string
  providerType: string
  brandStatus: 'not_submitted' | 'pending' | 'approved' | 'failed' | 'skipped'
  campaignStatus: 'not_submitted' | 'pending' | 'approved' | 'failed' | 'skipped'
  brandSidMasked: string | null
  campaignSidMasked: string | null
  error: string | null
  submittedAt: string | null
  approvedAt: string | null
}

export interface BrandInfo {
  entityType: string
  companyName: string
  ein: string
  phone: string
  street: string
  city: string
  state: string
  postalCode: string
  country: string
  email: string
  website?: string
  vertical?: string
}

export interface CampaignInfo {
  useCase: string
  description: string
  helpMessage: string
  optinMessage: string
  optoutMessage: string
  sampleMessages: string[]
  embeddedLink?: boolean
  embeddedPhone?: boolean
  subscriberOptin?: boolean
  subscriberOptout?: boolean
  subscriberHelp?: boolean
}

export async function getA2pStatus(hubId: string): Promise<A2pRegistration | null> {
  try {
    return await request<A2pRegistration>(`/provider-setup/a2p/status?hubId=${hubId}`)
  } catch {
    return null
  }
}

export async function submitA2pBrand(hubId: string, brandInfo: BrandInfo): Promise<A2pRegistration> {
  return request<A2pRegistration>('/provider-setup/a2p/brand', {
    method: 'POST',
    body: JSON.stringify({ hubId, brandInfo }),
  })
}

export async function submitA2pCampaign(registrationId: string, hubId: string, campaignInfo: CampaignInfo): Promise<A2pRegistration> {
  return request<A2pRegistration>('/provider-setup/a2p/campaign', {
    method: 'POST',
    body: JSON.stringify({ registrationId, hubId, campaignInfo }),
  })
}

export async function skipA2p(hubId: string): Promise<A2pRegistration> {
  return request<A2pRegistration>('/provider-setup/a2p/skip', {
    method: 'POST',
    body: JSON.stringify({ hubId }),
  })
}
```

- [ ] **Step 2: Verify types compile**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/client/lib/api.ts
git commit -m "feat(api): add A2P registration client functions for brand/campaign management"
```

---

## Task 6: Shared Primitive — A2pRegistrationPanel

**Files:**
- New: `src/client/components/channel-config/a2p-registration-panel.tsx`

- [ ] **Step 1: Create the A2pRegistrationPanel component**

Create `src/client/components/channel-config/a2p-registration-panel.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import {
  getA2pStatus,
  submitA2pBrand,
  submitA2pCampaign,
  skipA2p,
  type A2pRegistration,
  type BrandInfo,
  type CampaignInfo,
} from '@/lib/api'
import { useAuth } from '@/lib/auth'

interface A2pRegistrationPanelProps {
  hubId: string
}

const ENTITY_TYPES = ['PRIVATE_PROFIT', 'PUBLIC_PROFIT', 'NON_PROFIT', 'GOVERNMENT'] as const

const USE_CASES = [
  'LOW_VOLUME', '2FA', 'ACCOUNT_NOTIFICATION', 'CUSTOMER_CARE',
  'DELIVERY_NOTIFICATION', 'FRAUD_ALERT', 'HIGHER_EDUCATION', 'K12',
  'MARKETING', 'MIXED', 'POLITICAL', 'PUBLIC_SERVICE_ANNOUNCEMENT',
  'SECURITY_ALERT', 'SOCIAL', 'SWEEPSTAKE',
] as const

export function A2pRegistrationPanel({ hubId }: A2pRegistrationPanelProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [registration, setRegistration] = useState<A2pRegistration | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showBrandForm, setShowBrandForm] = useState(false)
  const [showCampaignForm, setShowCampaignForm] = useState(false)

  // Brand form state
  const [brandInfo, setBrandInfo] = useState<BrandInfo>({
    entityType: 'NON_PROFIT',
    companyName: '',
    ein: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
    email: '',
  })

  // Campaign form state
  const [campaignInfo, setCampaignInfo] = useState<CampaignInfo>({
    useCase: 'PUBLIC_SERVICE_ANNOUNCEMENT',
    description: '',
    helpMessage: '',
    optinMessage: '',
    optoutMessage: '',
    sampleMessages: [''],
    subscriberOptin: true,
    subscriberOptout: true,
    subscriberHelp: true,
  })

  useEffect(() => {
    loadStatus()
  }, [hubId])

  async function loadStatus() {
    setLoading(true)
    try {
      const status = await getA2pStatus(hubId)
      setRegistration(status)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitBrand() {
    setSubmitting(true)
    try {
      const result = await submitA2pBrand(hubId, brandInfo)
      setRegistration(result)
      setShowBrandForm(false)
      toast(t('channels.a2p.brandSubmitted'), 'success')
    } catch {
      toast(t('channels.a2p.brandError'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitCampaign() {
    if (!registration) return
    setSubmitting(true)
    try {
      const result = await submitA2pCampaign(registration.id, hubId, campaignInfo)
      setRegistration(result)
      setShowCampaignForm(false)
      toast(t('channels.a2p.campaignSubmitted'), 'success')
    } catch {
      toast(t('channels.a2p.campaignError'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSkip() {
    setSubmitting(true)
    try {
      const result = await skipA2p(hubId)
      setRegistration(result)
      toast(t('channels.a2p.skipped'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function updateBrand(updates: Partial<BrandInfo>) {
    setBrandInfo(prev => ({ ...prev, ...updates }))
  }

  function updateCampaign(updates: Partial<CampaignInfo>) {
    setCampaignInfo(prev => ({ ...prev, ...updates }))
  }

  function updateSampleMessage(index: number, value: string) {
    setCampaignInfo(prev => {
      const messages = [...prev.sampleMessages]
      messages[index] = value
      return { ...prev, sampleMessages: messages }
    })
  }

  function addSampleMessage() {
    setCampaignInfo(prev => ({
      ...prev,
      sampleMessages: [...prev.sampleMessages, ''],
    }))
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    )
  }

  const brandStatus = registration?.brandStatus ?? 'not_submitted'
  const campaignStatus = registration?.campaignStatus ?? 'not_submitted'
  const needsBrand = brandStatus === 'not_submitted' || brandStatus === 'failed'
  const needsCampaign = brandStatus === 'approved' && (campaignStatus === 'not_submitted' || campaignStatus === 'failed')
  const isComplete = brandStatus === 'approved' && campaignStatus === 'approved'
  const isSkipped = brandStatus === 'skipped'

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">{t('channels.a2p.title')}</h4>
        <Button variant="ghost" size="sm" onClick={loadStatus} disabled={loading}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t('channels.a2p.description')}
      </p>

      {/* Status display */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant="outline"
          className={
            isComplete ? 'text-green-600' :
            isSkipped ? 'text-muted-foreground' :
            brandStatus === 'pending' || campaignStatus === 'pending' ? 'text-yellow-600' :
            brandStatus === 'failed' || campaignStatus === 'failed' ? 'text-red-600' :
            'text-muted-foreground'
          }
        >
          {isComplete ? (
            <><CheckCircle2 className="mr-1 h-3 w-3" /> {t('channels.a2p.approved')}</>
          ) : isSkipped ? (
            t('channels.a2p.statusSkipped')
          ) : brandStatus === 'failed' || campaignStatus === 'failed' ? (
            <><XCircle className="mr-1 h-3 w-3" /> {t('channels.a2p.statusFailed')}</>
          ) : brandStatus === 'pending' || campaignStatus === 'pending' ? (
            <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> {t('channels.a2p.statusPending')}</>
          ) : (
            t('channels.a2p.statusNotSubmitted')
          )}
        </Badge>

        {registration?.error && (
          <div className="w-full rounded-md border border-red-200 bg-red-50 p-2 dark:border-red-800 dark:bg-red-950/30">
            <p className="text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="inline mr-1 h-3 w-3" />
              {registration.error}
            </p>
          </div>
        )}
      </div>

      {/* Brand form */}
      {needsBrand && !showBrandForm && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowBrandForm(true)} data-testid="a2p-start-brand">
            {brandStatus === 'failed' ? t('channels.a2p.resubmitBrand') : t('channels.a2p.submitBrand')}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleSkip} disabled={submitting}>
            {t('channels.a2p.skip')}
          </Button>
        </div>
      )}

      {showBrandForm && (
        <div className="space-y-3 rounded-lg border p-4" data-testid="a2p-brand-form">
          <h5 className="font-medium text-sm">{t('channels.a2p.brandFormTitle')}</h5>

          <div className="space-y-2">
            <Label>{t('channels.a2p.entityType')}</Label>
            <Select value={brandInfo.entityType} onValueChange={(v) => updateBrand({ entityType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map(type => (
                  <SelectItem key={type} value={type}>
                    {t(`channels.a2p.entityTypes.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('channels.a2p.companyName')}</Label>
              <Input value={brandInfo.companyName} onChange={e => updateBrand({ companyName: e.target.value })} data-testid="a2p-company-name" />
            </div>
            <div className="space-y-2">
              <Label>{t('channels.a2p.ein')}</Label>
              <Input value={brandInfo.ein} onChange={e => updateBrand({ ein: e.target.value })} placeholder="XX-XXXXXXX" data-testid="a2p-ein" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('channels.a2p.phone')}</Label>
              <Input value={brandInfo.phone} onChange={e => updateBrand({ phone: e.target.value })} placeholder="+12125551234" />
            </div>
            <div className="space-y-2">
              <Label>{t('channels.a2p.email')}</Label>
              <Input type="email" value={brandInfo.email} onChange={e => updateBrand({ email: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('channels.a2p.street')}</Label>
            <Input value={brandInfo.street} onChange={e => updateBrand({ street: e.target.value })} />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label>{t('channels.a2p.city')}</Label>
              <Input value={brandInfo.city} onChange={e => updateBrand({ city: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('channels.a2p.state')}</Label>
              <Input value={brandInfo.state} onChange={e => updateBrand({ state: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('channels.a2p.postalCode')}</Label>
              <Input value={brandInfo.postalCode} onChange={e => updateBrand({ postalCode: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('channels.a2p.country')}</Label>
              <Input value={brandInfo.country} onChange={e => updateBrand({ country: e.target.value })} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSubmitBrand} disabled={submitting || !brandInfo.companyName || !brandInfo.ein} data-testid="a2p-submit-brand">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('channels.a2p.submitBrand')}
            </Button>
            <Button variant="ghost" onClick={() => setShowBrandForm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Campaign form */}
      {needsCampaign && !showCampaignForm && (
        <Button size="sm" onClick={() => setShowCampaignForm(true)} data-testid="a2p-start-campaign">
          {campaignStatus === 'failed' ? t('channels.a2p.resubmitCampaign') : t('channels.a2p.submitCampaign')}
        </Button>
      )}

      {showCampaignForm && (
        <div className="space-y-3 rounded-lg border p-4" data-testid="a2p-campaign-form">
          <h5 className="font-medium text-sm">{t('channels.a2p.campaignFormTitle')}</h5>

          <div className="space-y-2">
            <Label>{t('channels.a2p.useCase')}</Label>
            <Select value={campaignInfo.useCase} onValueChange={(v) => updateCampaign({ useCase: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {USE_CASES.map(uc => (
                  <SelectItem key={uc} value={uc}>{uc.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('channels.a2p.campaignDescription')}</Label>
            <Textarea value={campaignInfo.description} onChange={e => updateCampaign({ description: e.target.value })} rows={2} data-testid="a2p-campaign-desc" />
          </div>

          <div className="space-y-2">
            <Label>{t('channels.a2p.helpMessage')}</Label>
            <Input value={campaignInfo.helpMessage} onChange={e => updateCampaign({ helpMessage: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>{t('channels.a2p.optinMessage')}</Label>
            <Input value={campaignInfo.optinMessage} onChange={e => updateCampaign({ optinMessage: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>{t('channels.a2p.optoutMessage')}</Label>
            <Input value={campaignInfo.optoutMessage} onChange={e => updateCampaign({ optoutMessage: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>{t('channels.a2p.sampleMessages')}</Label>
            {campaignInfo.sampleMessages.map((msg, i) => (
              <Input
                key={i}
                value={msg}
                onChange={e => updateSampleMessage(i, e.target.value)}
                placeholder={t('channels.a2p.sampleMessagePlaceholder', { num: i + 1 })}
              />
            ))}
            {campaignInfo.sampleMessages.length < 5 && (
              <Button variant="ghost" size="sm" onClick={addSampleMessage}>
                {t('channels.a2p.addSampleMessage')}
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSubmitCampaign} disabled={submitting || !campaignInfo.description} data-testid="a2p-submit-campaign">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('channels.a2p.submitCampaign')}
            </Button>
            <Button variant="ghost" onClick={() => setShowCampaignForm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Completed state */}
      {isComplete && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
          <p className="text-xs text-green-700 dark:text-green-400">
            <CheckCircle2 className="inline mr-1 h-3 w-3" />
            {t('channels.a2p.approvedMessage')}
          </p>
          {registration?.brandSidMasked && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('channels.a2p.brandSid')}: ****{registration.brandSidMasked}
            </p>
          )}
          {registration?.campaignSidMasked && (
            <p className="text-xs text-muted-foreground">
              {t('channels.a2p.campaignSid')}: ****{registration.campaignSidMasked}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/client/components/channel-config/a2p-registration-panel.tsx
git commit -m "feat(channels): add A2pRegistrationPanel for brand/campaign management in settings"
```

---

## Task 7: SMS Channel Section (Desktop)

**Files:**
- New: `src/client/components/channel-config/sms-channel-section.tsx`

- [ ] **Step 1: Create the SMS channel section**

Create `src/client/components/channel-config/sms-channel-section.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { SettingsSection } from '@/components/settings-section'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Phone } from 'lucide-react'
import { updateMessagingConfig, getA2pStatus, type A2pRegistration } from '@/lib/api'
import { ChannelStatusBanner } from './channel-status-banner'
import { ConnectionTestButton } from './connection-test-button'
import { AutoResponseFields } from './auto-response-fields'
import { A2pRegistrationPanel } from './a2p-registration-panel'
import type { ChannelConfigProps } from './types'
import { useAuth } from '@/lib/auth'

export function SMSChannelSection({
  config,
  onConfigChange,
  expanded,
  onToggle,
  statusSummary,
}: ChannelConfigProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { activeHubId } = useAuth()
  const [saving, setSaving] = useState(false)
  const [a2pRegistration, setA2pRegistration] = useState<A2pRegistration | null>(null)

  const sms = config.sms || { enabled: false }
  const smsContentMode = config.smsContentMode || 'notification-only'

  useEffect(() => {
    if (activeHubId) {
      getA2pStatus(activeHubId).then(setA2pRegistration)
    }
  }, [activeHubId])

  function updateSms(updates: Record<string, unknown>) {
    onConfigChange({ ...config, sms: { ...sms, ...updates } })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const enabledChannels = sms.enabled
        ? (config.enabledChannels.includes('sms') ? config.enabledChannels : [...config.enabledChannels, 'sms'])
        : config.enabledChannels.filter(c => c !== 'sms')

      await updateMessagingConfig({
        ...config,
        enabledChannels,
        sms: { ...sms },
        smsContentMode,
      })
      toast(t('common.success'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      id="sms-channel"
      title={t('channels.sms.title')}
      description={t('channels.sms.description')}
      icon={<Phone className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      statusSummary={statusSummary}
    >
      <div className="space-y-4">
        <ChannelStatusBanner
          channelName="sms"
          enabled={sms.enabled}
          onEnabledChange={(enabled) => updateSms({ enabled })}
          security="none"
          a2pBrandStatus={a2pRegistration?.brandStatus}
          a2pCampaignStatus={a2pRegistration?.campaignStatus}
        />

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t('channels.sms.providerNote')}
          </p>
        </div>

        <div className="space-y-2">
          <Label>{t('channels.sms.contentMode')}</Label>
          <Select
            value={smsContentMode}
            onValueChange={(v) => onConfigChange({ ...config, smsContentMode: v as 'full' | 'notification-only' })}
          >
            <SelectTrigger data-testid="sms-content-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">{t('channels.sms.contentModeFull')}</SelectItem>
              <SelectItem value="notification-only">{t('channels.sms.contentModeNotification')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {smsContentMode === 'notification-only'
              ? t('channels.sms.contentModeNotificationHelp')
              : t('channels.sms.contentModeFullHelp')}
          </p>
        </div>

        <AutoResponseFields
          autoResponse={sms.autoResponse || ''}
          afterHoursResponse={sms.afterHoursResponse || ''}
          onAutoResponseChange={(v) => updateSms({ autoResponse: v })}
          onAfterHoursResponseChange={(v) => updateSms({ afterHoursResponse: v })}
          idPrefix="sms"
        />

        <div className="flex items-center gap-2">
          <Button data-testid="sms-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
          <ConnectionTestButton channel="sms" disabled={!sms.enabled} />
        </div>

        {activeHubId && (
          <A2pRegistrationPanel hubId={activeHubId} />
        )}
      </div>
    </SettingsSection>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/client/components/channel-config/sms-channel-section.tsx
git commit -m "feat(channels): add SMS channel section with A2P management and content mode"
```

---

## Task 8: WhatsApp Channel Section (Desktop)

**Files:**
- New: `src/client/components/channel-config/whatsapp-channel-section.tsx`

- [ ] **Step 1: Create the WhatsApp channel section**

Create `src/client/components/channel-config/whatsapp-channel-section.tsx`:

```typescript
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { SettingsSection } from '@/components/settings-section'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MessageSquare } from 'lucide-react'
import { updateMessagingConfig } from '@/lib/api'
import { ChannelStatusBanner } from './channel-status-banner'
import { ConnectionTestButton } from './connection-test-button'
import { AutoResponseFields } from './auto-response-fields'
import type { ChannelConfigProps } from './types'

export function WhatsAppChannelSection({
  config,
  onConfigChange,
  expanded,
  onToggle,
  statusSummary,
}: ChannelConfigProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const whatsapp = config.whatsapp || {
    integrationMode: 'twilio' as const,
    autoResponse: '',
    afterHoursResponse: '',
  }

  const isEnabled = config.enabledChannels.includes('whatsapp')

  function updateWhatsApp(updates: Record<string, unknown>) {
    onConfigChange({ ...config, whatsapp: { ...whatsapp, ...updates } })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const enabledChannels = isEnabled
        ? config.enabledChannels
        : [...config.enabledChannels, 'whatsapp']

      await updateMessagingConfig({
        ...config,
        enabledChannels,
        whatsapp: { ...whatsapp },
      })
      toast(t('common.success'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleEnabledChange(enabled: boolean) {
    if (enabled) {
      onConfigChange({
        ...config,
        enabledChannels: config.enabledChannels.includes('whatsapp')
          ? config.enabledChannels
          : [...config.enabledChannels, 'whatsapp'],
      })
    } else {
      onConfigChange({
        ...config,
        enabledChannels: config.enabledChannels.filter(c => c !== 'whatsapp'),
      })
    }
  }

  return (
    <SettingsSection
      id="whatsapp-channel"
      title={t('channels.whatsapp.title')}
      description={t('channels.whatsapp.description')}
      icon={<MessageSquare className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      statusSummary={statusSummary}
    >
      <div className="space-y-4">
        <ChannelStatusBanner
          channelName="whatsapp"
          enabled={isEnabled}
          onEnabledChange={handleEnabledChange}
          security="provider-encrypted"
        />

        <div className="space-y-2">
          <Label>{t('channels.whatsapp.integrationMode')}</Label>
          <Select
            value={whatsapp.integrationMode}
            onValueChange={(v) => updateWhatsApp({ integrationMode: v })}
          >
            <SelectTrigger data-testid="whatsapp-integration-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="twilio">{t('channels.whatsapp.modeTwilio')}</SelectItem>
              <SelectItem value="direct">{t('channels.whatsapp.modeDirect')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {whatsapp.integrationMode === 'twilio'
              ? t('channels.whatsapp.modeTwilioHelp')
              : t('channels.whatsapp.modeDirectHelp')}
          </p>
        </div>

        {whatsapp.integrationMode === 'direct' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="whatsapp-phone-number-id">{t('channels.whatsapp.phoneNumberId')}</Label>
              <Input
                id="whatsapp-phone-number-id"
                value={whatsapp.phoneNumberId || ''}
                onChange={(e) => updateWhatsApp({ phoneNumberId: e.target.value })}
                data-testid="whatsapp-phone-number-id"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp-business-account-id">{t('channels.whatsapp.businessAccountId')}</Label>
              <Input
                id="whatsapp-business-account-id"
                value={whatsapp.businessAccountId || ''}
                onChange={(e) => updateWhatsApp({ businessAccountId: e.target.value })}
                data-testid="whatsapp-business-account-id"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp-access-token">{t('channels.whatsapp.accessToken')}</Label>
              <Input
                id="whatsapp-access-token"
                type="password"
                value={whatsapp.accessToken || ''}
                onChange={(e) => updateWhatsApp({ accessToken: e.target.value })}
                data-testid="whatsapp-access-token"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp-verify-token">{t('channels.whatsapp.verifyToken')}</Label>
              <Input
                id="whatsapp-verify-token"
                value={whatsapp.verifyToken || ''}
                onChange={(e) => updateWhatsApp({ verifyToken: e.target.value })}
                data-testid="whatsapp-verify-token"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp-app-secret">{t('channels.whatsapp.appSecret')}</Label>
              <Input
                id="whatsapp-app-secret"
                type="password"
                value={whatsapp.appSecret || ''}
                onChange={(e) => updateWhatsApp({ appSecret: e.target.value })}
                data-testid="whatsapp-app-secret"
              />
            </div>
          </>
        )}

        {whatsapp.integrationMode === 'twilio' && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              {t('channels.whatsapp.twilioNote')}
            </p>
          </div>
        )}

        <AutoResponseFields
          autoResponse={whatsapp.autoResponse || ''}
          afterHoursResponse={whatsapp.afterHoursResponse || ''}
          onAutoResponseChange={(v) => updateWhatsApp({ autoResponse: v })}
          onAfterHoursResponseChange={(v) => updateWhatsApp({ afterHoursResponse: v })}
          idPrefix="whatsapp"
        />

        <div className="flex items-center gap-2">
          <Button data-testid="whatsapp-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
          <ConnectionTestButton channel="whatsapp" disabled={!isEnabled} />
        </div>
      </div>
    </SettingsSection>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/channel-config/whatsapp-channel-section.tsx
git commit -m "feat(channels): add WhatsApp channel section with integration mode toggle"
```

---

## Task 9: Telegram Channel Section (Desktop)

**Files:**
- New: `src/client/components/channel-config/telegram-channel-section.tsx`

- [ ] **Step 1: Create the Telegram channel section**

Create `src/client/components/channel-config/telegram-channel-section.tsx`:

```typescript
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { SettingsSection } from '@/components/settings-section'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Copy, Send } from 'lucide-react'
import { updateMessagingConfig } from '@/lib/api'
import { ChannelStatusBanner } from './channel-status-banner'
import { ConnectionTestButton } from './connection-test-button'
import { AutoResponseFields } from './auto-response-fields'
import type { ChannelConfigProps } from './types'

export function TelegramChannelSection({
  config,
  onConfigChange,
  expanded,
  onToggle,
  statusSummary,
}: ChannelConfigProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const telegram = config.telegram || {
    enabled: false,
    botToken: '',
    webhookSecret: '',
    botUsername: '',
    autoResponse: '',
    afterHoursResponse: '',
  }

  const webhookUrl = `${window.location.origin}/api/messaging/telegram/webhook`

  function updateTelegram(updates: Record<string, unknown>) {
    onConfigChange({ ...config, telegram: { ...telegram, ...updates } })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const enabledChannels = telegram.enabled
        ? (config.enabledChannels.includes('telegram') ? config.enabledChannels : [...config.enabledChannels, 'telegram'])
        : config.enabledChannels.filter(c => c !== 'telegram')

      await updateMessagingConfig({
        ...config,
        enabledChannels,
        telegram: { ...telegram },
      })
      toast(t('common.success'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      id="telegram-channel"
      title={t('channels.telegram.title')}
      description={t('channels.telegram.description')}
      icon={<Send className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      statusSummary={statusSummary}
    >
      <div className="space-y-4">
        <ChannelStatusBanner
          channelName="telegram"
          enabled={telegram.enabled}
          onEnabledChange={(enabled) => updateTelegram({ enabled })}
          security="provider-encrypted"
        />

        <div className="space-y-2">
          <Label htmlFor="telegram-bot-token">{t('channels.telegram.botToken')}</Label>
          <Input
            id="telegram-bot-token"
            type="password"
            value={telegram.botToken}
            onChange={(e) => updateTelegram({ botToken: e.target.value })}
            placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
            data-testid="telegram-bot-token"
          />
          <p className="text-xs text-muted-foreground">
            {t('channels.telegram.botTokenHelp')}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="telegram-bot-username">{t('channels.telegram.botUsername')}</Label>
          <Input
            id="telegram-bot-username"
            value={telegram.botUsername || ''}
            onChange={(e) => updateTelegram({ botUsername: e.target.value })}
            placeholder="@YourBotUsername"
            data-testid="telegram-bot-username"
          />
        </div>

        <div className="space-y-2">
          <Label>{t('channels.telegram.webhookUrl')}</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">{webhookUrl}</code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => { navigator.clipboard.writeText(webhookUrl); toast(t('common.success'), 'success') }}
              aria-label={t('a11y.copyToClipboard')}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="telegram-webhook-secret">{t('channels.telegram.webhookSecret')}</Label>
          <Input
            id="telegram-webhook-secret"
            type="password"
            value={telegram.webhookSecret || ''}
            onChange={(e) => updateTelegram({ webhookSecret: e.target.value })}
            data-testid="telegram-webhook-secret"
          />
        </div>

        <AutoResponseFields
          autoResponse={telegram.autoResponse || ''}
          afterHoursResponse={telegram.afterHoursResponse || ''}
          onAutoResponseChange={(v) => updateTelegram({ autoResponse: v })}
          onAfterHoursResponseChange={(v) => updateTelegram({ afterHoursResponse: v })}
          idPrefix="telegram"
        />

        <div className="flex items-center gap-2">
          <Button data-testid="telegram-save-btn" onClick={handleSave} disabled={saving || !telegram.botToken}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
          <ConnectionTestButton channel="telegram" disabled={!telegram.enabled || !telegram.botToken} />
        </div>
      </div>
    </SettingsSection>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/components/channel-config/telegram-channel-section.tsx
git commit -m "feat(channels): add Telegram channel section with bot token and webhook config"
```

---

## Task 10: Refactor Signal Section to Use Shared Primitives

**Files:**
- Modify: `src/client/components/admin-settings/signal-channel-section.tsx`

- [ ] **Step 1: Update SignalChannelSection to accept ChannelConfigProps**

Refactor `src/client/components/admin-settings/signal-channel-section.tsx`. Replace the interface and update the component to use shared primitives for the connection test and auto-response. Keep the Signal-specific sections (registration, identity, queue) intact.

Replace the `SignalChannelSectionProps` interface and update imports:

```typescript
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { SettingsSection } from '@/components/settings-section'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Shield, Copy, Loader2, CheckCircle2, XCircle,
  Phone, KeyRound, AlertTriangle, RefreshCw, Activity,
} from 'lucide-react'
import {
  updateMessagingConfig,
  getSignalAccountInfo,
  getSignalIdentities,
  updateSignalIdentityTrust,
  getSignalQueueStats,
  type MessagingConfig,
  type SignalIdentityRecord,
  type SignalQueueStats,
} from '@/lib/api'
import { SignalRegistrationFlow } from '@/components/setup/SignalRegistrationFlow'
import { ProviderStatusBadge } from '@/components/setup/ProviderStatusBadge'
import { ConnectionTestButton } from '@/components/channel-config/connection-test-button'
import { AutoResponseFields } from '@/components/channel-config/auto-response-fields'
import type { ChannelConfigProps } from '@/components/channel-config/types'
```

Replace the props interface:

```typescript
// Remove the old SignalChannelSectionProps interface entirely
```

Update the component signature (keep the same export name for registry compatibility):

```typescript
export function SignalChannelSection({
  config,
  onConfigChange,
  expanded,
  onToggle,
  statusSummary,
}: ChannelConfigProps) {
```

Replace the inline auto-response field with the shared primitive. Find the auto-response `<Input>` element and replace with:

```typescript
        <AutoResponseFields
          autoResponse={signal.autoResponse || ''}
          afterHoursResponse={signal.afterHoursResponse || ''}
          onAutoResponseChange={(v) => updateSignal({ autoResponse: v })}
          onAfterHoursResponseChange={(v) => updateSignal({ afterHoursResponse: v })}
          idPrefix="signal"
        />
```

Replace the inline test button with the shared primitive. Find the test button JSX in the button row and replace with:

```typescript
          <ConnectionTestButton channel="signal" disabled={!signal.bridgeUrl} />
```

Remove the `testMessagingChannel` import and the local `handleTest` function and `testing`/`testResult` state, since `ConnectionTestButton` handles its own state.

- [ ] **Step 2: Verify the refactored component compiles**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/client/components/admin-settings/signal-channel-section.tsx
git commit -m "refactor(signal): use shared ConnectionTestButton and AutoResponseFields primitives"
```

---

## Task 11: Refactor RCS Section to Use Shared Primitives

**Files:**
- Modify: `src/client/components/admin-settings/rcs-channel-section.tsx`

- [ ] **Step 1: Update RCSChannelSection to accept ChannelConfigProps**

Refactor `src/client/components/admin-settings/rcs-channel-section.tsx`. Update imports to add shared primitives:

```typescript
import { ConnectionTestButton } from '@/components/channel-config/connection-test-button'
import { AutoResponseFields } from '@/components/channel-config/auto-response-fields'
import type { ChannelConfigProps } from '@/components/channel-config/types'
```

Replace the `RCSChannelSectionProps` interface — remove it entirely.

Update the component signature:

```typescript
export function RCSChannelSection({
  config,
  onConfigChange,
  expanded,
  onToggle,
  statusSummary,
}: ChannelConfigProps) {
```

Replace the inline auto-response `<Input>` with:

```typescript
        <AutoResponseFields
          autoResponse={rcs.autoResponse || ''}
          afterHoursResponse={rcs.afterHoursResponse || ''}
          onAutoResponseChange={(v) => updateRcs({ autoResponse: v })}
          onAfterHoursResponseChange={(v) => updateRcs({ afterHoursResponse: v })}
          idPrefix="rcs"
        />
```

Replace the inline test button with:

```typescript
          <ConnectionTestButton channel="rcs" disabled={!rcs.agentId} />
```

Remove the `testMessagingChannel` import, the local `handleTest` function, and `testing`/`testResult` state.

- [ ] **Step 2: Verify the refactored component compiles**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/client/components/admin-settings/rcs-channel-section.tsx
git commit -m "refactor(rcs): use shared ConnectionTestButton and AutoResponseFields primitives"
```

---

## Task 12: Admin Settings Page — Registry-Based Rendering

**Files:**
- Modify: `src/client/routes/admin/settings.tsx`

- [ ] **Step 1: Replace hardcoded channel sections with registry iteration**

In `src/client/routes/admin/settings.tsx`:

Replace the channel section imports:

```typescript
// Remove these:
import { RCSChannelSection } from '@/components/admin-settings/rcs-channel-section'
import { SignalChannelSection } from '@/components/admin-settings/signal-channel-section'

// Add these:
import { Suspense } from 'react'
import { channelConfigRegistry, CHANNEL_ORDER } from '@/components/channel-config/registry'
import { Loader2 } from 'lucide-react'
```

Replace the hardcoded channel JSX blocks (the two `{messagingConfig && ...}` blocks near the bottom of the render) with a single dynamic block:

```typescript
      {messagingConfig && CHANNEL_ORDER.map((channelType) => {
        const entry = channelConfigRegistry[channelType]
        const ChannelComponent = entry.component
        const channelConfig = messagingConfig[channelType as keyof typeof messagingConfig]
        const isConfigured = channelConfig !== null && channelConfig !== undefined
        const channelStatusSummary = isConfigured
          ? t('common.configured', { defaultValue: 'Configured' })
          : t('settings.notConfigured', { defaultValue: 'Not configured' })

        return (
          <Suspense key={channelType} fallback={
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          }>
            <ChannelComponent
              config={messagingConfig}
              onConfigChange={setMessagingConfig}
              expanded={expanded.has(`${channelType}-channel`)}
              onToggle={(open) => toggleSection(`${channelType}-channel`, open)}
              statusSummary={channelStatusSummary}
            />
          </Suspense>
        )
      })}
```

- [ ] **Step 2: Verify the page compiles and renders**

Run: `bun run typecheck`
Expected: PASS

Run: `bun run test:build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/client/routes/admin/settings.tsx
git commit -m "refactor(settings): replace hardcoded channel sections with registry-based dynamic rendering"
```

---

## Task 13: i18n Keys for Channel Config

**Files:**
- Modify: `packages/i18n/locales/en.json`

- [ ] **Step 1: Add channel config i18n keys**

Add the following keys to `packages/i18n/locales/en.json` inside the top-level object. Place them in a `"channels"` section:

```json
  "channels": {
    "shared": {
      "testing": "Testing...",
      "testConnection": "Test Connection",
      "testSuccess": "Connected",
      "testFailed": "Connection Failed",
      "enableChannel": "Enable {{channel}}",
      "autoResponse": "Auto-Response",
      "autoResponsePlaceholder": "Automatic reply sent to first-time contacts...",
      "autoResponseHelp": "Sent once when a new contact messages for the first time.",
      "afterHoursResponse": "After-Hours Response",
      "afterHoursPlaceholder": "Reply sent outside shift hours...",
      "afterHoursHelp": "Sent when no volunteers are on shift. Leave empty to disable.",
      "security": {
        "none": "No encryption",
        "provider-encrypted": "Provider encrypted",
        "e2ee-to-bridge": "E2EE to bridge",
        "e2ee": "End-to-end encrypted"
      }
    },
    "sms": {
      "title": "SMS Channel",
      "description": "Text messaging via your telephony provider.",
      "providerNote": "SMS uses your telephony provider's credentials and phone number. No separate SMS setup is required.",
      "contentMode": "Content Mode",
      "contentModeFull": "Full content",
      "contentModeNotification": "Notification only",
      "contentModeFullHelp": "SMS messages include full message text. Note: SMS has no transport encryption.",
      "contentModeNotificationHelp": "SMS messages contain only a notification to check the app. Message content stays encrypted."
    },
    "whatsapp": {
      "title": "WhatsApp Channel",
      "description": "WhatsApp Business messaging via Twilio or direct Meta API.",
      "integrationMode": "Integration Mode",
      "modeTwilio": "Via Twilio",
      "modeDirect": "Direct Meta API",
      "modeTwilioHelp": "Uses your existing Twilio telephony provider credentials. No additional setup needed.",
      "modeDirectHelp": "Connect directly to the Meta WhatsApp Business API. Requires a Meta developer account.",
      "phoneNumberId": "Phone Number ID",
      "businessAccountId": "Business Account ID",
      "accessToken": "Access Token",
      "verifyToken": "Verify Token",
      "appSecret": "App Secret",
      "twilioNote": "WhatsApp is configured through your Twilio account. Ensure WhatsApp is enabled for your Twilio number."
    },
    "telegram": {
      "title": "Telegram Channel",
      "description": "Telegram Bot messaging for inbound conversations.",
      "botToken": "Bot Token",
      "botTokenHelp": "Create a bot via @BotFather on Telegram and paste the token here.",
      "botUsername": "Bot Username",
      "webhookUrl": "Webhook URL",
      "webhookSecret": "Webhook Secret"
    },
    "a2p": {
      "title": "A2P 10DLC Registration",
      "description": "US carriers require A2P 10DLC registration for business SMS. Register your brand and campaign to ensure deliverability.",
      "brandStatus": "Brand: {{status}}",
      "campaignStatus": "Campaign: {{status}}",
      "status": {
        "not_submitted": "Not submitted",
        "pending": "Pending review",
        "approved": "Approved",
        "failed": "Failed",
        "skipped": "Skipped"
      },
      "approved": "A2P Approved",
      "statusSkipped": "A2P Skipped",
      "statusFailed": "Registration Failed",
      "statusPending": "Pending Review",
      "statusNotSubmitted": "Not Registered",
      "submitBrand": "Register Brand",
      "resubmitBrand": "Re-submit Brand",
      "submitCampaign": "Register Campaign",
      "resubmitCampaign": "Re-submit Campaign",
      "skip": "Skip A2P",
      "brandSubmitted": "Brand registration submitted",
      "brandError": "Failed to submit brand registration",
      "campaignSubmitted": "Campaign registration submitted",
      "campaignError": "Failed to submit campaign registration",
      "skipped": "A2P registration skipped",
      "approvedMessage": "A2P registration is approved. SMS messages will be sent using your registered brand and campaign.",
      "brandSid": "Brand SID",
      "campaignSid": "Campaign SID",
      "brandFormTitle": "Brand Registration",
      "campaignFormTitle": "Campaign Registration",
      "entityType": "Entity Type",
      "entityTypes": {
        "PRIVATE_PROFIT": "Private for-profit",
        "PUBLIC_PROFIT": "Public for-profit",
        "NON_PROFIT": "Non-profit",
        "GOVERNMENT": "Government"
      },
      "companyName": "Company Name",
      "ein": "EIN / Tax ID",
      "phone": "Phone",
      "email": "Email",
      "street": "Street Address",
      "city": "City",
      "state": "State",
      "postalCode": "Postal Code",
      "country": "Country",
      "useCase": "Use Case",
      "campaignDescription": "Campaign Description",
      "helpMessage": "Help Message",
      "optinMessage": "Opt-in Message",
      "optoutMessage": "Opt-out Message",
      "sampleMessages": "Sample Messages",
      "sampleMessagePlaceholder": "Sample message {{num}}",
      "addSampleMessage": "Add sample message"
    }
  }
```

- [ ] **Step 2: Add placeholder keys to all 12 other locale files**

For each of `{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json`, add the same `"channels"` block with English values as placeholders (to be translated later). This ensures the app does not crash on missing keys in non-English locales.

Run the i18n codegen to verify:

```bash
bun run i18n:codegen
```

Expected: Clean exit, generates iOS `.strings` + Android `strings.xml` + Kotlin `I18n.kt`.

- [ ] **Step 3: Validate i18n keys**

Run: `bun run i18n:validate:desktop`
Expected: PASS (all `t('channels.*')` keys found in en.json)

- [ ] **Step 4: Commit**

```bash
git add packages/i18n/locales/
git commit -m "i18n(channels): add ~25 channel config keys across all 13 locales"
```

---

## Task 14: iOS — MessagingConfigService

**Files:**
- New: `apps/ios/Sources/Services/MessagingConfigService.swift`

- [ ] **Step 1: Create the iOS messaging config API service**

Create `apps/ios/Sources/Services/MessagingConfigService.swift`:

```swift
import Foundation

// MARK: - Messaging Channel Types

enum MessagingChannelType: String, Codable, CaseIterable, Identifiable {
    case sms, whatsapp, signal, telegram, rcs
    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .sms: return NSLocalizedString("channels_sms_title", comment: "SMS Channel")
        case .whatsapp: return NSLocalizedString("channels_whatsapp_title", comment: "WhatsApp Channel")
        case .signal: return NSLocalizedString("channels_signal_title", comment: "Signal Channel")
        case .telegram: return NSLocalizedString("channels_telegram_title", comment: "Telegram Channel")
        case .rcs: return NSLocalizedString("channels_rcs_title", comment: "RCS Channel")
        }
    }

    var iconName: String {
        switch self {
        case .sms: return "phone.fill"
        case .whatsapp: return "message.fill"
        case .signal: return "shield.fill"
        case .telegram: return "paperplane.fill"
        case .rcs: return "bubble.left.and.bubble.right.fill"
        }
    }
}

// MARK: - Config Models

struct SMSConfigResponse: Codable {
    var enabled: Bool
    var autoResponse: String?
    var afterHoursResponse: String?
}

struct WhatsAppConfigResponse: Codable {
    var integrationMode: String
    var phoneNumberId: String?
    var businessAccountId: String?
    var accessToken: String?
    var verifyToken: String?
    var appSecret: String?
    var autoResponse: String?
    var afterHoursResponse: String?
}

struct SignalConfigResponse: Codable {
    var bridgeUrl: String
    var bridgeApiKey: String
    var webhookSecret: String
    var registeredNumber: String
    var trustMode: String?
    var autoResponse: String?
    var afterHoursResponse: String?
}

struct TelegramConfigResponse: Codable {
    var enabled: Bool
    var botToken: String
    var webhookSecret: String?
    var botUsername: String?
    var autoResponse: String?
    var afterHoursResponse: String?
}

struct RCSConfigResponse: Codable {
    var agentId: String
    var serviceAccountKey: String
    var webhookSecret: String?
    var fallbackToSms: Bool
    var autoResponse: String?
    var afterHoursResponse: String?
}

struct MessagingConfigResponse: Codable {
    var enabledChannels: [String]
    var sms: SMSConfigResponse?
    var whatsapp: WhatsAppConfigResponse?
    var signal: SignalConfigResponse?
    var rcs: RCSConfigResponse?
    var telegram: TelegramConfigResponse?
    var autoAssign: Bool
    var inactivityTimeout: Int
    var maxConcurrentPerUser: Int
    var preferSignalDelivery: Bool?
    var smsContentMode: String?
}

struct ConnectionTestResponse: Codable {
    let connected: Bool
}

struct A2pRegistrationResponse: Codable {
    let id: String
    let hubId: String
    let providerType: String
    let brandStatus: String
    let campaignStatus: String
    let brandSidMasked: String?
    let campaignSidMasked: String?
    let error: String?
    let submittedAt: String?
    let approvedAt: String?
}

// MARK: - MessagingConfigService

@Observable
final class MessagingConfigService {
    private let api: APIService

    var config: MessagingConfigResponse?
    var a2pRegistration: A2pRegistrationResponse?
    var isLoading = false
    var error: String?

    init(api: APIService) {
        self.api = api
    }

    func loadConfig() async {
        isLoading = true
        error = nil
        do {
            config = try await api.get("/settings/messaging")
            isLoading = false
        } catch {
            self.error = error.localizedDescription
            isLoading = false
        }
    }

    func updateConfig(_ updates: [String: Any]) async throws {
        config = try await api.patch("/settings/messaging", body: updates)
    }

    func testChannel(_ channel: String) async throws -> Bool {
        let response: ConnectionTestResponse = try await api.post(
            "/settings/messaging/test",
            body: ["channel": channel]
        )
        return response.connected
    }

    func loadA2pStatus(hubId: String) async {
        do {
            a2pRegistration = try await api.get("/provider-setup/a2p/status?hubId=\(hubId)")
        } catch {
            // A2P may not be configured
            a2pRegistration = nil
        }
    }

    func submitBrand(hubId: String, brandInfo: [String: Any]) async throws -> A2pRegistrationResponse {
        return try await api.post("/provider-setup/a2p/brand", body: [
            "hubId": hubId,
            "brandInfo": brandInfo,
        ])
    }

    func submitCampaign(registrationId: String, hubId: String, campaignInfo: [String: Any]) async throws -> A2pRegistrationResponse {
        return try await api.post("/provider-setup/a2p/campaign", body: [
            "registrationId": registrationId,
            "hubId": hubId,
            "campaignInfo": campaignInfo,
        ])
    }

    func skipA2p(hubId: String) async throws -> A2pRegistrationResponse {
        return try await api.post("/provider-setup/a2p/skip", body: ["hubId": hubId])
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ios/Sources/Services/MessagingConfigService.swift
git commit -m "feat(ios): add MessagingConfigService for channel config and A2P management"
```

---

## Task 15: iOS — Channel Config List View

**Files:**
- New: `apps/ios/Sources/Views/Settings/Channels/ChannelConfigListView.swift`
- New: `apps/ios/Sources/Views/Settings/Channels/ConnectionTestButton.swift`
- New: `apps/ios/Sources/Views/Settings/Channels/AutoResponseFields.swift`

- [ ] **Step 1: Create shared iOS primitives**

Create `apps/ios/Sources/Views/Settings/Channels/ConnectionTestButton.swift`:

```swift
import SwiftUI

struct ConnectionTestButton: View {
    let channel: String
    let disabled: Bool
    let onTest: (String) async throws -> Bool

    @State private var testing = false
    @State private var result: Bool?

    var body: some View {
        HStack(spacing: 8) {
            Button {
                Task { await runTest() }
            } label: {
                if testing {
                    ProgressView()
                        .controlSize(.small)
                    Text(NSLocalizedString("channels_shared_testing", comment: "Testing..."))
                } else {
                    Text(NSLocalizedString("channels_shared_testConnection", comment: "Test Connection"))
                }
            }
            .disabled(disabled || testing)

            if let result {
                Image(systemName: result ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundStyle(result ? .green : .red)
                Text(result
                    ? NSLocalizedString("channels_shared_testSuccess", comment: "Connected")
                    : NSLocalizedString("channels_shared_testFailed", comment: "Failed"))
                .font(.caption)
                .foregroundStyle(result ? .green : .red)
            }
        }
    }

    private func runTest() async {
        testing = true
        result = nil
        do {
            result = try await onTest(channel)
        } catch {
            result = false
        }
        testing = false
    }
}
```

Create `apps/ios/Sources/Views/Settings/Channels/AutoResponseFields.swift`:

```swift
import SwiftUI

struct AutoResponseFields: View {
    @Binding var autoResponse: String
    @Binding var afterHoursResponse: String

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text(NSLocalizedString("channels_shared_autoResponse", comment: "Auto-Response"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField(
                    NSLocalizedString("channels_shared_autoResponsePlaceholder", comment: "Auto-reply..."),
                    text: $autoResponse,
                    axis: .vertical
                )
                .lineLimit(2...4)
                .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(NSLocalizedString("channels_shared_afterHoursResponse", comment: "After-Hours Response"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField(
                    NSLocalizedString("channels_shared_afterHoursPlaceholder", comment: "After-hours reply..."),
                    text: $afterHoursResponse,
                    axis: .vertical
                )
                .lineLimit(2...4)
                .textFieldStyle(.roundedBorder)
            }
        }
    }
}
```

- [ ] **Step 2: Create the ChannelConfigListView**

Create `apps/ios/Sources/Views/Settings/Channels/ChannelConfigListView.swift`:

```swift
import SwiftUI

struct ChannelConfigListView: View {
    @Environment(AppState.self) private var appState
    @State private var messagingService: MessagingConfigService?

    var body: some View {
        List {
            if let service = messagingService {
                if service.isLoading {
                    ProgressView()
                } else if let error = service.error {
                    Text(error)
                        .foregroundStyle(.red)
                } else {
                    ForEach(MessagingChannelType.allCases) { channel in
                        NavigationLink(value: channel) {
                            HStack {
                                Image(systemName: channel.iconName)
                                    .frame(width: 24)
                                    .foregroundStyle(.secondary)
                                VStack(alignment: .leading) {
                                    Text(channel.displayName)
                                    Text(channelStatus(channel))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(NSLocalizedString("channels_title", comment: "Messaging Channels"))
        .navigationDestination(for: MessagingChannelType.self) { channel in
            channelConfigView(for: channel)
        }
        .task {
            guard let api = appState.apiService else { return }
            let service = MessagingConfigService(api: api)
            messagingService = service
            await service.loadConfig()
        }
    }

    @ViewBuilder
    private func channelConfigView(for channel: MessagingChannelType) -> some View {
        if let service = messagingService {
            switch channel {
            case .sms:
                SMSChannelConfigView(service: service)
            case .whatsapp:
                WhatsAppChannelConfigView(service: service)
            case .signal:
                SignalChannelConfigView(service: service)
            case .telegram:
                TelegramChannelConfigView(service: service)
            case .rcs:
                RCSChannelConfigView(service: service)
            }
        }
    }

    private func channelStatus(_ channel: MessagingChannelType) -> String {
        guard let config = messagingService?.config else {
            return NSLocalizedString("settings_notConfigured", comment: "Not configured")
        }
        let isEnabled = config.enabledChannels.contains(channel.rawValue)
        return isEnabled
            ? NSLocalizedString("common_enabled", comment: "Enabled")
            : NSLocalizedString("common_disabled", comment: "Disabled")
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Sources/Views/Settings/Channels/
git commit -m "feat(ios): add channel config list view and shared primitives (ConnectionTestButton, AutoResponseFields)"
```

---

## Task 16: iOS — Per-Channel Config Views

**Files:**
- New: `apps/ios/Sources/Views/Settings/Channels/SMSChannelConfigView.swift`
- New: `apps/ios/Sources/Views/Settings/Channels/WhatsAppChannelConfigView.swift`
- New: `apps/ios/Sources/Views/Settings/Channels/TelegramChannelConfigView.swift`
- New: `apps/ios/Sources/Views/Settings/Channels/SignalChannelConfigView.swift`
- New: `apps/ios/Sources/Views/Settings/Channels/RCSChannelConfigView.swift`
- New: `apps/ios/Sources/Views/Settings/Channels/A2pRegistrationView.swift`

- [ ] **Step 1: Create SMSChannelConfigView**

Create `apps/ios/Sources/Views/Settings/Channels/SMSChannelConfigView.swift`:

```swift
import SwiftUI

struct SMSChannelConfigView: View {
    let service: MessagingConfigService

    @State private var enabled = false
    @State private var contentMode = "notification-only"
    @State private var autoResponse = ""
    @State private var afterHoursResponse = ""
    @State private var saving = false

    var body: some View {
        Form {
            Section {
                Toggle(NSLocalizedString("channels_shared_enableChannel", comment: "Enable SMS"), isOn: $enabled)
                    .accessibilityIdentifier("sms-enabled-toggle")
            }

            Section(header: Text(NSLocalizedString("channels_sms_contentMode", comment: "Content Mode"))) {
                Picker(NSLocalizedString("channels_sms_contentMode", comment: "Content Mode"), selection: $contentMode) {
                    Text(NSLocalizedString("channels_sms_contentModeFull", comment: "Full content")).tag("full")
                    Text(NSLocalizedString("channels_sms_contentModeNotification", comment: "Notification only")).tag("notification-only")
                }
                .pickerStyle(.segmented)

                Text(contentMode == "notification-only"
                    ? NSLocalizedString("channels_sms_contentModeNotificationHelp", comment: "")
                    : NSLocalizedString("channels_sms_contentModeFullHelp", comment: ""))
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            AutoResponseFields(autoResponse: $autoResponse, afterHoursResponse: $afterHoursResponse)

            Section {
                ConnectionTestButton(channel: "sms", disabled: !enabled) { channel in
                    try await service.testChannel(channel)
                }

                Button {
                    Task { await save() }
                } label: {
                    if saving {
                        ProgressView()
                    } else {
                        Text(NSLocalizedString("common_save", comment: "Save"))
                    }
                }
                .disabled(saving)
            }

            A2pRegistrationView(service: service)
        }
        .navigationTitle(NSLocalizedString("channels_sms_title", comment: "SMS Channel"))
        .onAppear { loadFromConfig() }
    }

    private func loadFromConfig() {
        guard let sms = service.config?.sms else { return }
        enabled = sms.enabled
        autoResponse = sms.autoResponse ?? ""
        afterHoursResponse = sms.afterHoursResponse ?? ""
        contentMode = service.config?.smsContentMode ?? "notification-only"
    }

    private func save() async {
        saving = true
        do {
            try await service.updateConfig([
                "sms": ["enabled": enabled, "autoResponse": autoResponse, "afterHoursResponse": afterHoursResponse],
                "smsContentMode": contentMode,
            ])
        } catch {
            // Error handled by service
        }
        saving = false
    }
}
```

- [ ] **Step 2: Create WhatsAppChannelConfigView**

Create `apps/ios/Sources/Views/Settings/Channels/WhatsAppChannelConfigView.swift`:

```swift
import SwiftUI

struct WhatsAppChannelConfigView: View {
    let service: MessagingConfigService

    @State private var integrationMode = "twilio"
    @State private var phoneNumberId = ""
    @State private var businessAccountId = ""
    @State private var accessToken = ""
    @State private var verifyToken = ""
    @State private var appSecret = ""
    @State private var autoResponse = ""
    @State private var afterHoursResponse = ""
    @State private var saving = false

    var body: some View {
        Form {
            Section(header: Text(NSLocalizedString("channels_whatsapp_integrationMode", comment: "Integration Mode"))) {
                Picker(NSLocalizedString("channels_whatsapp_integrationMode", comment: "Mode"), selection: $integrationMode) {
                    Text(NSLocalizedString("channels_whatsapp_modeTwilio", comment: "Via Twilio")).tag("twilio")
                    Text(NSLocalizedString("channels_whatsapp_modeDirect", comment: "Direct Meta API")).tag("direct")
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("whatsapp-integration-mode")
            }

            if integrationMode == "direct" {
                Section(header: Text(NSLocalizedString("channels_whatsapp_directCredentials", comment: "Meta API Credentials"))) {
                    TextField(NSLocalizedString("channels_whatsapp_phoneNumberId", comment: "Phone Number ID"), text: $phoneNumberId)
                        .accessibilityIdentifier("whatsapp-phone-number-id")
                    TextField(NSLocalizedString("channels_whatsapp_businessAccountId", comment: "Business Account ID"), text: $businessAccountId)
                    SecureField(NSLocalizedString("channels_whatsapp_accessToken", comment: "Access Token"), text: $accessToken)
                    TextField(NSLocalizedString("channels_whatsapp_verifyToken", comment: "Verify Token"), text: $verifyToken)
                    SecureField(NSLocalizedString("channels_whatsapp_appSecret", comment: "App Secret"), text: $appSecret)
                }
            } else {
                Section {
                    Text(NSLocalizedString("channels_whatsapp_twilioNote", comment: ""))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            AutoResponseFields(autoResponse: $autoResponse, afterHoursResponse: $afterHoursResponse)

            Section {
                ConnectionTestButton(channel: "whatsapp", disabled: false) { channel in
                    try await service.testChannel(channel)
                }

                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView() } else { Text(NSLocalizedString("common_save", comment: "Save")) }
                }
                .disabled(saving)
            }
        }
        .navigationTitle(NSLocalizedString("channels_whatsapp_title", comment: "WhatsApp Channel"))
        .onAppear { loadFromConfig() }
    }

    private func loadFromConfig() {
        guard let wa = service.config?.whatsapp else { return }
        integrationMode = wa.integrationMode
        phoneNumberId = wa.phoneNumberId ?? ""
        businessAccountId = wa.businessAccountId ?? ""
        accessToken = wa.accessToken ?? ""
        verifyToken = wa.verifyToken ?? ""
        appSecret = wa.appSecret ?? ""
        autoResponse = wa.autoResponse ?? ""
        afterHoursResponse = wa.afterHoursResponse ?? ""
    }

    private func save() async {
        saving = true
        var updates: [String: Any] = [
            "integrationMode": integrationMode,
            "autoResponse": autoResponse,
            "afterHoursResponse": afterHoursResponse,
        ]
        if integrationMode == "direct" {
            updates["phoneNumberId"] = phoneNumberId
            updates["businessAccountId"] = businessAccountId
            updates["accessToken"] = accessToken
            updates["verifyToken"] = verifyToken
            updates["appSecret"] = appSecret
        }
        do {
            try await service.updateConfig(["whatsapp": updates])
        } catch {
            // Error handled by service
        }
        saving = false
    }
}
```

- [ ] **Step 3: Create TelegramChannelConfigView**

Create `apps/ios/Sources/Views/Settings/Channels/TelegramChannelConfigView.swift`:

```swift
import SwiftUI

struct TelegramChannelConfigView: View {
    let service: MessagingConfigService

    @State private var enabled = false
    @State private var botToken = ""
    @State private var botUsername = ""
    @State private var webhookSecret = ""
    @State private var autoResponse = ""
    @State private var afterHoursResponse = ""
    @State private var saving = false

    var body: some View {
        Form {
            Section {
                Toggle(NSLocalizedString("channels_shared_enableChannel", comment: "Enable Telegram"), isOn: $enabled)
                    .accessibilityIdentifier("telegram-enabled-toggle")
            }

            Section(header: Text(NSLocalizedString("channels_telegram_botSetup", comment: "Bot Setup"))) {
                SecureField(NSLocalizedString("channels_telegram_botToken", comment: "Bot Token"), text: $botToken)
                    .accessibilityIdentifier("telegram-bot-token")
                Text(NSLocalizedString("channels_telegram_botTokenHelp", comment: ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                TextField(NSLocalizedString("channels_telegram_botUsername", comment: "Bot Username"), text: $botUsername)
                    .accessibilityIdentifier("telegram-bot-username")

                SecureField(NSLocalizedString("channels_telegram_webhookSecret", comment: "Webhook Secret"), text: $webhookSecret)
            }

            AutoResponseFields(autoResponse: $autoResponse, afterHoursResponse: $afterHoursResponse)

            Section {
                ConnectionTestButton(channel: "telegram", disabled: !enabled || botToken.isEmpty) { channel in
                    try await service.testChannel(channel)
                }

                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView() } else { Text(NSLocalizedString("common_save", comment: "Save")) }
                }
                .disabled(saving || botToken.isEmpty)
            }
        }
        .navigationTitle(NSLocalizedString("channels_telegram_title", comment: "Telegram Channel"))
        .onAppear { loadFromConfig() }
    }

    private func loadFromConfig() {
        guard let tg = service.config?.telegram else { return }
        enabled = tg.enabled
        botToken = tg.botToken
        botUsername = tg.botUsername ?? ""
        webhookSecret = tg.webhookSecret ?? ""
        autoResponse = tg.autoResponse ?? ""
        afterHoursResponse = tg.afterHoursResponse ?? ""
    }

    private func save() async {
        saving = true
        do {
            try await service.updateConfig(["telegram": [
                "enabled": enabled,
                "botToken": botToken,
                "botUsername": botUsername,
                "webhookSecret": webhookSecret,
                "autoResponse": autoResponse,
                "afterHoursResponse": afterHoursResponse,
            ]])
        } catch {
            // Error handled by service
        }
        saving = false
    }
}
```

- [ ] **Step 4: Create SignalChannelConfigView**

Create `apps/ios/Sources/Views/Settings/Channels/SignalChannelConfigView.swift`:

```swift
import SwiftUI

struct SignalChannelConfigView: View {
    let service: MessagingConfigService

    @State private var bridgeUrl = ""
    @State private var bridgeApiKey = ""
    @State private var webhookSecret = ""
    @State private var registeredNumber = ""
    @State private var autoResponse = ""
    @State private var afterHoursResponse = ""
    @State private var saving = false

    var body: some View {
        Form {
            Section {
                Text(NSLocalizedString("channels_signal_e2eeNote", comment: "E2EE note"))
                    .font(.caption)
                    .foregroundStyle(.blue)
            }

            Section(header: Text(NSLocalizedString("channels_signal_bridgeSetup", comment: "Bridge Setup"))) {
                TextField(NSLocalizedString("channels_signal_bridgeUrl", comment: "Bridge URL"), text: $bridgeUrl)
                    .autocapitalization(.none)
                    .accessibilityIdentifier("signal-bridge-url")
                SecureField(NSLocalizedString("channels_signal_bridgeApiKey", comment: "Bridge API Key"), text: $bridgeApiKey)
                SecureField(NSLocalizedString("channels_signal_webhookSecret", comment: "Webhook Secret"), text: $webhookSecret)
                TextField(NSLocalizedString("channels_signal_registeredNumber", comment: "Registered Number"), text: $registeredNumber)
                    .accessibilityIdentifier("signal-registered-number")
            }

            AutoResponseFields(autoResponse: $autoResponse, afterHoursResponse: $afterHoursResponse)

            Section {
                ConnectionTestButton(channel: "signal", disabled: bridgeUrl.isEmpty) { channel in
                    try await service.testChannel(channel)
                }

                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView() } else { Text(NSLocalizedString("common_save", comment: "Save")) }
                }
                .disabled(saving || bridgeUrl.isEmpty)
            }
        }
        .navigationTitle(NSLocalizedString("channels_signal_title", comment: "Signal Channel"))
        .onAppear { loadFromConfig() }
    }

    private func loadFromConfig() {
        guard let sig = service.config?.signal else { return }
        bridgeUrl = sig.bridgeUrl
        bridgeApiKey = sig.bridgeApiKey
        webhookSecret = sig.webhookSecret
        registeredNumber = sig.registeredNumber
        autoResponse = sig.autoResponse ?? ""
        afterHoursResponse = sig.afterHoursResponse ?? ""
    }

    private func save() async {
        saving = true
        do {
            try await service.updateConfig(["signal": [
                "bridgeUrl": bridgeUrl,
                "bridgeApiKey": bridgeApiKey,
                "webhookSecret": webhookSecret,
                "registeredNumber": registeredNumber,
                "autoResponse": autoResponse,
                "afterHoursResponse": afterHoursResponse,
            ]])
        } catch {
            // Error handled by service
        }
        saving = false
    }
}
```

- [ ] **Step 5: Create RCSChannelConfigView**

Create `apps/ios/Sources/Views/Settings/Channels/RCSChannelConfigView.swift`:

```swift
import SwiftUI

struct RCSChannelConfigView: View {
    let service: MessagingConfigService

    @State private var agentId = ""
    @State private var serviceAccountKey = ""
    @State private var webhookSecret = ""
    @State private var fallbackToSms = true
    @State private var autoResponse = ""
    @State private var afterHoursResponse = ""
    @State private var saving = false

    var body: some View {
        Form {
            Section(header: Text(NSLocalizedString("channels_rcs_agentSetup", comment: "Agent Setup"))) {
                TextField(NSLocalizedString("channels_rcs_agentId", comment: "Agent ID"), text: $agentId)
                    .autocapitalization(.none)
                    .accessibilityIdentifier("rcs-agent-id")

                VStack(alignment: .leading, spacing: 4) {
                    Text(NSLocalizedString("channels_rcs_serviceAccountKey", comment: "Service Account Key (JSON)"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextEditor(text: $serviceAccountKey)
                        .font(.system(.caption, design: .monospaced))
                        .frame(minHeight: 80)
                        .accessibilityIdentifier("rcs-service-key")
                }

                SecureField(NSLocalizedString("channels_rcs_webhookSecret", comment: "Webhook Secret"), text: $webhookSecret)
            }

            Section {
                Toggle(NSLocalizedString("channels_rcs_fallbackToSms", comment: "Fallback to SMS"), isOn: $fallbackToSms)
                Text(NSLocalizedString("channels_rcs_fallbackToSmsDesc", comment: ""))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            AutoResponseFields(autoResponse: $autoResponse, afterHoursResponse: $afterHoursResponse)

            Section {
                ConnectionTestButton(channel: "rcs", disabled: agentId.isEmpty) { channel in
                    try await service.testChannel(channel)
                }

                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView() } else { Text(NSLocalizedString("common_save", comment: "Save")) }
                }
                .disabled(saving || agentId.isEmpty)
            }
        }
        .navigationTitle(NSLocalizedString("channels_rcs_title", comment: "RCS Channel"))
        .onAppear { loadFromConfig() }
    }

    private func loadFromConfig() {
        guard let rcs = service.config?.rcs else { return }
        agentId = rcs.agentId
        serviceAccountKey = rcs.serviceAccountKey
        webhookSecret = rcs.webhookSecret ?? ""
        fallbackToSms = rcs.fallbackToSms
        autoResponse = rcs.autoResponse ?? ""
        afterHoursResponse = rcs.afterHoursResponse ?? ""
    }

    private func save() async {
        saving = true
        do {
            try await service.updateConfig(["rcs": [
                "agentId": agentId,
                "serviceAccountKey": serviceAccountKey,
                "webhookSecret": webhookSecret,
                "fallbackToSms": fallbackToSms,
                "autoResponse": autoResponse,
                "afterHoursResponse": afterHoursResponse,
            ]])
        } catch {
            // Error handled by service
        }
        saving = false
    }
}
```

- [ ] **Step 6: Create A2pRegistrationView**

Create `apps/ios/Sources/Views/Settings/Channels/A2pRegistrationView.swift`:

```swift
import SwiftUI

struct A2pRegistrationView: View {
    let service: MessagingConfigService

    @State private var showBrandForm = false
    @State private var showCampaignForm = false
    @State private var submitting = false

    // Brand form
    @State private var entityType = "NON_PROFIT"
    @State private var companyName = ""
    @State private var ein = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var street = ""
    @State private var city = ""
    @State private var state = ""
    @State private var postalCode = ""
    @State private var country = "US"

    // Campaign form
    @State private var useCase = "PUBLIC_SERVICE_ANNOUNCEMENT"
    @State private var campaignDescription = ""
    @State private var helpMessage = ""
    @State private var optinMessage = ""
    @State private var optoutMessage = ""
    @State private var sampleMessage1 = ""
    @State private var sampleMessage2 = ""

    var body: some View {
        let brandStatus = service.a2pRegistration?.brandStatus ?? "not_submitted"
        let campaignStatus = service.a2pRegistration?.campaignStatus ?? "not_submitted"
        let isApproved = brandStatus == "approved" && campaignStatus == "approved"
        let isSkipped = brandStatus == "skipped"

        Section(header: Text(NSLocalizedString("channels_a2p_title", comment: "A2P 10DLC Registration"))) {
            Text(NSLocalizedString("channels_a2p_description", comment: ""))
                .font(.caption)
                .foregroundStyle(.secondary)

            // Status
            HStack {
                Text(NSLocalizedString("channels_a2p_brandStatus", comment: "Brand"))
                Spacer()
                Text(brandStatus.replacingOccurrences(of: "_", with: " ").capitalized)
                    .foregroundStyle(brandStatus == "approved" ? .green : brandStatus == "failed" ? .red : .secondary)
            }

            HStack {
                Text(NSLocalizedString("channels_a2p_campaignStatus", comment: "Campaign"))
                Spacer()
                Text(campaignStatus.replacingOccurrences(of: "_", with: " ").capitalized)
                    .foregroundStyle(campaignStatus == "approved" ? .green : campaignStatus == "failed" ? .red : .secondary)
            }

            if let error = service.a2pRegistration?.error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            // Brand form trigger
            if brandStatus == "not_submitted" || brandStatus == "failed" {
                Button(brandStatus == "failed"
                    ? NSLocalizedString("channels_a2p_resubmitBrand", comment: "Re-submit Brand")
                    : NSLocalizedString("channels_a2p_submitBrand", comment: "Register Brand")) {
                    showBrandForm = true
                }
                .accessibilityIdentifier("a2p-start-brand")

                Button(NSLocalizedString("channels_a2p_skip", comment: "Skip A2P")) {
                    Task {
                        submitting = true
                        _ = try? await service.skipA2p(hubId: service.config?.enabledChannels.first ?? "")
                        submitting = false
                    }
                }
                .foregroundStyle(.secondary)
            }

            // Campaign form trigger
            if brandStatus == "approved" && (campaignStatus == "not_submitted" || campaignStatus == "failed") {
                Button(campaignStatus == "failed"
                    ? NSLocalizedString("channels_a2p_resubmitCampaign", comment: "Re-submit Campaign")
                    : NSLocalizedString("channels_a2p_submitCampaign", comment: "Register Campaign")) {
                    showCampaignForm = true
                }
                .accessibilityIdentifier("a2p-start-campaign")
            }

            // Approved state
            if isApproved {
                Label(NSLocalizedString("channels_a2p_approvedMessage", comment: "Approved"), systemImage: "checkmark.seal.fill")
                    .foregroundStyle(.green)
                    .font(.caption)
            }
        }
        .sheet(isPresented: $showBrandForm) { brandFormSheet }
        .sheet(isPresented: $showCampaignForm) { campaignFormSheet }
    }

    private var brandFormSheet: some View {
        NavigationStack {
            Form {
                Section(header: Text(NSLocalizedString("channels_a2p_brandFormTitle", comment: "Brand Registration"))) {
                    Picker(NSLocalizedString("channels_a2p_entityType", comment: "Entity Type"), selection: $entityType) {
                        Text(NSLocalizedString("channels_a2p_entityTypes_NON_PROFIT", comment: "Non-profit")).tag("NON_PROFIT")
                        Text(NSLocalizedString("channels_a2p_entityTypes_PRIVATE_PROFIT", comment: "Private")).tag("PRIVATE_PROFIT")
                        Text(NSLocalizedString("channels_a2p_entityTypes_PUBLIC_PROFIT", comment: "Public")).tag("PUBLIC_PROFIT")
                        Text(NSLocalizedString("channels_a2p_entityTypes_GOVERNMENT", comment: "Government")).tag("GOVERNMENT")
                    }
                    TextField(NSLocalizedString("channels_a2p_companyName", comment: "Company Name"), text: $companyName)
                        .accessibilityIdentifier("a2p-company-name")
                    TextField(NSLocalizedString("channels_a2p_ein", comment: "EIN"), text: $ein)
                        .accessibilityIdentifier("a2p-ein")
                    TextField(NSLocalizedString("channels_a2p_phone", comment: "Phone"), text: $phone)
                    TextField(NSLocalizedString("channels_a2p_email", comment: "Email"), text: $email)
                }

                Section(header: Text(NSLocalizedString("channels_a2p_address", comment: "Address"))) {
                    TextField(NSLocalizedString("channels_a2p_street", comment: "Street"), text: $street)
                    TextField(NSLocalizedString("channels_a2p_city", comment: "City"), text: $city)
                    TextField(NSLocalizedString("channels_a2p_state", comment: "State"), text: $state)
                    TextField(NSLocalizedString("channels_a2p_postalCode", comment: "Postal Code"), text: $postalCode)
                    TextField(NSLocalizedString("channels_a2p_country", comment: "Country"), text: $country)
                }
            }
            .navigationTitle(NSLocalizedString("channels_a2p_brandFormTitle", comment: "Brand Registration"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("common_cancel", comment: "Cancel")) { showBrandForm = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(NSLocalizedString("channels_a2p_submitBrand", comment: "Submit")) {
                        Task { await submitBrand() }
                    }
                    .disabled(submitting || companyName.isEmpty || ein.isEmpty)
                    .accessibilityIdentifier("a2p-submit-brand")
                }
            }
        }
    }

    private var campaignFormSheet: some View {
        NavigationStack {
            Form {
                Section(header: Text(NSLocalizedString("channels_a2p_campaignFormTitle", comment: "Campaign Registration"))) {
                    TextField(NSLocalizedString("channels_a2p_campaignDescription", comment: "Description"), text: $campaignDescription)
                        .accessibilityIdentifier("a2p-campaign-desc")
                    TextField(NSLocalizedString("channels_a2p_helpMessage", comment: "Help Message"), text: $helpMessage)
                    TextField(NSLocalizedString("channels_a2p_optinMessage", comment: "Opt-in Message"), text: $optinMessage)
                    TextField(NSLocalizedString("channels_a2p_optoutMessage", comment: "Opt-out Message"), text: $optoutMessage)
                    TextField(NSLocalizedString("channels_a2p_sampleMessages", comment: "Sample 1"), text: $sampleMessage1)
                    TextField(NSLocalizedString("channels_a2p_sampleMessages", comment: "Sample 2"), text: $sampleMessage2)
                }
            }
            .navigationTitle(NSLocalizedString("channels_a2p_campaignFormTitle", comment: "Campaign Registration"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(NSLocalizedString("common_cancel", comment: "Cancel")) { showCampaignForm = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(NSLocalizedString("channels_a2p_submitCampaign", comment: "Submit")) {
                        Task { await submitCampaign() }
                    }
                    .disabled(submitting || campaignDescription.isEmpty)
                    .accessibilityIdentifier("a2p-submit-campaign")
                }
            }
        }
    }

    private func submitBrand() async {
        submitting = true
        let brandInfo: [String: Any] = [
            "entityType": entityType,
            "companyName": companyName,
            "ein": ein,
            "phone": phone,
            "email": email,
            "street": street,
            "city": city,
            "state": state,
            "postalCode": postalCode,
            "country": country,
        ]
        do {
            let result = try await service.submitBrand(hubId: service.a2pRegistration?.hubId ?? "", brandInfo: brandInfo)
            service.a2pRegistration = result
            showBrandForm = false
        } catch {
            // Error shown via service
        }
        submitting = false
    }

    private func submitCampaign() async {
        guard let regId = service.a2pRegistration?.id else { return }
        submitting = true
        let campaignInfo: [String: Any] = [
            "useCase": useCase,
            "description": campaignDescription,
            "helpMessage": helpMessage,
            "optinMessage": optinMessage,
            "optoutMessage": optoutMessage,
            "sampleMessages": [sampleMessage1, sampleMessage2].filter { !$0.isEmpty },
            "subscriberOptin": true,
            "subscriberOptout": true,
            "subscriberHelp": true,
        ]
        do {
            let result = try await service.submitCampaign(
                registrationId: regId,
                hubId: service.a2pRegistration?.hubId ?? "",
                campaignInfo: campaignInfo
            )
            service.a2pRegistration = result
            showCampaignForm = false
        } catch {
            // Error shown via service
        }
        submitting = false
    }
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Sources/Views/Settings/Channels/
git commit -m "feat(ios): add all per-channel config views (SMS, WhatsApp, Telegram, Signal, RCS, A2P)"
```

---

## Task 17: Android — MessagingConfigRepository

**Files:**
- New: `apps/android/app/src/main/java/org/llamenos/hotline/api/MessagingConfigRepository.kt`

- [ ] **Step 1: Create the Android messaging config repository**

Create `apps/android/app/src/main/java/org/llamenos/hotline/api/MessagingConfigRepository.kt`:

```kotlin
package org.llamenos.hotline.api

import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class SMSConfigDto(
    val enabled: Boolean = false,
    val autoResponse: String? = null,
    val afterHoursResponse: String? = null,
)

@Serializable
data class WhatsAppConfigDto(
    val integrationMode: String = "twilio",
    val phoneNumberId: String? = null,
    val businessAccountId: String? = null,
    val accessToken: String? = null,
    val verifyToken: String? = null,
    val appSecret: String? = null,
    val autoResponse: String? = null,
    val afterHoursResponse: String? = null,
)

@Serializable
data class SignalConfigDto(
    val bridgeUrl: String = "",
    val bridgeApiKey: String = "",
    val webhookSecret: String = "",
    val registeredNumber: String = "",
    val trustMode: String? = null,
    val autoResponse: String? = null,
    val afterHoursResponse: String? = null,
)

@Serializable
data class TelegramConfigDto(
    val enabled: Boolean = false,
    val botToken: String = "",
    val webhookSecret: String? = null,
    val botUsername: String? = null,
    val autoResponse: String? = null,
    val afterHoursResponse: String? = null,
)

@Serializable
data class RCSConfigDto(
    val agentId: String = "",
    val serviceAccountKey: String = "",
    val webhookSecret: String? = null,
    val fallbackToSms: Boolean = true,
    val autoResponse: String? = null,
    val afterHoursResponse: String? = null,
)

@Serializable
data class MessagingConfigDto(
    val enabledChannels: List<String> = emptyList(),
    val sms: SMSConfigDto? = null,
    val whatsapp: WhatsAppConfigDto? = null,
    val signal: SignalConfigDto? = null,
    val rcs: RCSConfigDto? = null,
    val telegram: TelegramConfigDto? = null,
    val autoAssign: Boolean = true,
    val inactivityTimeout: Int = 60,
    val maxConcurrentPerUser: Int = 3,
    val preferSignalDelivery: Boolean? = null,
    val smsContentMode: String? = null,
)

@Serializable
data class ConnectionTestDto(val connected: Boolean)

@Serializable
data class A2pRegistrationDto(
    val id: String = "",
    val hubId: String = "",
    val providerType: String = "",
    val brandStatus: String = "not_submitted",
    val campaignStatus: String = "not_submitted",
    val brandSidMasked: String? = null,
    val campaignSidMasked: String? = null,
    val error: String? = null,
    val submittedAt: String? = null,
    val approvedAt: String? = null,
)

@Singleton
class MessagingConfigRepository @Inject constructor(
    private val apiClient: ApiClient,
) {
    suspend fun getConfig(): MessagingConfigDto {
        return apiClient.get("/settings/messaging")
    }

    suspend fun updateConfig(updates: Map<String, Any?>): MessagingConfigDto {
        return apiClient.patch("/settings/messaging", updates)
    }

    suspend fun testChannel(channel: String): Boolean {
        val result: ConnectionTestDto = apiClient.post(
            "/settings/messaging/test",
            mapOf("channel" to channel),
        )
        return result.connected
    }

    suspend fun getA2pStatus(hubId: String): A2pRegistrationDto? {
        return try {
            apiClient.get("/provider-setup/a2p/status?hubId=$hubId")
        } catch (_: Exception) {
            null
        }
    }

    suspend fun submitBrand(hubId: String, brandInfo: Map<String, Any>): A2pRegistrationDto {
        return apiClient.post("/provider-setup/a2p/brand", mapOf(
            "hubId" to hubId,
            "brandInfo" to brandInfo,
        ))
    }

    suspend fun submitCampaign(
        registrationId: String,
        hubId: String,
        campaignInfo: Map<String, Any>,
    ): A2pRegistrationDto {
        return apiClient.post("/provider-setup/a2p/campaign", mapOf(
            "registrationId" to registrationId,
            "hubId" to hubId,
            "campaignInfo" to campaignInfo,
        ))
    }

    suspend fun skipA2p(hubId: String): A2pRegistrationDto {
        return apiClient.post("/provider-setup/a2p/skip", mapOf("hubId" to hubId))
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/api/MessagingConfigRepository.kt
git commit -m "feat(android): add MessagingConfigRepository for channel config and A2P management"
```

---

## Task 18: Android — Channel Config ViewModel and Screens

**Files:**
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/ChannelConfigViewModel.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/ChannelConfigListScreen.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/ConnectionTestButton.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/AutoResponseFields.kt`

- [ ] **Step 1: Create the ViewModel**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/ChannelConfigViewModel.kt`:

```kotlin
package org.llamenos.hotline.ui.admin.channels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.A2pRegistrationDto
import org.llamenos.hotline.api.MessagingConfigDto
import org.llamenos.hotline.api.MessagingConfigRepository
import javax.inject.Inject

data class ChannelConfigUiState(
    val config: MessagingConfigDto? = null,
    val a2pRegistration: A2pRegistrationDto? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
    val testResults: Map<String, Boolean> = emptyMap(),
)

enum class ChannelType(val key: String, val displayName: String, val iconName: String) {
    SMS("sms", "SMS", "sms"),
    WHATSAPP("whatsapp", "WhatsApp", "chat"),
    SIGNAL("signal", "Signal", "security"),
    TELEGRAM("telegram", "Telegram", "send"),
    RCS("rcs", "RCS", "smartphone"),
}

@HiltViewModel
class ChannelConfigViewModel @Inject constructor(
    private val repository: MessagingConfigRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ChannelConfigUiState())
    val state: StateFlow<ChannelConfigUiState> = _state.asStateFlow()

    fun loadConfig() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val config = repository.getConfig()
                _state.value = _state.value.copy(config = config, isLoading = false)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message, isLoading = false)
            }
        }
    }

    fun updateConfig(updates: Map<String, Any?>) {
        viewModelScope.launch {
            try {
                val config = repository.updateConfig(updates)
                _state.value = _state.value.copy(config = config)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    fun testChannel(channel: String) {
        viewModelScope.launch {
            try {
                val connected = repository.testChannel(channel)
                _state.value = _state.value.copy(
                    testResults = _state.value.testResults + (channel to connected),
                )
            } catch (_: Exception) {
                _state.value = _state.value.copy(
                    testResults = _state.value.testResults + (channel to false),
                )
            }
        }
    }

    fun loadA2pStatus(hubId: String) {
        viewModelScope.launch {
            val registration = repository.getA2pStatus(hubId)
            _state.value = _state.value.copy(a2pRegistration = registration)
        }
    }

    fun submitBrand(hubId: String, brandInfo: Map<String, Any>) {
        viewModelScope.launch {
            try {
                val result = repository.submitBrand(hubId, brandInfo)
                _state.value = _state.value.copy(a2pRegistration = result)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    fun submitCampaign(registrationId: String, hubId: String, campaignInfo: Map<String, Any>) {
        viewModelScope.launch {
            try {
                val result = repository.submitCampaign(registrationId, hubId, campaignInfo)
                _state.value = _state.value.copy(a2pRegistration = result)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    fun skipA2p(hubId: String) {
        viewModelScope.launch {
            try {
                val result = repository.skipA2p(hubId)
                _state.value = _state.value.copy(a2pRegistration = result)
            } catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }
}
```

- [ ] **Step 2: Create shared Android composables**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/ConnectionTestButton.kt`:

```kotlin
package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.llamenos.i18n.I18n

@Composable
fun ConnectionTestButton(
    channel: String,
    enabled: Boolean,
    onTest: suspend (String) -> Boolean,
    modifier: Modifier = Modifier,
) {
    var testing by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<Boolean?>(null) }
    val scope = rememberCoroutineScope()

    Row(verticalAlignment = Alignment.CenterVertically, modifier = modifier) {
        OutlinedButton(
            onClick = {
                scope.launch {
                    testing = true
                    result = null
                    result = try { onTest(channel) } catch (_: Exception) { false }
                    testing = false
                }
            },
            enabled = enabled && !testing,
            modifier = Modifier.testTag("test-$channel-btn"),
        ) {
            if (testing) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(I18n.channels_shared_testing)
            } else {
                Text(I18n.channels_shared_testConnection)
            }
        }

        result?.let { connected ->
            Spacer(Modifier.width(8.dp))
            Icon(
                imageVector = if (connected) Icons.Default.Check else Icons.Default.Close,
                contentDescription = null,
                tint = if (connected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                modifier = Modifier.size(16.dp),
            )
            Spacer(Modifier.width(4.dp))
            Text(
                text = if (connected) I18n.channels_shared_testSuccess else I18n.channels_shared_testFailed,
                style = MaterialTheme.typography.bodySmall,
                color = if (connected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            )
        }
    }
}
```

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/AutoResponseFields.kt`:

```kotlin
package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import org.llamenos.i18n.I18n

@Composable
fun AutoResponseFields(
    autoResponse: String,
    afterHoursResponse: String,
    onAutoResponseChange: (String) -> Unit,
    onAfterHoursResponseChange: (String) -> Unit,
    idPrefix: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        OutlinedTextField(
            value = autoResponse,
            onValueChange = onAutoResponseChange,
            label = { Text(I18n.channels_shared_autoResponse) },
            supportingText = { Text(I18n.channels_shared_autoResponseHelp, style = MaterialTheme.typography.bodySmall) },
            modifier = Modifier.fillMaxWidth().testTag("$idPrefix-auto-response"),
            minLines = 2,
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = afterHoursResponse,
            onValueChange = onAfterHoursResponseChange,
            label = { Text(I18n.channels_shared_afterHoursResponse) },
            supportingText = { Text(I18n.channels_shared_afterHoursHelp, style = MaterialTheme.typography.bodySmall) },
            modifier = Modifier.fillMaxWidth().testTag("$idPrefix-after-hours"),
            minLines = 2,
        )
    }
}
```

- [ ] **Step 3: Create the ChannelConfigListScreen**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/ChannelConfigListScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.i18n.I18n

private fun channelIcon(type: ChannelType): ImageVector = when (type) {
    ChannelType.SMS -> Icons.Default.Phone
    ChannelType.WHATSAPP -> Icons.AutoMirrored.Default.Chat
    ChannelType.SIGNAL -> Icons.Default.Security
    ChannelType.TELEGRAM -> Icons.Default.Send
    ChannelType.RCS -> Icons.Default.Smartphone
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChannelConfigListScreen(
    onChannelClick: (ChannelType) -> Unit,
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(Unit) { viewModel.loadConfig() }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(I18n.channels_title) })
        },
    ) { padding ->
        if (state.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.fillMaxSize().padding(padding).testTag("loading"),
            )
        } else {
            LazyColumn(modifier = Modifier.padding(padding)) {
                items(ChannelType.entries) { channel ->
                    val isEnabled = state.config?.enabledChannels?.contains(channel.key) == true
                    ListItem(
                        headlineContent = { Text(channel.displayName) },
                        supportingContent = {
                            Text(
                                if (isEnabled) I18n.common_enabled else I18n.common_disabled,
                                color = if (isEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                        leadingContent = {
                            Icon(
                                imageVector = channelIcon(channel),
                                contentDescription = channel.displayName,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                        modifier = Modifier
                            .clickable { onChannelClick(channel) }
                            .testTag("channel-${channel.key}"),
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/
git commit -m "feat(android): add channel config ViewModel, list screen, and shared composables"
```

---

## Task 19: Android — Per-Channel Config Screens

**Files:**
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/SmsChannelConfigScreen.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/WhatsAppChannelConfigScreen.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/TelegramChannelConfigScreen.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/SignalChannelConfigScreen.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/RcsChannelConfigScreen.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/A2pRegistrationSection.kt`

- [ ] **Step 1: Create SmsChannelConfigScreen**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/SmsChannelConfigScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.i18n.I18n

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmsChannelConfigScreen(
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var enabled by remember { mutableStateOf(state.config?.sms?.enabled ?: false) }
    var contentMode by remember { mutableStateOf(state.config?.smsContentMode ?: "notification-only") }
    var autoResponse by remember { mutableStateOf(state.config?.sms?.autoResponse ?: "") }
    var afterHoursResponse by remember { mutableStateOf(state.config?.sms?.afterHoursResponse ?: "") }

    LaunchedEffect(state.config) {
        state.config?.let { config ->
            enabled = config.sms?.enabled ?: false
            contentMode = config.smsContentMode ?: "notification-only"
            autoResponse = config.sms?.autoResponse ?: ""
            afterHoursResponse = config.sms?.afterHoursResponse ?: ""
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text(I18n.channels_sms_title) }) },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Switch(
                        checked = enabled,
                        onCheckedChange = { enabled = it },
                        modifier = Modifier.testTag("sms-enabled-toggle"),
                    )
                    Text(I18n.channels_sms_providerNote, style = MaterialTheme.typography.bodySmall)
                }
            }

            Spacer(Modifier.height(16.dp))

            Text(I18n.channels_sms_contentMode, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth().testTag("sms-content-mode")) {
                SegmentedButton(
                    selected = contentMode == "full",
                    onClick = { contentMode = "full" },
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                ) { Text(I18n.channels_sms_contentModeFull) }
                SegmentedButton(
                    selected = contentMode == "notification-only",
                    onClick = { contentMode = "notification-only" },
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                ) { Text(I18n.channels_sms_contentModeNotification) }
            }

            Spacer(Modifier.height(16.dp))

            AutoResponseFields(
                autoResponse = autoResponse,
                afterHoursResponse = afterHoursResponse,
                onAutoResponseChange = { autoResponse = it },
                onAfterHoursResponseChange = { afterHoursResponse = it },
                idPrefix = "sms",
            )

            Spacer(Modifier.height(16.dp))

            ConnectionTestButton(
                channel = "sms",
                enabled = enabled,
                onTest = { viewModel.testChannel(it); state.testResults["sms"] ?: false },
            )

            Spacer(Modifier.height(16.dp))

            Button(
                onClick = {
                    viewModel.updateConfig(mapOf(
                        "sms" to mapOf(
                            "enabled" to enabled,
                            "autoResponse" to autoResponse,
                            "afterHoursResponse" to afterHoursResponse,
                        ),
                        "smsContentMode" to contentMode,
                    ))
                },
                modifier = Modifier.fillMaxWidth().testTag("sms-save-btn"),
            ) { Text(I18n.common_save) }

            Spacer(Modifier.height(16.dp))

            A2pRegistrationSection(viewModel = viewModel)
        }
    }
}
```

- [ ] **Step 2: Create WhatsAppChannelConfigScreen, TelegramChannelConfigScreen, SignalChannelConfigScreen, RcsChannelConfigScreen**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/WhatsAppChannelConfigScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.i18n.I18n

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WhatsAppChannelConfigScreen(
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var integrationMode by remember { mutableStateOf(state.config?.whatsapp?.integrationMode ?: "twilio") }
    var phoneNumberId by remember { mutableStateOf(state.config?.whatsapp?.phoneNumberId ?: "") }
    var businessAccountId by remember { mutableStateOf(state.config?.whatsapp?.businessAccountId ?: "") }
    var accessToken by remember { mutableStateOf(state.config?.whatsapp?.accessToken ?: "") }
    var verifyToken by remember { mutableStateOf(state.config?.whatsapp?.verifyToken ?: "") }
    var appSecret by remember { mutableStateOf(state.config?.whatsapp?.appSecret ?: "") }
    var autoResponse by remember { mutableStateOf(state.config?.whatsapp?.autoResponse ?: "") }
    var afterHoursResponse by remember { mutableStateOf(state.config?.whatsapp?.afterHoursResponse ?: "") }

    LaunchedEffect(state.config) {
        state.config?.whatsapp?.let { wa ->
            integrationMode = wa.integrationMode
            phoneNumberId = wa.phoneNumberId ?: ""
            businessAccountId = wa.businessAccountId ?: ""
            accessToken = wa.accessToken ?: ""
            verifyToken = wa.verifyToken ?: ""
            appSecret = wa.appSecret ?: ""
            autoResponse = wa.autoResponse ?: ""
            afterHoursResponse = wa.afterHoursResponse ?: ""
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(I18n.channels_whatsapp_title) }) }) { padding ->
        Column(
            modifier = Modifier.padding(padding).padding(16.dp).verticalScroll(rememberScrollState()),
        ) {
            Text(I18n.channels_whatsapp_integrationMode, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth().testTag("whatsapp-integration-mode")) {
                SegmentedButton(selected = integrationMode == "twilio", onClick = { integrationMode = "twilio" }, shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text(I18n.channels_whatsapp_modeTwilio) }
                SegmentedButton(selected = integrationMode == "direct", onClick = { integrationMode = "direct" }, shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text(I18n.channels_whatsapp_modeDirect) }
            }

            if (integrationMode == "direct") {
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(value = phoneNumberId, onValueChange = { phoneNumberId = it }, label = { Text(I18n.channels_whatsapp_phoneNumberId) }, modifier = Modifier.fillMaxWidth().testTag("whatsapp-phone-number-id"))
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = businessAccountId, onValueChange = { businessAccountId = it }, label = { Text(I18n.channels_whatsapp_businessAccountId) }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = accessToken, onValueChange = { accessToken = it }, label = { Text(I18n.channels_whatsapp_accessToken) }, modifier = Modifier.fillMaxWidth().testTag("whatsapp-access-token"))
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = verifyToken, onValueChange = { verifyToken = it }, label = { Text(I18n.channels_whatsapp_verifyToken) }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = appSecret, onValueChange = { appSecret = it }, label = { Text(I18n.channels_whatsapp_appSecret) }, modifier = Modifier.fillMaxWidth())
            } else {
                Spacer(Modifier.height(8.dp))
                Text(I18n.channels_whatsapp_twilioNote, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            Spacer(Modifier.height(16.dp))
            AutoResponseFields(autoResponse = autoResponse, afterHoursResponse = afterHoursResponse, onAutoResponseChange = { autoResponse = it }, onAfterHoursResponseChange = { afterHoursResponse = it }, idPrefix = "whatsapp")
            Spacer(Modifier.height(16.dp))
            ConnectionTestButton(channel = "whatsapp", enabled = true, onTest = { viewModel.testChannel(it); state.testResults["whatsapp"] ?: false })
            Spacer(Modifier.height(16.dp))
            Button(onClick = {
                val updates = mutableMapOf<String, Any?>("integrationMode" to integrationMode, "autoResponse" to autoResponse, "afterHoursResponse" to afterHoursResponse)
                if (integrationMode == "direct") { updates["phoneNumberId"] = phoneNumberId; updates["businessAccountId"] = businessAccountId; updates["accessToken"] = accessToken; updates["verifyToken"] = verifyToken; updates["appSecret"] = appSecret }
                viewModel.updateConfig(mapOf("whatsapp" to updates))
            }, modifier = Modifier.fillMaxWidth().testTag("whatsapp-save-btn")) { Text(I18n.common_save) }
        }
    }
}
```

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/TelegramChannelConfigScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.i18n.I18n

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TelegramChannelConfigScreen(
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var enabled by remember { mutableStateOf(state.config?.telegram?.enabled ?: false) }
    var botToken by remember { mutableStateOf(state.config?.telegram?.botToken ?: "") }
    var botUsername by remember { mutableStateOf(state.config?.telegram?.botUsername ?: "") }
    var webhookSecret by remember { mutableStateOf(state.config?.telegram?.webhookSecret ?: "") }
    var autoResponse by remember { mutableStateOf(state.config?.telegram?.autoResponse ?: "") }
    var afterHoursResponse by remember { mutableStateOf(state.config?.telegram?.afterHoursResponse ?: "") }

    LaunchedEffect(state.config) {
        state.config?.telegram?.let { tg ->
            enabled = tg.enabled; botToken = tg.botToken; botUsername = tg.botUsername ?: ""
            webhookSecret = tg.webhookSecret ?: ""; autoResponse = tg.autoResponse ?: ""; afterHoursResponse = tg.afterHoursResponse ?: ""
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(I18n.channels_telegram_title) }) }) { padding ->
        Column(modifier = Modifier.padding(padding).padding(16.dp).verticalScroll(rememberScrollState())) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(I18n.channels_shared_enableChannel, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                Switch(checked = enabled, onCheckedChange = { enabled = it }, modifier = Modifier.testTag("telegram-enabled-toggle"))
            }
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(value = botToken, onValueChange = { botToken = it }, label = { Text(I18n.channels_telegram_botToken) }, modifier = Modifier.fillMaxWidth().testTag("telegram-bot-token"))
            Text(I18n.channels_telegram_botTokenHelp, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = botUsername, onValueChange = { botUsername = it }, label = { Text(I18n.channels_telegram_botUsername) }, modifier = Modifier.fillMaxWidth().testTag("telegram-bot-username"))
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = webhookSecret, onValueChange = { webhookSecret = it }, label = { Text(I18n.channels_telegram_webhookSecret) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(16.dp))
            AutoResponseFields(autoResponse = autoResponse, afterHoursResponse = afterHoursResponse, onAutoResponseChange = { autoResponse = it }, onAfterHoursResponseChange = { afterHoursResponse = it }, idPrefix = "telegram")
            Spacer(Modifier.height(16.dp))
            ConnectionTestButton(channel = "telegram", enabled = enabled && botToken.isNotEmpty(), onTest = { viewModel.testChannel(it); state.testResults["telegram"] ?: false })
            Spacer(Modifier.height(16.dp))
            Button(onClick = {
                viewModel.updateConfig(mapOf("telegram" to mapOf("enabled" to enabled, "botToken" to botToken, "botUsername" to botUsername, "webhookSecret" to webhookSecret, "autoResponse" to autoResponse, "afterHoursResponse" to afterHoursResponse)))
            }, enabled = botToken.isNotEmpty(), modifier = Modifier.fillMaxWidth().testTag("telegram-save-btn")) { Text(I18n.common_save) }
        }
    }
}
```

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/SignalChannelConfigScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.i18n.I18n

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignalChannelConfigScreen(
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var bridgeUrl by remember { mutableStateOf(state.config?.signal?.bridgeUrl ?: "") }
    var bridgeApiKey by remember { mutableStateOf(state.config?.signal?.bridgeApiKey ?: "") }
    var webhookSecret by remember { mutableStateOf(state.config?.signal?.webhookSecret ?: "") }
    var registeredNumber by remember { mutableStateOf(state.config?.signal?.registeredNumber ?: "") }
    var autoResponse by remember { mutableStateOf(state.config?.signal?.autoResponse ?: "") }
    var afterHoursResponse by remember { mutableStateOf(state.config?.signal?.afterHoursResponse ?: "") }

    LaunchedEffect(state.config) {
        state.config?.signal?.let { sig ->
            bridgeUrl = sig.bridgeUrl; bridgeApiKey = sig.bridgeApiKey; webhookSecret = sig.webhookSecret
            registeredNumber = sig.registeredNumber; autoResponse = sig.autoResponse ?: ""; afterHoursResponse = sig.afterHoursResponse ?: ""
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(I18n.channels_signal_title) }) }) { padding ->
        Column(modifier = Modifier.padding(padding).padding(16.dp).verticalScroll(rememberScrollState())) {
            Text(I18n.channels_signal_e2eeNote, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(value = bridgeUrl, onValueChange = { bridgeUrl = it }, label = { Text(I18n.channels_signal_bridgeUrl) }, modifier = Modifier.fillMaxWidth().testTag("signal-bridge-url"))
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = bridgeApiKey, onValueChange = { bridgeApiKey = it }, label = { Text(I18n.channels_signal_bridgeApiKey) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = webhookSecret, onValueChange = { webhookSecret = it }, label = { Text(I18n.channels_signal_webhookSecret) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = registeredNumber, onValueChange = { registeredNumber = it }, label = { Text(I18n.channels_signal_registeredNumber) }, modifier = Modifier.fillMaxWidth().testTag("signal-registered-number"))
            Spacer(Modifier.height(16.dp))
            AutoResponseFields(autoResponse = autoResponse, afterHoursResponse = afterHoursResponse, onAutoResponseChange = { autoResponse = it }, onAfterHoursResponseChange = { afterHoursResponse = it }, idPrefix = "signal")
            Spacer(Modifier.height(16.dp))
            ConnectionTestButton(channel = "signal", enabled = bridgeUrl.isNotEmpty(), onTest = { viewModel.testChannel(it); state.testResults["signal"] ?: false })
            Spacer(Modifier.height(16.dp))
            Button(onClick = {
                viewModel.updateConfig(mapOf("signal" to mapOf("bridgeUrl" to bridgeUrl, "bridgeApiKey" to bridgeApiKey, "webhookSecret" to webhookSecret, "registeredNumber" to registeredNumber, "autoResponse" to autoResponse, "afterHoursResponse" to afterHoursResponse)))
            }, enabled = bridgeUrl.isNotEmpty(), modifier = Modifier.fillMaxWidth().testTag("signal-save-btn")) { Text(I18n.common_save) }
        }
    }
}
```

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/RcsChannelConfigScreen.kt`:

```kotlin
package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import org.llamenos.i18n.I18n

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RcsChannelConfigScreen(
    viewModel: ChannelConfigViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var agentId by remember { mutableStateOf(state.config?.rcs?.agentId ?: "") }
    var serviceAccountKey by remember { mutableStateOf(state.config?.rcs?.serviceAccountKey ?: "") }
    var webhookSecret by remember { mutableStateOf(state.config?.rcs?.webhookSecret ?: "") }
    var fallbackToSms by remember { mutableStateOf(state.config?.rcs?.fallbackToSms ?: true) }
    var autoResponse by remember { mutableStateOf(state.config?.rcs?.autoResponse ?: "") }
    var afterHoursResponse by remember { mutableStateOf(state.config?.rcs?.afterHoursResponse ?: "") }

    LaunchedEffect(state.config) {
        state.config?.rcs?.let { rcs ->
            agentId = rcs.agentId; serviceAccountKey = rcs.serviceAccountKey; webhookSecret = rcs.webhookSecret ?: ""
            fallbackToSms = rcs.fallbackToSms; autoResponse = rcs.autoResponse ?: ""; afterHoursResponse = rcs.afterHoursResponse ?: ""
        }
    }

    Scaffold(topBar = { TopAppBar(title = { Text(I18n.channels_rcs_title) }) }) { padding ->
        Column(modifier = Modifier.padding(padding).padding(16.dp).verticalScroll(rememberScrollState())) {
            OutlinedTextField(value = agentId, onValueChange = { agentId = it }, label = { Text(I18n.channels_rcs_agentId) }, modifier = Modifier.fillMaxWidth().testTag("rcs-agent-id"))
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = serviceAccountKey, onValueChange = { serviceAccountKey = it }, label = { Text(I18n.channels_rcs_serviceAccountKey) }, modifier = Modifier.fillMaxWidth().testTag("rcs-service-key"), minLines = 4)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = webhookSecret, onValueChange = { webhookSecret = it }, label = { Text(I18n.channels_rcs_webhookSecret) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(I18n.channels_rcs_fallbackToSms, style = MaterialTheme.typography.bodyMedium)
                    Text(I18n.channels_rcs_fallbackToSmsDesc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(checked = fallbackToSms, onCheckedChange = { fallbackToSms = it })
            }
            Spacer(Modifier.height(16.dp))
            AutoResponseFields(autoResponse = autoResponse, afterHoursResponse = afterHoursResponse, onAutoResponseChange = { autoResponse = it }, onAfterHoursResponseChange = { afterHoursResponse = it }, idPrefix = "rcs")
            Spacer(Modifier.height(16.dp))
            ConnectionTestButton(channel = "rcs", enabled = agentId.isNotEmpty(), onTest = { viewModel.testChannel(it); state.testResults["rcs"] ?: false })
            Spacer(Modifier.height(16.dp))
            Button(onClick = {
                viewModel.updateConfig(mapOf("rcs" to mapOf("agentId" to agentId, "serviceAccountKey" to serviceAccountKey, "webhookSecret" to webhookSecret, "fallbackToSms" to fallbackToSms, "autoResponse" to autoResponse, "afterHoursResponse" to afterHoursResponse)))
            }, enabled = agentId.isNotEmpty(), modifier = Modifier.fillMaxWidth().testTag("rcs-save-btn")) { Text(I18n.common_save) }
        }
    }
}
```

- [ ] **Step 3: Create A2pRegistrationSection**

Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/A2pRegistrationSection.kt`:

```kotlin
package org.llamenos.hotline.ui.admin.channels

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import org.llamenos.i18n.I18n

@Composable
fun A2pRegistrationSection(
    viewModel: ChannelConfigViewModel,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsState()
    val registration = state.a2pRegistration
    val brandStatus = registration?.brandStatus ?: "not_submitted"
    val campaignStatus = registration?.campaignStatus ?: "not_submitted"
    val isApproved = brandStatus == "approved" && campaignStatus == "approved"

    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth().then(Modifier.Companion.run { Modifier })) {
            Text(
                I18n.channels_a2p_title,
                style = MaterialTheme.typography.titleSmall,
            )
            Text(
                I18n.channels_a2p_description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(8.dp))

            // Status badges
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Brand: $brandStatus", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.width(16.dp))
                Text("Campaign: $campaignStatus", style = MaterialTheme.typography.bodySmall)
            }

            registration?.error?.let { error ->
                Spacer(Modifier.height(8.dp))
                Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(12.dp))

            if (isApproved) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text(I18n.channels_a2p_approvedMessage, style = MaterialTheme.typography.bodySmall)
                }
            } else if (brandStatus == "not_submitted" || brandStatus == "failed") {
                Button(
                    onClick = { /* Navigate to brand form - handled by parent navigation */ },
                    modifier = Modifier.testTag("a2p-start-brand"),
                ) {
                    Text(
                        if (brandStatus == "failed") I18n.channels_a2p_resubmitBrand
                        else I18n.channels_a2p_submitBrand,
                    )
                }
                Spacer(Modifier.height(8.dp))
                TextButton(
                    onClick = { viewModel.skipA2p(registration?.hubId ?: "") },
                ) { Text(I18n.channels_a2p_skip) }
            } else if (brandStatus == "approved" && (campaignStatus == "not_submitted" || campaignStatus == "failed")) {
                Button(
                    onClick = { /* Navigate to campaign form - handled by parent navigation */ },
                    modifier = Modifier.testTag("a2p-start-campaign"),
                ) {
                    Text(
                        if (campaignStatus == "failed") I18n.channels_a2p_resubmitCampaign
                        else I18n.channels_a2p_submitCampaign,
                    )
                }
            }
        }
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/channels/
git commit -m "feat(android): add per-channel config screens (SMS, WhatsApp, Telegram, Signal, RCS) and A2P section"
```

---

## Task 20: BDD Feature File

**Files:**
- New: `packages/test-specs/features/admin/channel-config.feature`

- [ ] **Step 1: Create the BDD feature file**

Create `packages/test-specs/features/admin/channel-config.feature`:

```gherkin
Feature: Channel Configuration
  As a hub admin
  I want to configure messaging channels
  So that my hotline can receive and send messages via multiple channels

  Background:
    Given I am authenticated as a hub admin
    And I have the "settings:manage-messaging" permission

  Scenario: Enable SMS channel
    When I PATCH "/settings/messaging" with:
      | field           | value |
      | sms.enabled     | true  |
    Then the response status is 200
    And the response "enabledChannels" includes "sms"

  Scenario: Set SMS content mode to notification-only
    When I PATCH "/settings/messaging" with:
      | field          | value             |
      | smsContentMode | notification-only |
    Then the response status is 200
    And the response "smsContentMode" is "notification-only"

  Scenario: Configure WhatsApp with Twilio integration mode
    When I PATCH "/settings/messaging" with:
      | field                      | value  |
      | whatsapp.integrationMode   | twilio |
      | whatsapp.autoResponse      | Hi!    |
    Then the response status is 200
    And the response "whatsapp.integrationMode" is "twilio"

  Scenario: Configure WhatsApp with direct Meta API mode
    When I PATCH "/settings/messaging" with:
      | field                       | value        |
      | whatsapp.integrationMode    | direct       |
      | whatsapp.phoneNumberId      | 1234567890   |
      | whatsapp.businessAccountId  | 9876543210   |
    Then the response status is 200
    And the response "whatsapp.integrationMode" is "direct"

  Scenario: Configure Telegram bot
    When I PATCH "/settings/messaging" with:
      | field                  | value                       |
      | telegram.enabled       | true                        |
      | telegram.botToken      | 123456:ABC-DEF              |
      | telegram.botUsername   | @TestBot                    |
    Then the response status is 200
    And the response "telegram.botToken" is "123456:ABC-DEF"

  Scenario: Test messaging channel connection
    Given the "signal" channel is configured
    When I POST "/settings/messaging/test" with:
      | field   | value  |
      | channel | signal |
    Then the response status is 200
    And the response has a "connected" boolean field

  Scenario: Set auto-response messages
    When I PATCH "/settings/messaging" with:
      | field                        | value                           |
      | sms.autoResponse             | Thanks for contacting us        |
      | sms.afterHoursResponse       | We are currently closed         |
    Then the response status is 200

  Scenario: Get A2P registration status
    When I GET "/provider-setup/a2p/status"
    Then the response status is 200 or 404

  Scenario: Skip A2P registration
    Given I have the "telephony:manage-a2p" permission
    When I POST "/provider-setup/a2p/skip" with:
      | field | value |
    Then the response status is 200
    And the response "brandStatus" is "skipped"

  Scenario: Unauthorized user cannot configure channels
    Given I am authenticated as a regular volunteer
    And I do not have the "settings:manage-messaging" permission
    When I PATCH "/settings/messaging" with:
      | field       | value |
      | sms.enabled | true  |
    Then the response status is 403
```

- [ ] **Step 2: Commit**

```bash
git add packages/test-specs/features/admin/channel-config.feature
git commit -m "test(bdd): add channel configuration feature scenarios"
```

---

## Task 21: BDD Step Definitions

**Files:**
- New: `tests/steps/backend/channel-config.steps.ts`

- [ ] **Step 1: Create step definitions**

Create `tests/steps/backend/channel-config.steps.ts`:

```typescript
import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'expect'
import type { TestWorld } from '../support/world'

When('I PATCH {string} with:', async function (this: TestWorld, path: string, table: any) {
  const body: Record<string, unknown> = {}
  for (const row of table.hashes()) {
    const keys = row.field.split('.')
    let current = body
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = current[keys[i]] || {}
      current = current[keys[i]] as Record<string, unknown>
    }
    const value = row.value === 'true' ? true : row.value === 'false' ? false : row.value
    current[keys[keys.length - 1]] = value
  }

  this.response = await this.request(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  this.responseBody = await this.response.json()
})

When('I POST {string} with:', async function (this: TestWorld, path: string, table: any) {
  const body: Record<string, unknown> = {}
  for (const row of table.hashes()) {
    body[row.field] = row.value === 'true' ? true : row.value === 'false' ? false : row.value
  }

  this.response = await this.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  this.responseBody = await this.response.json()
})

When('I GET {string}', async function (this: TestWorld, path: string) {
  this.response = await this.request(path)
  this.responseBody = await this.response.json()
})

Then('the response status is {int}', function (this: TestWorld, status: number) {
  expect(this.response.status).toBe(status)
})

Then('the response status is {int} or {int}', function (this: TestWorld, s1: number, s2: number) {
  expect([s1, s2]).toContain(this.response.status)
})

Then('the response {string} includes {string}', function (this: TestWorld, field: string, value: string) {
  const arr = getNestedField(this.responseBody, field)
  expect(Array.isArray(arr)).toBe(true)
  expect(arr).toContain(value)
})

Then('the response {string} is {string}', function (this: TestWorld, field: string, value: string) {
  expect(getNestedField(this.responseBody, field)).toBe(value)
})

Then('the response has a {string} boolean field', function (this: TestWorld, field: string) {
  expect(typeof getNestedField(this.responseBody, field)).toBe('boolean')
})

Given('the {string} channel is configured', async function (this: TestWorld, channel: string) {
  // Pre-configure the channel with minimal data so tests can proceed
  const config: Record<string, unknown> = {}
  if (channel === 'signal') {
    config.signal = { bridgeUrl: 'http://localhost:8080', bridgeApiKey: 'test', webhookSecret: 'test', registeredNumber: '+1234' }
  }
  await this.request('/settings/messaging', {
    method: 'PATCH',
    body: JSON.stringify(config),
  })
})

function getNestedField(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj)
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/steps/backend/channel-config.steps.ts
git commit -m "test(bdd): add step definitions for channel config feature scenarios"
```

---

## Task 22: Playwright E2E Tests

**Files:**
- New: `tests/channel-config.spec.ts`

- [ ] **Step 1: Create Playwright E2E test file**

Create `tests/channel-config.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Channel Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/settings')
    await page.waitForSelector('[data-testid="page-title"]')
  })

  test('shows all five channel sections', async ({ page }) => {
    // Channel sections should be rendered via registry
    await expect(page.locator('[data-testid="sms-channel"]')).toBeVisible()
    await expect(page.locator('[data-testid="whatsapp-channel"]')).toBeVisible()
    await expect(page.locator('[data-testid="signal-channel"]')).toBeVisible()
    await expect(page.locator('[data-testid="telegram-channel"]')).toBeVisible()
    await expect(page.locator('[data-testid="rcs-channel"]')).toBeVisible()
  })

  test('SMS section shows content mode selector', async ({ page }) => {
    await page.click('[data-testid="sms-channel-trigger"]')
    await expect(page.locator('[data-testid="sms-content-mode"]')).toBeVisible()
    await expect(page.locator('[data-testid="sms-enabled-toggle"]')).toBeVisible()
  })

  test('SMS section shows A2P registration panel', async ({ page }) => {
    await page.click('[data-testid="sms-channel-trigger"]')
    await expect(page.getByText('A2P 10DLC Registration')).toBeVisible()
  })

  test('WhatsApp section shows integration mode toggle', async ({ page }) => {
    await page.click('[data-testid="whatsapp-channel-trigger"]')
    await expect(page.locator('[data-testid="whatsapp-integration-mode"]')).toBeVisible()
  })

  test('WhatsApp direct mode shows credential fields', async ({ page }) => {
    await page.click('[data-testid="whatsapp-channel-trigger"]')
    // Select direct mode
    await page.click('[data-testid="whatsapp-integration-mode"]')
    await page.getByText('Direct Meta API').click()
    await expect(page.locator('[data-testid="whatsapp-phone-number-id"]')).toBeVisible()
    await expect(page.locator('[data-testid="whatsapp-access-token"]')).toBeVisible()
  })

  test('Telegram section shows bot token field', async ({ page }) => {
    await page.click('[data-testid="telegram-channel-trigger"]')
    await expect(page.locator('[data-testid="telegram-bot-token"]')).toBeVisible()
    await expect(page.locator('[data-testid="telegram-bot-username"]')).toBeVisible()
  })

  test('connection test button shows result badge', async ({ page }) => {
    await page.click('[data-testid="sms-channel-trigger"]')
    // Enable SMS first
    await page.locator('[data-testid="sms-enabled-toggle"]').click()
    await page.click('[data-testid="test-sms-btn"]')
    // Should show either success or failure badge
    await expect(page.locator('[data-testid="test-sms-btn"]').locator('..').locator('.badge')).toBeVisible({ timeout: 10000 })
  })

  test('auto-response fields are present in each channel', async ({ page }) => {
    // Check SMS section
    await page.click('[data-testid="sms-channel-trigger"]')
    await expect(page.locator('[data-testid="sms-auto-response"]')).toBeVisible()
    await expect(page.locator('[data-testid="sms-after-hours"]')).toBeVisible()
  })

  test('save button persists channel config', async ({ page }) => {
    await page.click('[data-testid="telegram-channel-trigger"]')
    await page.locator('[data-testid="telegram-bot-token"]').fill('123456:ABC-TEST')
    await page.locator('[data-testid="telegram-bot-username"]').fill('@TestBot')
    await page.click('[data-testid="telegram-save-btn"]')
    // Wait for success toast
    await expect(page.getByText('Success')).toBeVisible({ timeout: 5000 })
  })
})
```

- [ ] **Step 2: Run the E2E tests**

Run: `bun run test tests/channel-config.spec.ts`
Expected: Tests execute (some may fail against mock backend, but structure is verified)

- [ ] **Step 3: Commit**

```bash
git add tests/channel-config.spec.ts
git commit -m "test(e2e): add Playwright E2E tests for channel configuration"
```

---

## Task 23: Final Verification

- [ ] **Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: PASS with no errors

- [ ] **Step 2: Run i18n validation**

Run: `bun run i18n:validate:all`
Expected: PASS across desktop, iOS, Android

- [ ] **Step 3: Run test build**

Run: `bun run test:build`
Expected: Vite build succeeds with all new components included

- [ ] **Step 4: Run Playwright tests**

Run: `bun run test tests/channel-config.spec.ts`
Expected: All tests pass

- [ ] **Step 5: Run BDD tests**

Run: `bun run test:backend:bdd`
Expected: Channel config scenarios pass

- [ ] **Step 6: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: EP05a channel configuration final adjustments"
```
