import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Server, Loader2 } from 'lucide-react'
import { normalizeServerInput, setApiBase } from '@/lib/api-config'
import { probeServerHealth } from '@/lib/net'

interface ServerAddressFormProps {
  /** Currently-configured address (settings screen) — empty for first run. */
  initialValue?: string
  /** Called with the normalized, confirmed-reachable address after it is persisted. */
  onSaved: (base: string) => void
  submitLabel: string
  /** Prefix for `data-testid` attributes so first-run and settings usages don't collide. */
  testIdPrefix: string
}

/**
 * Shared "type a server address, we probe it, we save it" form — used by both
 * the first-run gate (`ServerAddressScreen`) and the Settings "Server address"
 * section. Mirrors the iOS client's `APIService.configure(baseURL:)` flow:
 * infer the scheme, probe `/api/health`, and surface a clear error on an
 * unreachable or non-Llámenos host (see `net.ts#probeServerHealth`).
 */
export function ServerAddressForm({ initialValue = '', onSaved, submitLabel, testIdPrefix }: ServerAddressFormProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialValue)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || checking) return

    setChecking(true)
    setError('')
    try {
      const normalized = normalizeServerInput(trimmed)
      const result = await probeServerHealth(normalized)
      if (!result.ok) {
        setError(result.error ? t('serverAddress.errorWithDetail', { detail: result.error }) : t('serverAddress.unreachable'))
        return
      }
      await setApiBase(normalized)
      onSaved(normalized)
    } catch {
      setError(t('serverAddress.unreachable'))
    } finally {
      setChecking(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${testIdPrefix}-input`} className="flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5 text-muted-foreground" />
          {t('serverAddress.label')}
        </Label>
        <Input
          id={`${testIdPrefix}-input`}
          data-testid={`${testIdPrefix}-input`}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={t('serverAddress.placeholder')}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={checking}
          aria-invalid={!!error}
        />
        <p className="text-xs text-muted-foreground">{t('serverAddress.help')}</p>
      </div>

      {error && (
        <p role="alert" data-testid={`${testIdPrefix}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" data-testid={`${testIdPrefix}-submit`} disabled={checking || !value.trim()} className="w-full">
        {checking
          ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t('serverAddress.checking')}</span>
          : submitLabel}
      </Button>
    </form>
  )
}
