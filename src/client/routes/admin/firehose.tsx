import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
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
import { Plus, RefreshCw, Wifi, WifiOff, Pause, Play, Trash2, Settings2, Activity, Database } from 'lucide-react'

export const Route = createFileRoute('/admin/firehose')({
  component: FirehosePage,
})

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500',
  pending: 'bg-yellow-500',
  paused: 'bg-orange-500',
  disabled: 'bg-red-500',
}

function FirehosePage() {
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
    } catch (err) {
      toast('Failed to load firehose connections', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadData() }, [loadData])

  if (!isAdmin) {
    return <div className="p-6 text-muted-foreground">Access denied</div>
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading firehose connections...</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Firehose Connections
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage Signal group integrations for AI-powered report extraction
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-background hover:bg-accent"
            data-testid="refresh-firehose"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="create-firehose-connection"
          >
            <Plus className="h-4 w-4" />
            New Connection
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
          <p>No firehose connections configured</p>
          <p className="text-sm mt-1">Create a connection to start extracting reports from Signal groups</p>
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
      toast('Report type ID is required', 'error')
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
      toast('Connection created')
      onCreated()
    } catch (err) {
      toast('Failed to create connection', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-4 bg-card" data-testid="create-connection-form">
      <h3 className="font-semibold">New Firehose Connection</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., Portland Legal Observers"
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            data-testid="firehose-display-name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Report Type ID *</label>
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
          <label className="block text-sm font-medium mb-1">Inference Endpoint</label>
          <input
            type="url"
            value={inferenceEndpoint}
            onChange={(e) => setInferenceEndpoint(e.target.value)}
            placeholder="http://localhost:8000/v1"
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            data-testid="firehose-inference-endpoint"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Geo Context</label>
          <input
            type="text"
            value={geoContext}
            onChange={(e) => setGeoContext(e.target.value)}
            placeholder="e.g., Portland, Oregon, USA"
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
            data-testid="firehose-geo-context"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Extraction Interval (sec)</label>
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
          <label className="block text-sm font-medium mb-1">Buffer TTL (days)</label>
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
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          data-testid="save-firehose-connection"
        >
          {saving ? 'Creating...' : 'Create'}
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
  const { toast } = useToast()
  const [acting, setActing] = useState(false)

  const handleActivate = async () => {
    setActing(true)
    try {
      await activateFirehoseConnection(conn.id)
      toast('Connection activated')
      onRefresh()
    } catch { toast('Failed to activate', 'error') }
    finally { setActing(false) }
  }

  const handlePause = async () => {
    setActing(true)
    try {
      await pauseFirehoseConnection(conn.id)
      toast('Connection paused')
      onRefresh()
    } catch { toast('Failed to pause', 'error') }
    finally { setActing(false) }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this firehose connection? All buffered messages will be lost.')) return
    setActing(true)
    try {
      await deleteFirehoseConnection(conn.id)
      toast('Connection deleted')
      onRefresh()
    } catch { toast('Failed to delete', 'error') }
    finally { setActing(false) }
  }

  const handlePurge = async () => {
    if (!confirm('Purge expired buffer messages?')) return
    try {
      const { purged } = await purgeFirehoseBuffer(conn.id)
      toast(`Purged ${purged} expired messages`)
      onLoadBuffer()
    } catch { toast('Failed to purge', 'error') }
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
              title="Activate"
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
              title="Pause"
              data-testid="pause-connection"
            >
              <Pause className="h-4 w-4 text-orange-500" />
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-2 rounded hover:bg-accent"
            title="Settings"
            data-testid="edit-connection"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            onClick={onLoadBuffer}
            className="p-2 rounded hover:bg-accent"
            title="Buffer info"
            data-testid="view-buffer"
          >
            <Database className="h-4 w-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={acting}
            className="p-2 rounded hover:bg-accent"
            title="Delete"
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
            <span className="text-muted-foreground">Buffer: </span>
            <span className="font-mono">{health.bufferSize}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Extracted: </span>
            <span className="font-mono">{health.extractionCount}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Inference: </span>
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
            {buffer.bufferSize} buffered messages
          </span>
          <span>
            Agent: {buffer.agentRunning ? (
              <span className="text-green-500">Running</span>
            ) : (
              <span className="text-muted-foreground">Stopped</span>
            )}
          </span>
          <button
            onClick={handlePurge}
            className="text-xs px-2 py-1 rounded border hover:bg-accent"
            data-testid="purge-buffer"
          >
            Purge Expired
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
      toast('Connection updated')
      onSaved()
      onClose()
    } catch {
      toast('Failed to update', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t pt-4 space-y-3" data-testid="edit-connection-form">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Inference Endpoint</label>
          <input
            type="url"
            value={inferenceEndpoint}
            onChange={(e) => setInferenceEndpoint(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Geo Context</label>
          <input
            type="text"
            value={geoContext}
            onChange={(e) => setGeoContext(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">System Prompt Suffix</label>
          <input
            type="text"
            value={systemPromptSuffix}
            onChange={(e) => setSystemPromptSuffix(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5 text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Interval (sec)</label>
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
          <label className="block text-xs font-medium mb-1">Buffer TTL (days)</label>
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
        <label htmlFor="notifySignal" className="text-sm">Notify via Signal on report extraction</label>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>ID: {conn.id}</span>
        <span>|</span>
        <span>Agent: {conn.agentPubkey.slice(0, 8)}...</span>
        <span>|</span>
        <span>Report Type: {conn.reportTypeId}</span>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-3 py-1.5 rounded-md border text-sm hover:bg-accent">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
          data-testid="save-edit-connection"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
