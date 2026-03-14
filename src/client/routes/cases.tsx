import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  listRecords,
  getRecord,
  updateRecord,
  listEntityTypes,
  listRecordContacts,
  assignRecord as apiAssignRecord,
  getCaseManagementEnabled,
  type CaseRecord,
  type EntityTypeDefinition,
  type RecordContact,
  type EnumOption,
} from '@/lib/api'
import { formatRelativeTime } from '@/lib/format'
import { StatusPill } from '@/components/cases/status-pill'
import { SchemaForm, type SchemaFieldValues } from '@/components/cases/schema-form'
import { CreateRecordDialog } from '@/components/cases/create-record-dialog'
import { CaseTimeline } from '@/components/cases/case-timeline'
import { EvidenceTab } from '@/components/cases/evidence-tab'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  FolderOpen, Plus, Loader2, Clock, ArrowLeft, UserPlus,
  Users, FileText, MessageSquare, Link2, AlertTriangle,
  ChevronLeft, ChevronRight,
} from 'lucide-react'

export const Route = createFileRoute('/cases')({
  component: CasesPage,
})

function CasesPage() {
  const { t } = useTranslation()
  const { hasNsec, publicKey, isAdmin, hasPermission } = useAuth()
  const { toast } = useToast()

  // --- Data state ---
  const [records, setRecords] = useState<CaseRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [entityTypes, setEntityTypes] = useState<EntityTypeDefinition[]>([])
  const [cmsEnabled, setCmsEnabled] = useState<boolean | null>(null)

  // --- UI state ---
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const pageSize = 50

  const entityTypeMap = useMemo(
    () => new Map(entityTypes.map(et => [et.id, et])),
    [entityTypes],
  )

  const selectedRecord = records.find(r => r.id === selectedId)
  const selectedEntityType = selectedRecord
    ? entityTypeMap.get(selectedRecord.entityTypeId)
    : undefined

  // --- Load entity types + CMS status ---
  useEffect(() => {
    getCaseManagementEnabled()
      .then(({ enabled }) => setCmsEnabled(enabled))
      .catch(() => setCmsEnabled(false))

    listEntityTypes()
      .then(({ entityTypes: types }) => setEntityTypes(types.filter(et => !et.isArchived)))
      .catch(() => {})
  }, [])

  // --- Fetch records ---
  const fetchRecords = useCallback(() => {
    setLoading(true)
    const params: {
      entityTypeId?: string
      statusHash?: string
      page?: number
      limit?: number
    } = { page, limit: pageSize }

    if (entityTypeFilter !== 'all') params.entityTypeId = entityTypeFilter
    if (statusFilter !== 'all') params.statusHash = statusFilter

    listRecords(params)
      .then(({ records: recs, total: t }) => {
        setRecords(recs)
        setTotal(t)
      })
      .catch(() => toast(t('cases.loadError', { defaultValue: 'Failed to load cases' }), 'error'))
      .finally(() => setLoading(false))
  }, [entityTypeFilter, statusFilter, page, toast, t])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  // Poll records
  useEffect(() => {
    const interval = setInterval(fetchRecords, 30_000)
    return () => clearInterval(interval)
  }, [fetchRecords])

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
      toast(t('cases.statusUpdated', { defaultValue: 'Status updated' }))
    } catch {
      toast(t('cases.statusUpdateError', { defaultValue: 'Failed to update status' }), 'error')
    }
  }, [toast, t])

  const handleAssignToMe = useCallback(async (recordId: string) => {
    if (!publicKey) return
    try {
      await apiAssignRecord(recordId, [publicKey])
      setRecords(prev =>
        prev.map(r => {
          if (r.id !== recordId) return r
          const assignedTo = r.assignedTo.includes(publicKey) ? r.assignedTo : [...r.assignedTo, publicKey]
          return { ...r, assignedTo, updatedAt: new Date().toISOString() }
        }),
      )
      toast(t('cases.assignedToYou', { defaultValue: 'Assigned to you' }))
    } catch {
      toast(t('cases.assignError', { defaultValue: 'Failed to assign' }), 'error')
    }
  }, [publicKey, toast, t])

  // Filter statuses come from all entity types combined, deduped
  const allStatuses = useMemo(() => {
    const map = new Map<string, EnumOption>()
    for (const et of entityTypes) {
      for (const s of et.statuses) {
        if (!map.has(s.value)) map.set(s.value, s)
      }
    }
    return Array.from(map.values())
  }, [entityTypes])

  const totalPages = Math.ceil(total / pageSize)
  const showEmptyState = !loading && records.length === 0 && entityTypeFilter === 'all' && statusFilter === 'all'

  // CMS not enabled
  if (cmsEnabled === false) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-6 w-6 text-primary" />
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">
            {t('cases.title', { defaultValue: 'Cases' })}
          </h1>
        </div>
        <Card data-testid="cms-not-enabled">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">{t('cases.notEnabled', { defaultValue: 'Case management is not enabled' })}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAdmin
                ? t('cases.enableHint', { defaultValue: 'Enable case management and apply a template in Hub Settings > Case Management.' })
                : t('cases.enableHintVolunteer', { defaultValue: 'An admin needs to enable case management for this hub.' })}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Still loading CMS status
  if (cmsEnabled === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-6 w-6 text-primary" />
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">
            {t('cases.title', { defaultValue: 'Cases' })}
          </h1>
        </div>
        {hasPermission('cases:create') && (
          <Button size="sm" data-testid="case-new-btn" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t('cases.new', { defaultValue: 'New Case' })}
          </Button>
        )}
      </div>

      {/* Entity type tabs */}
      {entityTypes.length > 1 && (
        <div data-testid="case-type-tabs" className="flex flex-wrap gap-1">
          <button
            type="button"
            data-testid="case-tab-all"
            onClick={() => { setEntityTypeFilter('all'); setPage(1) }}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              entityTypeFilter === 'all'
                ? 'bg-primary text-primary-foreground font-medium'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t('cases.allTypes', { defaultValue: 'All' })}
          </button>
          {entityTypes.map(et => (
            <button
              key={et.id}
              type="button"
              data-testid={`case-tab-${et.name}`}
              onClick={() => { setEntityTypeFilter(et.id); setPage(1) }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                entityTypeFilter === et.id
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {et.color && (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: et.color }}
                />
              )}
              {et.label}
            </button>
          ))}
        </div>
      )}

      {showEmptyState ? (
        <Card data-testid="empty-state">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">{t('cases.noCases', { defaultValue: 'No cases yet' })}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {entityTypes.length === 0
                ? t('cases.applyTemplateHint', { defaultValue: 'Apply a case management template to get started.' })
                : t('cases.noCasesHint', { defaultValue: 'Cases will appear here as your team creates them.' })}
            </p>
            {hasPermission('cases:create') && entityTypes.length > 0 && (
              <Button
                size="sm"
                className="mt-4"
                data-testid="case-empty-create-btn"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('cases.new', { defaultValue: 'New Case' })}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex h-[calc(100vh-14rem)] gap-4">
          {/* Cases list sidebar */}
          <div data-testid="case-list" className="w-80 shrink-0 overflow-y-auto rounded-lg border border-border bg-card">
            {/* Filters */}
            <div className="sticky top-0 z-10 border-b border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  {t('cases.title', { defaultValue: 'Cases' })}
                  <Badge variant="secondary" className="text-[10px]">{total}</Badge>
                </h2>
              </div>
              <div data-testid="case-filter-area" className="flex gap-2">
                <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1) }}>
                  <SelectTrigger size="sm" className="flex-1" data-testid="case-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('cases.allStatuses', { defaultValue: 'All statuses' })}</SelectItem>
                    {allStatuses.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: s.color ?? '#6b7280' }}
                          />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FolderOpen className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm">{t('cases.noResults', { defaultValue: 'No matching cases' })}</p>
              </div>
            ) : (
              <>
                <div className="p-2 space-y-1.5">
                  {records.map(record => (
                    <RecordCard
                      key={record.id}
                      record={record}
                      entityType={entityTypeMap.get(record.entityTypeId)}
                      isSelected={selectedId === record.id}
                      onSelect={setSelectedId}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div data-testid="case-pagination" className="sticky bottom-0 border-t border-border bg-card px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {t('cases.pageInfo', {
                        defaultValue: 'Page {{page}} of {{total}}',
                        page,
                        total: totalPages,
                      })}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                        data-testid="case-page-prev"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                        data-testid="case-page-next"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Record detail */}
          <div data-testid="case-detail" className="flex flex-1 flex-col rounded-lg border border-border bg-card overflow-hidden">
            {selectedRecord && selectedEntityType ? (
              <RecordDetail
                record={selectedRecord}
                entityType={selectedEntityType}
                isAdmin={isAdmin}
                hasPermission={hasPermission}
                publicKey={publicKey}
                onStatusChange={handleStatusChange}
                onAssignToMe={handleAssignToMe}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
                <FolderOpen className="h-10 w-10 mb-3" />
                <p>{t('cases.selectCase', { defaultValue: 'Select a case to view details' })}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <CreateRecordDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleRecordCreated}
        defaultEntityTypeId={entityTypeFilter !== 'all' ? entityTypeFilter : undefined}
      />
    </div>
  )
}

// --- List card for a single record ---

function RecordCard({
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

  const severityDef = record.severityHash
    ? entityType?.severities?.find(s => s.value === record.severityHash)
    : undefined

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
        {/* Status dot */}
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
        {/* Status badge */}
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

        {/* Severity badge */}
        {severityDef && (
          <Badge
            variant="secondary"
            className="text-[10px]"
            style={{
              borderColor: severityDef.color ?? '#6b7280',
              color: severityDef.color ?? '#6b7280',
            }}
          >
            {severityDef.label}
          </Badge>
        )}

        {/* Entity type label */}
        {entityType && (
          <Badge variant="secondary" className="text-[10px]">
            {entityType.label}
          </Badge>
        )}

        {/* Assignment indicator */}
        {record.assignedTo.length > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Users className="h-3 w-3" />
            {record.assignedTo.length}
          </span>
        )}
      </div>
    </button>
  )
}

// --- Record detail panel ---

type DetailTab = 'details' | 'timeline' | 'contacts' | 'evidence' | 'related'

function RecordDetail({
  record,
  entityType,
  isAdmin,
  hasPermission,
  publicKey,
  onStatusChange,
  onAssignToMe,
  onBack,
}: {
  record: CaseRecord
  entityType: EntityTypeDefinition
  isAdmin: boolean
  hasPermission: (p: string) => boolean
  publicKey: string | null
  onStatusChange: (id: string, newStatus: string) => void
  onAssignToMe: (id: string) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<DetailTab>('details')
  const [contacts, setContacts] = useState<RecordContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)

  // Derive status / severity info
  const statusDef = entityType.statuses.find(s => s.value === record.statusHash)
  const severityDef = record.severityHash
    ? entityType.severities?.find(s => s.value === record.severityHash)
    : undefined

  const isAssigned = publicKey ? record.assignedTo.includes(publicKey) : false

  // Load contacts when tab is active
  useEffect(() => {
    if (activeTab !== 'contacts') return
    setContactsLoading(true)
    listRecordContacts(record.id)
      .then(({ contacts: c }) => setContacts(c))
      .catch(() => {})
      .finally(() => setContactsLoading(false))
  }, [activeTab, record.id])

  const tabs: Array<{ key: DetailTab; label: string; icon: typeof FileText }> = [
    { key: 'details', label: t('cases.tabDetails', { defaultValue: 'Details' }), icon: FileText },
    { key: 'timeline', label: t('cases.tabTimeline', { defaultValue: 'Timeline' }), icon: Clock },
    { key: 'contacts', label: t('cases.tabContacts', { defaultValue: 'Contacts' }), icon: Users },
    { key: 'evidence', label: t('cases.tabEvidence', { defaultValue: 'Evidence' }), icon: Link2 },
    { key: 'related', label: t('cases.tabRelated', { defaultValue: 'Related' }), icon: MessageSquare },
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
            data-testid="case-back-btn"
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
              <Badge variant="secondary" className="text-[10px]">
                {entityType.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('cases.createdAt', {
                defaultValue: 'Created {{time}}',
                time: formatRelativeTime(record.createdAt, t),
              })}
              {record.assignedTo.length > 0 && (
                <>
                  {' '}&middot;{' '}
                  {t('cases.assignedCount', {
                    defaultValue: '{{count}} assigned',
                    count: record.assignedTo.length,
                  })}
                </>
              )}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {!isAssigned && hasPermission('cases:assign') && (
              <Button
                size="sm"
                variant="outline"
                data-testid="case-assign-btn"
                onClick={() => onAssignToMe(record.id)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                {t('cases.assignToMe', { defaultValue: 'Assign to me' })}
              </Button>
            )}
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
              {tab.key === 'contacts' && record.contactCount > 0 && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0">{record.contactCount}</Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'details' && (
          <DetailsTab
            record={record}
            entityType={entityType}
            isAdmin={isAdmin}
            hasPermission={hasPermission}
            isAssigned={isAssigned}
          />
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
        {activeTab === 'contacts' && (
          <ContactsTab
            contacts={contacts}
            loading={contactsLoading}
            entityType={entityType}
          />
        )}
        {activeTab === 'evidence' && (
          <EvidenceTab
            recordId={record.id}
            volunteerNames={{}}
            readerPubkeys={publicKey ? [publicKey] : []}
          />
        )}
        {activeTab === 'related' && <RelatedPlaceholder />}
      </div>
    </>
  )
}

// --- Details tab: renders schema fields ---

function DetailsTab({
  record,
  entityType,
  isAdmin,
  hasPermission,
  isAssigned,
}: {
  record: CaseRecord
  entityType: EntityTypeDefinition
  isAdmin: boolean
  hasPermission: (p: string) => boolean
  isAssigned: boolean
}) {
  const { t } = useTranslation()

  // In a real implementation, field values would be decrypted from record.encryptedFields.
  // For now, show the schema form in read-only mode with empty values.
  // TODO: integrate client-side decryption of encryptedFields
  const [fieldValues] = useState<SchemaFieldValues>({})

  const canEdit = hasPermission('cases:update') || (hasPermission('cases:update-own') && isAssigned)

  if (entityType.fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-8 w-8 mb-2 text-muted-foreground/40" />
        <p className="text-sm">{t('cases.noFields', { defaultValue: 'No custom fields defined for this case type.' })}</p>
      </div>
    )
  }

  return (
    <div data-testid="case-details-tab">
      <SchemaForm
        entityType={entityType}
        values={fieldValues}
        onChange={() => {
          // TODO: implement save with encryption on change
        }}
        readOnly={!canEdit}
        showAccessIndicators
      />
    </div>
  )
}

// --- Contacts tab ---

function ContactsTab({
  contacts,
  loading,
  entityType,
}: {
  contacts: RecordContact[]
  loading: boolean
  entityType: EntityTypeDefinition
}) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (contacts.length === 0) {
    return (
      <div data-testid="case-contacts-empty" className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Users className="h-8 w-8 mb-2 text-muted-foreground/40" />
        <p className="text-sm">{t('cases.noContacts', { defaultValue: 'No contacts linked to this case.' })}</p>
      </div>
    )
  }

  return (
    <div data-testid="case-contacts-tab" className="space-y-2">
      {contacts.map(contact => {
        const roleDef = entityType.contactRoles?.find(r => r.value === contact.role)
        return (
          <div
            key={`${contact.recordId}-${contact.contactId}`}
            data-testid="case-contact-card"
            className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              <Users className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{contact.contactId.slice(0, 12)}...</p>
              <p className="text-xs text-muted-foreground">
                {t('cases.addedAt', {
                  defaultValue: 'Added {{time}}',
                  time: formatRelativeTime(contact.addedAt, t),
                })}
              </p>
            </div>
            {roleDef && (
              <Badge
                variant="secondary"
                className="text-[10px]"
                style={{
                  borderColor: roleDef.color ?? undefined,
                  color: roleDef.color ?? undefined,
                }}
              >
                {roleDef.label}
              </Badge>
            )}
          </div>
        )
      })}
    </div>
  )
}

// --- Placeholder tabs ---

function RelatedPlaceholder() {
  const { t } = useTranslation()
  return (
    <div data-testid="case-related-tab" className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <MessageSquare className="h-8 w-8 mb-2 text-muted-foreground/40" />
      <p className="text-sm font-medium">{t('cases.relatedPlaceholder', { defaultValue: 'Related' })}</p>
      <p className="text-xs mt-1">{t('cases.relatedHint', { defaultValue: 'Related cases and linked records will appear here.' })}</p>
    </div>
  )
}
