import { useTranslation } from 'react-i18next'
import { Check, Sparkles } from 'lucide-react'
import type { ProviderTemplate } from '@protocol/schemas/provider-setup'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TELEPHONY_PROVIDER_LABELS } from '@shared/types'

interface ProviderTemplateCardProps {
  template: ProviderTemplate
  selected: boolean
  onSelect: () => void
}

export function ProviderTemplateCard({ template, selected, onSelect }: ProviderTemplateCardProps) {
  const { t } = useTranslation()

  const channelsText = template.defaultChannels?.map((c) => t(`hubOnboarding.channel${c.charAt(0).toUpperCase() + c.slice(1)}` as const)).join(', ') || ''
  const providerLabel = TELEPHONY_PROVIDER_LABELS[template.providerType] || template.providerType

  return (
    <Card
      className={`relative cursor-pointer transition-all hover:shadow-md ${
        selected ? 'border-primary ring-1 ring-primary' : 'border-border'
      }`}
      onClick={onSelect}
      data-testid={`template-card-${template.slug}`}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">{template.name}</h3>
          </div>
          {selected && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
        </div>

        {template.description && (
          <p className="text-xs text-muted-foreground">{template.description}</p>
        )}

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {t('hubOnboarding.templateProvider', { provider: providerLabel })}
          </p>
          {channelsText && (
            <p className="text-xs text-muted-foreground">
              {t('hubOnboarding.templateChannels', { channels: channelsText })}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

interface StartFromScratchCardProps {
  selected: boolean
  onSelect: () => void
}

export function StartFromScratchCard({ selected, onSelect }: StartFromScratchCardProps) {
  const { t } = useTranslation()

  return (
    <Card
      className={`relative cursor-pointer transition-all hover:shadow-md ${
        selected ? 'border-primary ring-1 ring-primary' : 'border-border'
      }`}
      onClick={onSelect}
      data-testid="template-card-scratch"
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-sm">{t('hubOnboarding.startFromScratch')}</h3>
          {selected && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('hubOnboarding.startFromScratchDescription')}
        </p>
      </div>
    </Card>
  )
}
