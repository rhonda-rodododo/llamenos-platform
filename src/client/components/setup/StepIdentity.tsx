import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '@shared/languages'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Building2, Globe, Type } from 'lucide-react'
import type { SetupData } from './SetupWizard'

interface Props {
  data: SetupData
  onChange: (patch: Partial<SetupData>) => void
  headingRef?: React.RefObject<HTMLHeadingElement | null>
}

export function StepIdentity({ data, onChange, headingRef }: Props) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">{t('setup.identityTitle')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('setup.identityDescription')}</p>
      </div>

      <div className="space-y-4">
        {/* Hotline Name */}
        <div className="space-y-2">
          <Label htmlFor="hotline-name" className="flex items-center gap-1.5">
            <Type className="h-3.5 w-3.5 text-muted-foreground" />
            {t('setup.hotlineName')}
          </Label>
          <Input
            id="hotline-name"
            value={data.hotlineName}
            onChange={e => onChange({ hotlineName: e.target.value })}
            placeholder={t('setup.hotlineNamePlaceholder')}
            aria-required="true"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{t('setup.hotlineNameHelp')}</p>
        </div>

        {/* Organization (optional) */}
        <div className="space-y-2">
          <Label htmlFor="org-name" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            {t('setup.organization')}
            <span className="text-xs text-muted-foreground font-normal">({t('setup.optional')})</span>
          </Label>
          <Input
            id="org-name"
            value={data.organization}
            onChange={e => onChange({ organization: e.target.value })}
            placeholder={t('setup.organizationPlaceholder')}
          />
        </div>

        {/* Primary Language */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            {t('setup.primaryLanguage')}
          </Label>
          <Select value={data.language} onValueChange={v => onChange({ language: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(lang => (
                <SelectItem key={lang.code} value={lang.code}>
                  <span className="font-medium">{lang.flag}</span> {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t('setup.primaryLanguageHelp')}</p>
        </div>
      </div>
    </div>
  )
}
