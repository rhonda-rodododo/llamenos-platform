import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface TagBadgeProps {
  color: string
  label: string
  onRemove?: () => void
  className?: string
}

export function TagBadge({ color, label, onRemove, className }: TagBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('gap-1.5 pr-1 text-xs font-normal', className)}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="max-w-[120px] truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-muted-foreground/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Remove ${label}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </Badge>
  )
}
