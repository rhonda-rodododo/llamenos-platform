import { createFileRoute } from '@tanstack/react-router'
import { Calendar } from 'lucide-react'
import { EntityTypeFilteredRecordList } from '@/components/cases/entity-type-filtered-record-list'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/events')({
  component: EventsPage,
})

function EventsPage() {
  const { t } = useTranslation()
  return (
    <EntityTypeFilteredRecordList
      entityCategory="event"
      headerIcon={<Calendar className="h-6 w-6 text-primary" />}
      title={t('events.title', { defaultValue: 'Events' })}
      i18nPrefix="events"
      showCalendarToggle
    />
  )
}
