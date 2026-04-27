import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useState, useEffect, useCallback, useRef } from 'react'
import { listBlasts, deleteBlast, sendBlast, cancelBlast, getBlastStats, getBlastDeliveries } from '@/lib/api'
import type { Blast, BlastStats, BlastDelivery, BlastDeliveryStatus } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { Megaphone, Plus, Send, XCircle, Trash2, Users, Settings2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BlastComposer } from '@/components/BlastComposer'
import { SubscriberManager } from '@/components/SubscriberManager'
import { BlastSettingsPanel } from '@/components/BlastSettingsPanel'

export const Route = createFileRoute('/blasts')({
  component: BlastsPage,
})

function BlastsPage() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const { toast } = useToast()
  const [blasts, setBlasts] = useState<Blast[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBlast, setSelectedBlast] = useState<Blast | null>(null)
  const [showComposer, setShowComposer] = useState(false)
  const [showSubscribers, setShowSubscribers] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    loadBlasts()
  }, [])

  async function loadBlasts() {
    try {
      const res = await listBlasts()
      setBlasts(res.blasts)
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteBlast(id)
      setBlasts(prev => prev.filter(b => b.id !== id))
      if (selectedBlast?.id === id) setSelectedBlast(null)
      toast(t('common.success'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  async function handleSend(id: string) {
    try {
      const res = await sendBlast(id)
      setBlasts(prev => prev.map(b => b.id === id ? res.blast : b))
      setSelectedBlast(res.blast)
      toast(t('blasts.sent'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  async function handleCancel(id: string) {
    try {
      const res = await cancelBlast(id)
      setBlasts(prev => prev.map(b => b.id === id ? res.blast : b))
      setSelectedBlast(res.blast)
      toast(t('common.success'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    }
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    sending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    sent: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  }

  if (showSubscribers) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setShowSubscribers(false)}>
            {t('common.back')}
          </Button>
          <h1 className="text-xl font-bold">{t('blasts.subscribers')}</h1>
        </div>
        <SubscriberManager />
      </div>
    )
  }

  if (showSettings) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setShowSettings(false)}>
            {t('common.back')}
          </Button>
          <h1 className="text-xl font-bold">{t('blasts.settings')}</h1>
        </div>
        <BlastSettingsPanel />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">{t('blasts.title')}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSubscribers(true)}>
            <Users className="h-4 w-4" />
            {t('blasts.subscribers')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
            <Settings2 className="h-4 w-4" />
            {t('common.settings')}
          </Button>
          {hasPermission('blasts:send') && (
            <Button data-testid="blast-new-btn" onClick={() => { setShowComposer(true); setSelectedBlast(null) }}>
              <Plus className="h-4 w-4" />
              {t('blasts.newBlast')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Blast list */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('blasts.allBlasts')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 text-center text-muted-foreground">{t('common.loading')}</div>
              ) : blasts.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground" data-testid="no-blasts">{t('blasts.noBlasts')}</div>
              ) : (
                <div data-testid="blast-list" className="divide-y divide-border">
                  {blasts.map(blast => (
                    <button
                      key={blast.id}
                      data-testid="blast-card"
                      onClick={() => { setSelectedBlast(blast); setShowComposer(false) }}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-accent ${
                        selectedBlast?.id === blast.id ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium truncate">{blast.name}</p>
                        <Badge className={statusColors[blast.status] || ''} variant="outline">
                          {t(`blasts.status.${blast.status}`)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground truncate">
                        {blast.content.text.slice(0, 60)}{blast.content.text.length > 60 ? '...' : ''}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{blast.stats.totalRecipients} {t('blasts.recipients')}</span>
                        {blast.stats.sent > 0 && <span>{blast.stats.sent} {t('blasts.sentCount')}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail / Composer */}
        <div className="lg:col-span-2">
          {showComposer ? (
            <BlastComposer
              onCreated={(blast) => {
                setBlasts(prev => [blast, ...prev])
                setShowComposer(false)
                setSelectedBlast(blast)
              }}
              onCancel={() => setShowComposer(false)}
            />
          ) : selectedBlast ? (
            <BlastDetailPanel
              blast={selectedBlast}
              statusColors={statusColors}
              onSend={handleSend}
              onCancel={handleCancel}
              onDelete={handleDelete}
              onBlastUpdated={(updated) => {
                setBlasts(prev => prev.map(b => b.id === updated.id ? updated : b))
                setSelectedBlast(updated)
              }}
            />
          ) : (
            <Card>
              <CardContent className="flex h-48 items-center justify-center text-muted-foreground">
                {t('blasts.selectOrCreate')}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Blast Detail Panel with live progress tracking ---

interface BlastDetailPanelProps {
  blast: Blast
  statusColors: Record<string, string>
  onSend: (id: string) => Promise<void>
  onCancel: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onBlastUpdated: (blast: Blast) => void
}

function BlastDetailPanel({ blast, statusColors, onSend, onCancel, onDelete, onBlastUpdated }: BlastDetailPanelProps) {
  const { t } = useTranslation()
  const [liveStats, setLiveStats] = useState<BlastStats | null>(null)
  const [deliveries, setDeliveries] = useState<BlastDelivery[]>([])
  const [showDeliveries, setShowDeliveries] = useState(false)
  const [deliveryFilter, setDeliveryFilter] = useState<BlastDeliveryStatus | undefined>(undefined)
  const [deliveryTotal, setDeliveryTotal] = useState(0)
  const [deliveryPage, setDeliveryPage] = useState(1)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isSending = blast.status === 'sending'

  // Live stats polling when blast is sending
  useEffect(() => {
    if (!isSending) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    const pollStats = async () => {
      try {
        const stats = await getBlastStats(blast.id)
        setLiveStats(stats)
      } catch { /* ignore */ }
    }

    pollStats()
    pollRef.current = setInterval(pollStats, 5_000)

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [blast.id, isSending])

  // Load deliveries when toggled
  useEffect(() => {
    if (!showDeliveries) return

    const loadDeliveries = async () => {
      try {
        const res = await getBlastDeliveries(blast.id, {
          status: deliveryFilter,
          page: deliveryPage,
          limit: 20,
        })
        setDeliveries(res.deliveries)
        setDeliveryTotal(res.total)
      } catch { /* ignore */ }
    }
    loadDeliveries()
  }, [blast.id, showDeliveries, deliveryFilter, deliveryPage])

  const stats = liveStats ?? blast.stats
  const totalProcessed = stats.sent + stats.delivered + stats.failed + stats.optedOut
  const progressPercent = stats.totalRecipients > 0
    ? Math.round((totalProcessed / stats.totalRecipients) * 100)
    : 0

  const deliveryStatusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    delivered: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    opted_out: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    skipped: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{blast.name}</CardTitle>
          <Badge className={statusColors[blast.status] || ''} variant="outline">
            {t(`blasts.status.${blast.status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm whitespace-pre-wrap">{blast.content.text}</p>
        </div>

        {/* Progress bar (visible during sending and after) */}
        {(isSending || blast.status === 'sent') && stats.totalRecipients > 0 && (
          <div data-testid="blast-progress" className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {isSending ? t('blasts.sendingProgress') : t('blasts.deliveryComplete')}
              </span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-secondary">
              <div
                className="h-2 rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {isSending && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                {t('blasts.liveUpdating')}
              </p>
            )}
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
          <div>
            <p className="text-muted-foreground">{t('blasts.recipients')}</p>
            <p className="font-medium">{stats.totalRecipients}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('blasts.sentCount')}</p>
            <p className="font-medium">{stats.sent}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('blasts.delivered')}</p>
            <p className="font-medium text-green-600 dark:text-green-400">{stats.delivered}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('blasts.failed')}</p>
            <p className="font-medium text-destructive">{stats.failed}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('blasts.optedOut')}</p>
            <p className="font-medium text-orange-600 dark:text-orange-400">{stats.optedOut}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {blast.status === 'draft' && (
            <>
              <Button onClick={() => onSend(blast.id)}>
                <Send className="h-4 w-4" />
                {t('blasts.sendNow')}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => onDelete(blast.id)}>
                <Trash2 className="h-4 w-4" />
                {t('common.delete')}
              </Button>
            </>
          )}
          {blast.status === 'scheduled' && (
            <Button variant="outline" onClick={() => onCancel(blast.id)}>
              <XCircle className="h-4 w-4" />
              {t('blasts.cancelScheduled')}
            </Button>
          )}
          {blast.status === 'sending' && (
            <Button variant="outline" onClick={() => onCancel(blast.id)}>
              <XCircle className="h-4 w-4" />
              {t('blasts.cancelSending')}
            </Button>
          )}
        </div>

        {/* Delivery details toggle (only for blasts that have been sent/sending) */}
        {(blast.status === 'sending' || blast.status === 'sent' || blast.status === 'cancelled') && stats.totalRecipients > 0 && (
          <div className="border-t border-border pt-4">
            <button
              data-testid="toggle-deliveries"
              onClick={() => setShowDeliveries(!showDeliveries)}
              className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <span>{t('blasts.deliveryDetails')}</span>
              {showDeliveries ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showDeliveries && (
              <div className="mt-3 space-y-3">
                {/* Filter tabs */}
                <div className="flex flex-wrap gap-1">
                  {(['all', 'pending', 'sent', 'delivered', 'failed', 'opted_out'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setDeliveryFilter(status === 'all' ? undefined : status as BlastDeliveryStatus)
                        setDeliveryPage(1)
                      }}
                      className={`rounded px-2 py-1 text-xs transition-colors ${
                        (status === 'all' && !deliveryFilter) || deliveryFilter === status
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {status === 'all' ? t('common.all') : status.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                {/* Delivery list */}
                <div className="max-h-64 overflow-y-auto rounded border border-border divide-y divide-border">
                  {deliveries.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">{t('blasts.noDeliveries')}</p>
                  ) : deliveries.map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge className={deliveryStatusColors[d.status] || ''} variant="outline">
                          {d.status.replace('_', ' ')}
                        </Badge>
                        <span className="text-muted-foreground">{d.channel}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {d.attempts > 0 && <span>{d.attempts} attempts</span>}
                        {d.error && <span className="text-destructive truncate max-w-[200px]" title={d.error}>{d.error}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {deliveryTotal > 20 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {(deliveryPage - 1) * 20 + 1}-{Math.min(deliveryPage * 20, deliveryTotal)} of {deliveryTotal}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deliveryPage <= 1}
                        onClick={() => setDeliveryPage(p => p - 1)}
                      >
                        {t('common.previous')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deliveryPage * 20 >= deliveryTotal}
                        onClick={() => setDeliveryPage(p => p + 1)}
                      >
                        {t('common.next')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
