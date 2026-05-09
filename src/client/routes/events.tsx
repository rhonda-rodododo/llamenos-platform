import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  listRecords,
  updateRecord,
  listEntityTypes,
  listRecordContacts,
  getCaseManagementEnabled,
  type CaseRecord,
  type EntityTypeDefinition,
  type RecordContact,
} from '@/lib/api'
import { formatRelativeTime } from '@/lib/format'
import { StatusPill } from '@/components/cases/status-pill'
import { SchemaForm, type SchemaFieldValues } from '@/components/cases/schema-form'
import { CreateRecordDialog } from '@/components/cases/create-record-dialog'
import { CaseTimeline } from '@/components/cases/case-timeline'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Calendar, Plus, Loader2, Clock, ArrowLeft,
  Users, FileText, Link2, AlertTriangle,
  Search,
} from 'lucide-react'

export const Route = createFileRoute('/events')({
  component: EventsPage,
})

function EventsPage() {
  const { t } = useTranslation()
  const { hasNsec, publicKey, isAdmin, hasPermission } = useAuth()
  const { toast } = useToast()

  const [records, setRecords] = useState<CaseRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [entityTypes, setEntityTypes] = useState<EntityTypeDefinition[]>([])
  const [cmsEnabled, setCmsEnabled] = useState<boolean | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Event entity types only (category === 'event')
  const eventEntityTypes = useMemo(
    () => entityTypes.filter(et => et.category === 'event'),
    [entityTypes],
  )

  const eventEntityTypeIds = useMemo(
    () => new Set(eventEntityTypes.map(et => et.id)),
    [eventEntityTypes],
  )

  const entityTypeMap = useMemo(
    () => new Map(entityTypes.map(et => [et.id, et])),
    [entityTypes],
  )

  const selectedRecord = records.find(r => r.id === selectedId)
  const selectedEntityType = selectedRecord
    ? entityTypeMap.get(selectedRecord.entityTypeId)
    : undefined

  // Load entity types + CMS status
  useEffect(() => {
    getCaseManagementEnabled()
      .then(({ enabled }) => setCmsEnabled(enabled))
      .catch(() => setCmsEnabled(false))

    listEntityTypes()
      .then(({ entityTypes: types }) => setEntityTypes(types.filter(et => !et.isArchived)))
      .catch(() => {})
  }, [])

  // Fetch records filtered to event entity types
  const fetchRecords = useCallback(() => {
    if (eventEntityTypes.length === 0) {
      setLoading(false)
      return
    }
    setLoading(true)
    // Fetch records for each event entity type
    const firstEventType = eventEntityTypes[0]
    listRecords({ entityTypeId: firstEventType.id, limit: 50 })
      .then(({ records: recs, total: t }) => {
        setRecords(recs)
        setTotal(t)
      })
      .catch(() => toast(t('events.loadError', { defaultValue: 'Failed to load events' }), 'error'))
      .finally(() => setLoading(false))
  }, [eventEntityTypes, toast, t])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleRecordCreated = useCallback((recordId: string) => {
    fetchRecords()
    setSelectedId(recordId)
  }, [fetchRecords])

  const handleStatusChange = useCallback(async (recordId: string, newStatusValue: string) => {
    try {
      await updateRecord(recordId, { statusHash: newStatusValue })
      setRecords(prev =>
        prev.map(r => r.id === recordId ? { ...r, statusHash: newStatusValue, updatedAt: new Date().toISOString() } : r),
      )
      toast(t('events.statusUpdated', { defaultValue: 'Status updated' }), 'success')
    } catch {
      toast(t('events.statusError', { defaultValue: 'Failed to update status' }), 'error')
    }
  }, [toast, t])

  // CMS not enabled
  if (cmsEnabled === false) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-primary" />
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">
            {t('events.title', { defaultValue: 'Events' })}
          </h1>
        </div>
        <Card data-testid="cms-not-enabled">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {t('events.cmsDisabled', { defaultValue: 'Case management is not enabled.' })}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Loading
  if (cmsEnabled === null || loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-primary" />
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">
            {t('events.title', { defaultValue: 'Events' })}
          </h1>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  const showEmptyState = !loading && records.length === 0
  const defaultEventTypeId = eventEntityTypes.length > 0 ? eventEntityTypes[0].id : undefined

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-primary" />
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">
            {t('events.title', { defaultValue: 'Events' })}
          </h1>
          {total > 0 && (
            <Badge variant="secondary" className="text-xs">{total}</Badge>
          )}
        </div>
        <Button
          size="sm"
          data-testid="case-new-btn"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('events.newEvent', { defaultValue: 'New Event' })}
        </Button>
      </div>

      {showEmptyState ? (
        <Card data-testid="empty-state">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {t('events.noEvents', { defaultValue: 'No events yet' })}
            </p>
            <Button
              size="sm"
              className="mt-4"
              data-testid="case-empty-create-btn"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('events.newEvent', { defaultValue: 'New Event' })}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex h-[calc(100vh-12rem)] gap-4">
          {/* Left: event list */}
          <div
            data-testid="case-list"
            className="w-80 shrink-0 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-card p-2 md:block"
          >
            {records.map(record => {
              const et = entityTypeMap.get(record.entityTypeId)
              return (
                <EventCard
                  key={record.id}
                  record={record}
                  entityType={et}
                  isSelected={selectedId === record.id}
                  onSelect={setSelectedId}
                />
              )
            })}
          </div>

          {/* Right: detail panel */}
          <div
            data-testid="case-detail"
            className="flex flex-1 flex-col rounded-lg border border-border bg-card overflow-hidden"
          >
            {selectedRecord && selectedEntityType ? (
              <EventDetail
                record={selectedRecord}
                entityType={selectedEntityType}
                isAdmin={isAdmin}
                hasPermission={hasPermission}
                publicKey={publicKey}
                onStatusChange={handleStatusChange}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
                <Calendar className="h-10 w-10 mb-3" />
                <p>{t('events.selectEvent', { defaultValue: 'Select an event to view details' })}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <CreateRecordDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleRecordCreated}
        defaultEntityTypeId={defaultEventTypeId}
      />
    </div>
  )
}

// --- Event card ---

function EventCard({
  record,
  entityType,
  isSelected,
  onSelect,
}: {
  record: CaseRecord
  entityType: EntityTypeDefinition | undefined
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const statusDef = entityType?.statuses.find(s => s.value === record.statusHash)
  const statusColor = statusDef?.color ?? '#6b7280'
  const statusLabel = statusDef?.label ?? record.statusHash
  const relativeTime = formatRelativeTime(record.updatedAt, t)

  return (
    <button
      type="button"
      data-testid="case-card"
      onClick={() => onSelect(record.id)}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border bg-card hover:bg-accent/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: statusColor }}
        />
        <span className="truncate text-sm font-medium text-foreground flex-1">
          {record.caseNumber || record.id.slice(0, 8)}
        </span>
        <span data-testid="case-card-timestamp" className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Clock className="h-3 w-3" />
          {relativeTime}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <Badge
          data-testid="case-card-status-badge"
          variant="secondary"
          className="text-[10px] gap-1"
          style={{
            borderColor: statusColor,
            color: statusColor,
            backgroundColor: `${statusColor}15`,
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          {statusLabel}
        </Badge>
      </div>
    </button>
  )
}

// --- Event detail panel ---

type EventDetailTab = 'details' | 'timeline' | 'cases' | 'reports'

function EventDetail({
  record,
  entityType,
  isAdmin,
  hasPermission,
  publicKey,
  onStatusChange,
  onBack,
}: {
  record: CaseRecord
  entityType: EntityTypeDefinition
  isAdmin: boolean
  hasPermission: (p: string) => boolean
  publicKey: string | null
  onStatusChange: (id: string, newStatus: string) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<EventDetailTab>('details')
  const [showLinkCaseDialog, setShowLinkCaseDialog] = useState(false)
  const [showLinkReportDialog, setShowLinkReportDialog] = useState(false)

  const statusDef = entityType.statuses.find(s => s.value === record.statusHash)
  const severityDef = record.severityHash
    ? entityType.severities?.find(s => s.value === record.severityHash)
    : undefined

  const isAssigned = publicKey ? record.assignedTo.includes(publicKey) : false

  const tabs: Array<{ key: EventDetailTab; label: string; icon: typeof FileText }> = [
    { key: 'details', label: t('events.tabDetails', { defaultValue: 'Details' }), icon: FileText },
    { key: 'timeline', label: t('events.tabTimeline', { defaultValue: 'Timeline' }), icon: Clock },
    { key: 'cases', label: t('events.tabCases', { defaultValue: 'Cases' }), icon: FileText },
    { key: 'reports', label: t('events.tabReports', { defaultValue: 'Reports' }), icon: Link2 },
  ]

  return (
    <>
      {/* Header */}
      <div data-testid="case-detail-header" className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            className="md:hidden shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-foreground">
                {record.caseNumber || record.id.slice(0, 8)}
              </span>
              <StatusPill
                currentStatus={record.statusHash}
                statuses={entityType.statuses}
                onStatusChange={
                  (hasPermission('cases:update') || (hasPermission('cases:update-own') && isAssigned))
                    ? (s) => onStatusChange(record.id, s)
                    : undefined
                }
                readOnly={!hasPermission('cases:update') && !(hasPermission('cases:update-own') && isAssigned)}
              />
              {severityDef && (
                <Badge
                  variant="secondary"
                  className="gap-1 text-xs"
                  style={{
                    borderColor: severityDef.color ?? '#6b7280',
                    color: severityDef.color ?? '#6b7280',
                    backgroundColor: `${severityDef.color ?? '#6b7280'}15`,
                  }}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {severityDef.label}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('events.createdAt', {
                defaultValue: 'Created {{time}}',
                time: formatRelativeTime(record.createdAt, t),
              })}
            </p>
          </div>

          {/* Link buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              data-testid="event-link-case-btn"
              onClick={() => setShowLinkCaseDialog(true)}
            >
              <Link2 className="h-3.5 w-3.5" />
              {t('events.linkCase', { defaultValue: 'Link Case' })}
            </Button>
            <Button
              size="sm"
              variant="outline"
              data-testid="event-link-report-btn"
              onClick={() => setShowLinkReportDialog(true)}
            >
              <Link2 className="h-3.5 w-3.5" />
              {t('events.linkReport', { defaultValue: 'Link Report' })}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div data-testid="case-tabs" className="flex gap-0.5 -mb-3 mt-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              data-testid={`case-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-card border border-b-0 border-border text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'details' && (
          <EventDetailsTab record={record} entityType={entityType} />
        )}
        {activeTab === 'timeline' && (
          <CaseTimeline
            recordId={record.id}
            volunteerNames={{}}
            readerPubkeys={publicKey ? [publicKey] : []}
            statusLabels={Object.fromEntries(
              entityType.statuses.map(s => [s.value, { label: s.label, color: s.color ?? '#6b7280' }]),
            )}
          />
        )}
        {activeTab === 'cases' && (
          <LinkedCasesTab recordId={record.id} />
        )}
        {activeTab === 'reports' && (
          <LinkedReportsTab recordId={record.id} />
        )}
      </div>

      {/* Link dialogs */}
      <LinkSearchDialog
        open={showLinkCaseDialog}
        onOpenChange={setShowLinkCaseDialog}
        title={t('events.linkCaseTitle', { defaultValue: 'Link Case to Event' })}
        placeholder={t('events.searchCases', { defaultValue: 'Search cases...' })}
        onSelect={() => {
          setShowLinkCaseDialog(false)
        }}
      />
      <LinkSearchDialog
        open={showLinkReportDialog}
        onOpenChange={setShowLinkReportDialog}
        title={t('events.linkReportTitle', { defaultValue: 'Link Report to Event' })}
        placeholder={t('events.searchReports', { defaultValue: 'Search reports...' })}
        onSelect={() => {
          setShowLinkReportDialog(false)
        }}
      />
    </>
  )
}

// --- Event details tab ---

function EventDetailsTab({
  record,
  entityType,
}: {
  record: CaseRecord
  entityType: EntityTypeDefinition
}) {
  const { t } = useTranslation()
  const [fieldValues] = useState<SchemaFieldValues>({})

  if (entityType.fields.length === 0) {
    return (
      <div data-testid="case-details-tab" className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-8 w-8 mb-2 text-muted-foreground/40" />
        <p className="text-sm">{t('events.noFields', { defaultValue: 'No custom fields defined for this event type.' })}</p>
      </div>
    )
  }

  return (
    <div data-testid="case-details-tab">
      <SchemaForm
        entityType={entityType}
        values={fieldValues}
        onChange={() => {}}
        readOnly
        showAccessIndicators
      />
    </div>
  )
}

// --- Linked cases tab ---

function LinkedCasesTab({ recordId }: { recordId: string }) {
  const { t } = useTranslation()
  const [contacts, setContacts] = useState<RecordContact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listRecordContacts(recordId)
      .then(({ contacts: c }) => setContacts(c))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [recordId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (contacts.length === 0) {
    return (
      <div data-testid="case-contacts-tab" className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-8 w-8 mb-2 text-muted-foreground/40" />
        <p className="text-sm">{t('events.noLinkedCases', { defaultValue: 'No cases linked to this event.' })}</p>
      </div>
    )
  }

  return (
    <div data-testid="case-contacts-tab" className="space-y-2">
      {contacts.map(contact => (
        <div
          key={`${contact.recordId}-${contact.contactId}`}
          data-testid="case-contact-card"
          className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
        >
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{contact.contactId.slice(0, 12)}...</p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(contact.addedAt, t)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Linked reports tab ---

function LinkedReportsTab({ recordId }: { recordId: string }) {
  const { t } = useTranslation()

  return (
    <div data-testid="case-related-tab" className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Link2 className="h-8 w-8 mb-2 text-muted-foreground/40" />
      <p className="text-sm">{t('events.noLinkedReports', { defaultValue: 'No reports linked to this event.' })}</p>
    </div>
  )
}

// --- Link search dialog ---

function LinkSearchDialog({
  open,
  onOpenChange,
  title,
  placeholder,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  placeholder: string
  onSelect: () => void
}) {
  const [query, setQuery] = useState('')
  const [results] = useState<Array<{ id: string; label: string }>>([])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={placeholder}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9"
              type="search"
            />
          </div>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {results.length === 0 && query && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No results found
              </p>
            )}
            {results.map(item => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={onSelect}
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
