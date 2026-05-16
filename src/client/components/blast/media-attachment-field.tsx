import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface MediaAttachmentFieldProps {
  value: string
  onChange: (value: string) => void
}

function isValidMediaUrl(url: string): boolean {
  if (!url) return true
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function MediaAttachmentField({ value, onChange }: MediaAttachmentFieldProps) {
  const { t } = useTranslation()
  const isInvalid = value.length > 0 && !isValidMediaUrl(value)

  return (
    <div className="space-y-2">
      <Label htmlFor="blast-media-url">{t('blasts.mediaUrl')}</Label>
      <div className="flex gap-2">
        <Input
          id="blast-media-url"
          data-testid="blast-media-url"
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('blasts.mediaUrlPlaceholder')}
          className={isInvalid ? 'border-destructive' : ''}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange('')}
            aria-label={t('blasts.mediaUrlRemove')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isInvalid ? (
        <p className="text-xs text-destructive">{t('blasts.mediaUrlInvalid')}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t('blasts.mediaUrlHelp')}</p>
      )}
    </div>
  )
}
