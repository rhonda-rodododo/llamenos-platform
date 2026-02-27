import type { CustomFieldDefinition } from '@shared/types'
import { Badge } from '@/components/ui/badge'

interface Props {
  fields: CustomFieldDefinition[]
  values: Record<string, string | number | boolean>
}

/**
 * Read-only badge display for custom field values.
 * Used in note cards, report details, and conversation notes.
 */
export function CustomFieldBadges({ fields, values }: Props) {
  const badges = fields
    .map(field => {
      const val = values[field.id]
      if (val === undefined || val === '') return null
      const displayVal = field.type === 'checkbox'
        ? (val ? '\u2713' : '\u2717')
        : String(val)
      return (
        <Badge key={field.id} variant="outline" className="text-xs">
          {field.label}: {displayVal}
        </Badge>
      )
    })
    .filter(Boolean)

  if (badges.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {badges}
    </div>
  )
}
