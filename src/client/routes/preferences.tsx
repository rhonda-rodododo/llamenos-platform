import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Bell } from 'lucide-react'

export const Route = createFileRoute('/preferences')({
  component: PreferencesPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || '',
  }),
})

interface SubscriberPrefs {
  channels: Array<{ type: string; verified: boolean }>
  language: string
  status: string
}

function PreferencesPage() {
  const { t } = useTranslation()
  const search = Route.useSearch()
  const [subscriber, setSubscriber] = useState<SubscriberPrefs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!search.token) {
      setError(t('preferences.invalidToken'))
      setLoading(false)
      return
    }
    fetch(`/api/messaging/preferences?token=${encodeURIComponent(search.token)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setSubscriber(data as SubscriberPrefs))
      .catch(() => setError(t('preferences.invalidToken')))
      .finally(() => setLoading(false))
  }, [search.token, t])

  async function handleUpdate(updates: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/messaging/preferences?token=${encodeURIComponent(search.token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const updated = await res.json() as SubscriberPrefs
        setSubscriber(updated)
      }
    } catch {
      // silently fail — subscriber preferences are best-effort
    }
  }

  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">{t('common.loading')}</div>
  if (error) return <div role="alert" className="flex h-screen items-center justify-center text-destructive">{error}</div>
  if (!subscriber) return null

  return (
    <div className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t('preferences.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {subscriber.channels.map(ch => (
              <div key={ch.type} className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label>{ch.type.toUpperCase()}</Label>
                <Switch
                  checked={ch.verified}
                  onCheckedChange={(checked) => handleUpdate({ channel: ch.type, enabled: checked })}
                />
              </div>
            ))}
          </div>

          <div className="pt-4 border-t">
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => handleUpdate({ status: 'unsubscribed' })}
            >
              {t('preferences.unsubscribe')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
