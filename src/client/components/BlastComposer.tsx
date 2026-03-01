import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createBlast } from '@/lib/api'
import type { Blast } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'

interface BlastComposerProps {
  onCreated: (blast: Blast) => void
  onCancel: () => void
}

export function BlastComposer({ onCreated, onCancel }: BlastComposerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [channels, setChannels] = useState<string[]>(['sms'])
  const [saving, setSaving] = useState(false)

  const channelOptions = [
    { value: 'sms', label: 'SMS' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'signal', label: 'Signal' },
    { value: 'rcs', label: 'RCS' },
  ]

  async function handleSave() {
    if (!name.trim() || !text.trim()) {
      toast(t('blasts.fillRequired'), 'error')
      return
    }
    setSaving(true)
    try {
      const res = await createBlast({
        name: name.trim(),
        content: { text: text.trim() },
        targetChannels: channels,
      })
      onCreated(res.blast)
      toast(t('common.success'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('blasts.newBlast')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="blast-name">{t('blasts.blastName')}</Label>
          <Input
            id="blast-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('blasts.blastNamePlaceholder')}
            data-testid="blast-name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="blast-text">{t('blasts.messageText')}</Label>
          <textarea
            id="blast-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('blasts.messageTextPlaceholder')}
            className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="blast-text"
          />
          <p className="text-xs text-muted-foreground">{text.length} {t('blasts.characters')}</p>
        </div>

        <div className="space-y-2">
          <Label>{t('blasts.channels')}</Label>
          <div className="flex flex-wrap gap-2">
            {channelOptions.map(ch => (
              <button
                key={ch.value}
                onClick={() => setChannels(prev =>
                  prev.includes(ch.value)
                    ? prev.filter(c => c !== ch.value)
                    : [...prev, ch.value]
                )}
                className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  channels.includes(ch.value)
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving || !name.trim() || !text.trim()}>
            <Save className="h-4 w-4" />
            {saving ? t('common.loading') : t('blasts.saveDraft')}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
