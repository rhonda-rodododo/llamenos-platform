import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  sectionSlug: string
  children: ReactNode
}

export function AdvancedReveal({ sectionSlug, children }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-8 border-t border-border/60 pt-4">
      <CollapsibleTrigger
        data-testid={`admin-advanced-reveal-${sectionSlug}`}
        className="group flex items-center gap-2 rounded-md px-2 py-1 -mx-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
        {open ? t('common.hideAdvanced') : t('common.showAdvanced')}
      </CollapsibleTrigger>
      <CollapsibleContent
        data-testid={`admin-advanced-panel-${sectionSlug}`}
        className="mt-5 space-y-5 border-l-2 border-border/60 pl-4 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
