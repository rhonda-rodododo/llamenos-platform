import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Check, Loader2 } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export function SectionBody({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('space-y-7 max-w-3xl', className)} {...rest} />
}

export function SectionDescription({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...rest} />
}

interface SectionFieldProps {
  label: ReactNode
  htmlFor?: string
  help?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}

export function SectionField({
  label,
  htmlFor,
  help,
  error,
  required,
  className,
  children,
}: SectionFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : help ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  )
}

interface SectionToggleFieldProps {
  label: ReactNode
  htmlFor?: string
  help?: ReactNode
  className?: string
  children: ReactNode
}

export function SectionToggleField({
  label,
  htmlFor,
  help,
  className,
  children,
}: SectionToggleFieldProps) {
  return (
    <div className={cn('flex items-start justify-between gap-6', className)}>
      <div className="space-y-1">
        <Label htmlFor={htmlFor}>{label}</Label>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
      {children}
    </div>
  )
}

interface SectionActionsProps {
  slug: string
  onSave: () => void
  saving?: boolean
  disabled?: boolean
  showSaved?: boolean
  saveLabel?: ReactNode
  extraActions?: ReactNode
  className?: string
}

export function SectionActions({
  slug,
  onSave,
  saving = false,
  disabled = false,
  showSaved = false,
  saveLabel,
  extraActions,
  className,
}: SectionActionsProps) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-border/60 pt-5 mt-2',
        className
      )}
    >
      <Button
        data-testid={`admin-${slug}-save`}
        onClick={onSave}
        disabled={saving || disabled}
        className="min-w-[90px]"
      >
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {saveLabel ?? t('common.save')}
      </Button>
      {extraActions}
      {showSaved && (
        <span
          data-testid={`admin-${slug}-save-success`}
          className="ml-auto flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-500"
        >
          <Check className="h-3.5 w-3.5" />
          {t('common.saved')}
        </span>
      )}
    </div>
  )
}

export function SectionBanner({
  tone = 'info',
  className,
  ...rest
}: ComponentProps<'div'> & { tone?: 'info' | 'warn' | 'danger' }) {
  const toneClass =
    tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100'
      : tone === 'danger'
        ? 'border-destructive/30 bg-destructive/5 text-destructive'
        : 'border-border bg-muted/40 text-foreground'
  return (
    <div className={cn('rounded-md border px-3 py-2 text-sm', toneClass, className)} {...rest} />
  )
}
