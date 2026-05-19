import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import {
  listFirehoseConnections,
  createFirehoseConnection,
  updateFirehoseConnection,
  deleteFirehoseConnection,
  activateFirehoseConnection,
  pauseFirehoseConnection,
  getFirehoseStatus,
  getFirehoseBuffer,
  purgeFirehoseBuffer,
  type FirehoseConnection,
  type FirehoseConnectionHealth,
} from '@/lib/api'
import { Plus, RefreshCw, Wifi, Pause, Play, Trash2, Settings2, Activity, Database } from 'lucide-react'

export const Route = createFileRoute('/admin/firehose')({
  component: FirehosePage,
})

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  pending: 'bg-yellow-500',
  paused: 'bg-orange-500',
  disabled: 'bg-red-500',
}

export function FirehosePage() {
  const { t } = useTranslation()
  const { isAdmin } = useAuth()
  const { toast } = useToast()
  const [connections, setConnections] = useState<FirehoseConnection[]>([])
  const [healthMap, setHealthMap] = useState<Record<string, FirehoseConnectionHealth>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [bufferInfo, setBufferInfo] = useState<Record<string, { bufferSize: number; agentRunning: boolean }>>({})

  const loadData = useCallback(async () => {
    try {
      const [connResult, statusResult] = await Promise.all([
        listFirehoseConnections(),
        getFirehoseStatus(),
      ])
      setConnections(connResult.connections)
      const map: Record<string, FirehoseConnectionHealth> = {}
      for (const s of statusResult.statuses) {
        map[s.id] = s
      }
      setHealthMap(map)
    } catch (_err) {
      toast(t('admin.firehose.loadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadData() }, [loadData])

  if (!isAdmin) {
    return <div className="p-6 text-muted-foreground">{t('admin.firehose.accessDenied')}</div>
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">{t('admin.firehose.loading')}</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            {t('admin.firehose.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('admin.firehose.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-background hover:bg-accent"
            data-testid="refresh-firehose"
          >
            <RefreshCw className="h-4 w-4" />
            {t('actionRefresh')}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="create-firehose-connection"
          >
            <Plus className="h-4 w-4" />
            {t('admin.firehose.newConnection')}
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateConnectionForm
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadData() }}
        />
      )}

      {connections.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Wifi className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{t('admin.firehose.noConnections')}</p>
          <p className="text-sm mt-1">{t('admin.firehose.noConnectionsHint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              health={healthMap[conn.id]}
              buffer={bufferInfo[conn.id]}
              isEditing={editingId === conn.id}
              onEdit={() => setEditingId(editingId === conn.id ? null : conn.id)}
              onRefresh={loadData}
              onLoadBuffer={async () => {
                try {
                  const buf = await getFirehoseBuffer(conn.id)
                  setBufferInfo((prev) => ({ ...prev, [conn.id]: buf }))
                } catch {}
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Create Connection Form ---

function CreateConnectionForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [displayName, setDisplayName] = useState('')
  const [reportTypeId, setReportTypeId] = useState('')
  const [inferenceEndpoint, setInferenceEndpoint] = useState('')
  const [geoContext, setGeoContext] = useState('')
  const [extractionIntervalSec, setExtractionIntervalSec] = useState(60)
  const [bufferTtlDays, setBufferTtlDays] = useState(7)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportTypeId.trim()) {
      toast(t('admin.firehose.reportTypeIdRequired'), 'error')
      return
    }
    setSaving(true)
    try {
      await createFirehoseConnection({
        displayName: displayName.trim() || undefined,
        reportTypeId: reportTypeId.trim(),
        inferenceEndpoint: inferenceEndpoint.trim() || undefined,
        geoContext: geoContext.trim() || undefined,
        extractionIntervalSec,
        bufferTtlDays,
      })
      toast(t('admin.firehose.created'))
      onCreated()
    } catch (_err) {
      toast(t('admin.firehose.createError'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-4 bg-card" data-testid="create-connection-form">
      <h3 className="font-semibold">{t('admin.firehose.newConnection')}</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('admin.firehose.displayName')}</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('admin.firehose.displayNamePlaceholder')}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            data-testid="firehose-display-name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('admin.firehose.reportTypeId')} *</label>
          <input
            type="text"
            value={reportTypeId}
            onChange={(e) => setReportTypeId(e.target.value)}
            placeholder="e.g., incident-report"
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            data-testid="firehose-report-type-id"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('admin.firehose.inferenceEndpoint')}</label>
          <input
            type="url"
            value={inferenceEndpoint}
            onChange={(e) => setInferenceEndpoint(e.target.value)}
            placeholder={t('admin.firehose.inferenceEndpointPlaceholder')}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            data-testid="firehose-inference-endpoint"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('admin.firehose.geoContext')}</label>
          <input
            type="text"
            value={geoContext}
            onChange={(e) => setGeoContext(e.target.value)}
            placeholder={t('admin.firehose.geoContextPlaceholder')}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            data-testid="firehose-geo-context"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('admin.firehose.extractionInterval')}</label>
          <input
            type="number"
            value={extractionIntervalSec}
            onChange={(e) => setExtractionIntervalSec(Number(e.target.value))}
            min={30}
            max={300}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            data-testid="firehose-interval"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('admin.firehose.bufferTtl')}</label>
          <input
            type="number"
            value={bufferTtlDays}
            onChange={(e) => setBufferTtlDays(Number(e.target.value))}
            min={1}
            max={30}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            data-testid="firehose-ttl"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-md border hover:bg-accent"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          data-testid="save-firehose-connection"
        >
          {saving ? t('admin.firehose.creating') : t('common.create')}
        </button>
      </div>
    </form>
  )
}

// --- Connection Card ---

function ConnectionCard({
  connection: conn,
  health,
  buffer,
  isEditing,
  onEdit,
  onRefresh,
  onLoadBuffer,
}: {
  connection: FirehoseConnection
  health?: FirehoseConnectionHealth
  buffer?: { bufferSize: number; agentRunning: boolean }
  isEditing: boolean
  onEdit: () => void
  onRefresh: () => void
  onLoadBuffer: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [acting, setActing] = useState(false)

  const handleActivate = async () => {
    setActing(true)
    try {
      await activateFirehoseConnection(conn.id)
      toast(t('admin.firehose.activated'))
      onRefresh()
    } catch { toast(t('admin.firehose.activateError'), 'error') }
    finally { setActing(false) }
  }

  const handlePause = async () => {
    setActing(true)
    try {
      await pauseFirehoseConnection(conn.id)
      toast(t('admin.firehose.paused'))
      onRefresh()
    } catch { toast(t('admin.firehose.pauseError'), 'error') }
    finally { setActing(false) }
  }

  const handleDelete = async () => {
    if (!confirm(t('admin.firehose.deleteConfirm'))) return
    setActing(true)
    try {
      await deleteFirehoseConnection(conn.id)
      toast(t('admin.firehose.deleted'))
      onRefresh()
    } catch { toast(t('admin.firehose.deleteError'), 'error') }
    finally { setActing(false) }
  }

  const handlePurge = async () => {
    if (!confirm(t('admin.firehose.purgeConfirm'))) return
    try {
      const { purged } = await purgeFirehoseBuffer(conn.id)
      toast(t('admin.firehose.purged', { count: purged }))
      onLoadBuffer()
    } catch { toast(t('admin.firehose.purgeError', { defaultValue: 'Failed to purge' }), 'error') }
  }

  return (
    <div className="border rounded-lg p-4 bg-card" data-testid={`firehose-connection-${conn.id.slice(0, 8)}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[conn.status] ?? 'bg-gray-400'}`} />
          <div>
            <h3 className="font-semibold">{conn.displayName || conn.id.slice(0, 8)}</h3>
            <p className="text-sm text-muted-foreground">
              {conn.status} | Interval: {conn.extractionIntervalSec}s | TTL: {conn.bufferTtlDays}d
            </p>
            {conn.geoContext && (
              <p className="text-xs text-muted-foreground mt-0.5">{conn.geoContext}</p>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          {conn.status !== 'active' && (
            <button
              onClick={handleActivate}
              disabled={acting}
              className="p-2 rounded hover:bg-accent"
              title={t('admin.firehose.activate')}
              data-testid="activate-connection"
            >
              <Play className="h-4 w-4 text-green-500" />
            </button>
          )}
          {conn.status === 'active' && (
            <button
              onClick={handlePause}
              disabled={acting}
              className="p-2 rounded hover:bg-accent"
              title={t('admin.firehose.pause')}
              data-testid="pause-connection"
            >
              <Pause className="h-4 w-4 text-orange-500" />
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-2 rounded hover:bg-accent"
            title={t('common.settings')}
            data-testid="edit-connection"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            onClick={onLoadBuffer}
            className="p-2 rounded hover:bg-accent"
            title={t('admin.firehose.bufferInfo')}
            data-testid="view-buffer"
          >
            <Database className="h-4 w-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={acting}
            className="p-2 rounded hover:bg-accent"
            title={t('common.delete')}
            data-testid="delete-connection"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </button>
        </div>
      </div>

      {/* Health metrics */}
      {health && (
        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t('admin.firehose.bufferLabel')} </span>
            <span className="font-mono">{health.bufferSize}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('admin.firehose.extractedLabel')} </span>
            <span className="font-mono">{health.extractionCount}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('admin.firehose.inferenceLabel')} </span>
            <span className="font-mono">
              {health.inferenceHealthMs != null ? `${health.inferenceHealthMs}ms` : 'N/A'}
            </span>
          </div>
        </div>
      )}

      {/* Buffer info */}
      {buffer && (
        <div className="mt-3 flex items-center gap-4 text-sm border-t pt-3">
          <span>
            <Database className="h-3 w-3 inline mr-1" />
            {t('admin.firehose.bufferedMessages', { count: buffer.bufferSize })}
          </span>
          <span>
            {t('admin.firehose.agentLabel')} {buffer.agentRunning ? (
              <span className="text-green-500">{t('admin.firehose.agentRunning')}</span>
            ) : (
              <span className="text-muted-foreground">{t('admin.firehose.agentStopped')}</span>
            )}
          </span>
          <button
            onClick={handlePurge}
            className="text-xs px-2 py-1 rounded border hover:bg-accent"
            data-testid="purge-buffer"
          >
            {t('admin.firehose.purgeExpired')}
          </button>
        </div>
      )}

      {/* Inline edit form */}
      {isEditing && (
        <EditConnectionForm connection={conn} onSaved={onRefresh} onClose={onEdit} />
      )}
    </div>
  )
}

// --- Edit Connection Form ---

function EditConnectionForm({
  connection: conn,
  onSaved,
  onClose,
}: {
  connection: FirehoseConnection
  onSaved: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [displayName, setDisplayName] = useState(conn.displayName)
  const [inferenceEndpoint, setInferenceEndpoint] = useState(conn.inferenceEndpoint ?? '')
  const [geoContext, setGeoContext] = useState(conn.geoContext ?? '')
  const [systemPromptSuffix, setSystemPromptSuffix] = useState(conn.systemPromptSuffix ?? '')
  const [extractionIntervalSec, setExtractionIntervalSec] = useState(conn.extractionIntervalSec)
  const [bufferTtlDays, setBufferTtlDays] = useState(conn.bufferTtlDays)
  const [notifyViaSignal, setNotifyViaSignal] = useState(conn.notifyViaSignal)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateFirehoseConnection(conn.id, {
        displayName,
        inferenceEndpoint: inferenceEndpoint.trim() || null,
        geoContext: geoContext.trim() || null,
        systemPromptSuffix: systemPromptSuffix.trim() || null,
        extractionIntervalSec,
        bufferTtlDays,
        notifyViaSignal,
      })
      toast(t('admin.firehose.updated'))
      onSaved()
      onClose()
    } catch {
      toast(t('admin.firehose.updateError'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t pt-4 space-y-3" data-testid="edit-connection-form">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">{t('admin.firehose.displayName')}</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">{t('admin.firehose.inferenceEndpoint')}</label>
          <input
            type="url"
            value={inferenceEndpoint}
            onChange={(e) => setInferenceEndpoint(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">{t('admin.firehose.geoContext')}</label>
          <input
            type="text"
            value={geoContext}
            onChange={(e) => setGeoContext(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">{t('admin.firehose.systemPromptSuffix')}</label>
          <input
            type="text"
            value={systemPromptSuffix}
            onChange={(e) => setSystemPromptSuffix(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">{t('admin.firehose.interval')}</label>
          <input
            type="number"
            value={extractionIntervalSec}
            onChange={(e) => setExtractionIntervalSec(Number(e.target.value))}
            min={30}
            max={300}
            className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">{t('admin.firehose.bufferTtl')}</label>
          <input
            type="number"
            value={bufferTtlDays}
            onChange={(e) => setBufferTtlDays(Number(e.target.value))}
            min={1}
            max={30}
            className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="notifySignal"
          checked={notifyViaSignal}
          onChange={(e) => setNotifyViaSignal(e.target.checked)}
        />
        <label htmlFor="notifySignal" className="text-sm">{t('admin.firehose.notifyViaSignal')}</label>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{t('admin.firehose.idLabel')} {conn.id}</span>
        <span>|</span>
        <span>{t('admin.firehose.agentLabel')} {conn.agentPubkey.slice(0, 8)}...</span>
        <span>|</span>
        <span>{t('admin.firehose.reportTypeLabel')} {conn.reportTypeId}</span>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-3 py-1.5 rounded-md border text-sm hover:bg-accent">
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          data-testid="save-edit-connection"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}
