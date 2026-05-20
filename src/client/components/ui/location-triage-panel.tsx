import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LocationField } from '@/components/ui/location-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LocationFieldValue } from '@/components/ui/location-field'

const LOCATION_HINT_PATTERNS = [
  /corner of ([\w\s]+?) and ([\w\s]+)/i,
  /([\w\s]+?) (?:&|and) ([\w\s]+?) (?:St|Ave|Blvd|Rd|Dr|Ln|Way|Ct|Pl)/i,
  /\d{1,5}\s+[\w\s]+ (?:St|Ave|Blvd|Rd|Drive|Lane|Way|Court|Place|Boulevard)/i,
]

export function extractLocationHint(text: string): string | null {
  for (const pattern of LOCATION_HINT_PATTERNS) {
    const match = text.match(pattern)
    if (match) return match[0]
  }
  return null
}

interface LocationTriagePanelProps {
  messageText: string
  onConfirm: (value: LocationFieldValue) => void
  onCancel: () => void
}

export function LocationTriagePanel({ messageText, onConfirm, onCancel }: LocationTriagePanelProps) {
  const { t } = useTranslation()
  const hint = extractLocationHint(messageText)
  const [location, setLocation] = useState<LocationFieldValue | null>(
    hint ? { address: hint } : null,
  )

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-sm">{t('location.addLocation')}</CardTitle>
        {hint && (
          <p className="text-xs text-muted-foreground">
            {t('location.detected')} <span className="font-medium">{hint}</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <LocationField
          value={location}
          onChange={setLocation}
          placeholder={hint ?? t('location.searchPlaceholder')}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button size="sm" disabled={!location} onClick={() => location && onConfirm(location)}>
            {t('location.confirmLocation')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
