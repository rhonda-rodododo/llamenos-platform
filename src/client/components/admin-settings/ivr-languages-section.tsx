import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { updateIvrLanguages } from '@/lib/api'
import { SettingsSection } from '@/components/settings-section'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Phone, ArrowUp, ArrowDown } from 'lucide-react'
import { LANGUAGES, LANGUAGE_MAP, ivrIndexToDigit } from '@shared/languages'

interface Props {
  enabled: string[]
  onChange: (enabled: string[]) => void
  expanded: boolean
  onToggle: (open: boolean) => void
  statusSummary?: string
  hubId?: string
}

/** Compute digit label for an enabled language at a given position */
function digitLabel(index: number, total: number): string {
  if (total <= 9) return ivrIndexToDigit(index)
  // >9: first 8 get 1-8, position 8 = "9 (more)", rest are sub-menu
  if (index < 8) return String(index + 1)
  if (index === 8) return '9+'
  return `→${index - 7}`
}

export function IvrLanguagesSection({ enabled, onChange, expanded, onToggle, statusSummary, hubId }: Props) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const moveUp = async (code: string) => {
    const idx = enabled.indexOf(code)
    if (idx <= 0) return
    const next = [...enabled]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    await save(next)
  }

  const moveDown = async (code: string) => {
    const idx = enabled.indexOf(code)
    if (idx < 0 || idx >= enabled.length - 1) return
    const next = [...enabled]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    await save(next)
  }

  const toggle = async (code: string, checked: boolean) => {
    const next = checked
      ? [...enabled, code]
      : enabled.filter(c => c !== code)
    await save(next)
  }

  const save = async (next: string[]) => {
    try {
      const res = await updateIvrLanguages({ enabledLanguages: next }, hubId)
      onChange(res.enabledLanguages)
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  return (
    <SettingsSection
      id="ivr-languages"
      title={t('ivr.title')}
      description={t('ivr.description')}
      icon={<Phone className="h-5 w-5 text-muted-foreground" />}
      expanded={expanded}
      onToggle={onToggle}
      basePath="/admin/settings"
      statusSummary={statusSummary}
    >
      {/* Enabled languages — ordered, with reordering controls */}
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-foreground mb-2">
          {t('ivr.enabledLanguages', { defaultValue: 'Enabled languages (ordered)' })}
        </h4>
        {enabled.map((code, index) => {
          const lang = LANGUAGE_MAP[code]
          if (!lang) return null
          const isLastEnabled = enabled.length === 1
          const isSubMenu = enabled.length > 9 && index >= 8
          return (
            <div
              key={code}
              className={`flex items-center justify-between rounded-lg border px-4 py-2 ${isSubMenu ? 'border-dashed border-muted-foreground/40' : 'border-border'}`}
            >
              <div className="flex items-center gap-2">
                <Badge variant={isSubMenu ? 'secondary' : 'outline'} className="text-xs font-mono w-8 justify-center">
                  {digitLabel(index, enabled.length)}
                </Badge>
                <span className="text-sm">{lang.label}</span>
                {isSubMenu && index === 8 && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({t('ivr.subMenu', { defaultValue: 'sub-menu' })})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="p-1 rounded hover:bg-muted disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => moveUp(code)}
                  aria-label={`Move ${lang.label} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-muted disabled:opacity-30"
                  disabled={index === enabled.length - 1}
                  onClick={() => moveDown(code)}
                  aria-label={`Move ${lang.label} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <Switch
                  checked={true}
                  disabled={isLastEnabled}
                  onCheckedChange={() => toggle(code, false)}
                />
              </div>
            </div>
          )
        })}
      </div>

      {enabled.length > 9 && (
        <p className="text-xs text-muted-foreground mt-1">
          {t('ivr.subMenuNote', { defaultValue: 'Languages after position 8 are in a sub-menu (caller presses 9 for more).' })}
        </p>
      )}

      {/* Available languages — not yet enabled */}
      {(() => {
        const available = LANGUAGES.filter(l => !enabled.includes(l.code))
        if (available.length === 0) return null
        return (
          <div className="mt-4 space-y-1">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              {t('ivr.availableLanguages', { defaultValue: 'Available languages' })}
            </h4>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {available.map(lang => (
                <div key={lang.code} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-2">
                  <span className="text-sm text-muted-foreground">{lang.label}</span>
                  <Switch
                    checked={false}
                    onCheckedChange={() => toggle(lang.code, true)}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {enabled.length === 1 && (
        <p className="text-xs text-muted-foreground">{t('ivr.atLeastOne')}</p>
      )}
    </SettingsSection>
  )
}
