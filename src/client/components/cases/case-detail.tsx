import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatRelativeTime } from '@/lib/format'
import { StatusPill } from '@/components/cases/status-pill'
import { SchemaForm, type SchemaFieldValues } from '@/components/cases/schema-form'
import { CaseTimeline } from '@/components/cases/case-timeline'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Clock, FileText, AlertTriangle } from 'lucide-react'
import type { CaseRecord, EntityTypeDefinition } from '@/lib/api'

type DetailTab = 'details' | 'timeline'

interface CaseDetailProps {
  record: CaseRecord
  entityType: EntityTypeDefinition
  onStatusChange: (id: string, newStatus: string) => void
  onBack: () => void
}

export function CaseDetail({ record, entityType, onStatusChange, onBack }: CaseDetailProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<DetailTab>('details')
  const [fieldValues] = useState<SchemaFieldValues>({})

  const severityDef = record.severityHash
    ? entityType.severities?.find(s => s.value === record.severityHash)
    : undefined

  const tabs: Array<{ key: DetailTab; label: string; icon: typeof FileText }> = [
    { key: 'details', label: t('cases.tabDetails', { defaultValue: 'Details' }), icon: FileText },
    { key: 'timeline', label: t('cases.tabTimeline', { defaultValue: 'Timeline' }), icon: Clock },
  ]

  return (
    <>
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
                onStatusChange={(s) => onStatusChange(record.id, s)}
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
              {t('cases.createdAt', {
                defaultValue: 'Created {{time}}',
                time: formatRelativeTime(record.createdAt, t),
              })}
            </p>
          </div>
        </div>

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

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'details' && (
          <div data-testid="case-details-tab">
            {entityType.fields.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="h-8 w-8 mb-2 text-muted-foreground/40" />
                <p className="text-sm">{t('cases.noFields', { defaultValue: 'No custom fields defined.' })}</p>
              </div>
            ) : (
              <SchemaForm
                entityType={entityType}
                values={fieldValues}
                onChange={() => {}}
                readOnly
                showAccessIndicators
              />
            )}
          </div>
        )}
        {activeTab === 'timeline' && (
          <CaseTimeline
            recordId={record.id}
            volunteerNames={{}}
            readerPubkeys={[]}
            statusLabels={Object.fromEntries(
              entityType.statuses.map(s => [s.value, { label: s.label, color: s.color ?? '#6b7280' }]),
            )}
          />
        )}
      </div>
    </>
  )
}
