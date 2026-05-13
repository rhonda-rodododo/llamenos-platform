import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface PermissionPickerProps {
  catalog: Record<string, { key: string; label: string }[]>
  selected: string[]
  onChange: (permissions: string[]) => void
  excludeDomains?: string[]
}

interface ParsedPermission {
  key: string
  label: string
  domain: string
  action: string
  type: 'scope' | 'tier' | 'action'
  scopeLevel?: 'own' | 'assigned' | 'all'
  scopePrefix?: string
}

const SCOPE_LEVELS = ['own', 'assigned', 'all'] as const

function parsePermission(key: string, label: string): ParsedPermission {
  const [domain, action] = key.split(':')
  const parsed: ParsedPermission = { key, label, domain, action, type: 'action' }

  for (const level of SCOPE_LEVELS) {
    if (action.endsWith(`-${level}`)) {
      parsed.type = 'scope'
      parsed.scopeLevel = level
      parsed.scopePrefix = `${domain}:${action.replace(`-${level}`, '')}`
      break
    }
  }

  if (action.startsWith('envelope-')) {
    parsed.type = 'tier'
  }

  return parsed
}

export function PermissionPicker({ catalog, selected, onChange, excludeDomains = [] }: PermissionPickerProps) {
  const { t } = useTranslation()
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())

  const domains = useMemo(() => {
    const result: Record<string, ParsedPermission[]> = {}
    for (const [domain, perms] of Object.entries(catalog)) {
      if (excludeDomains.includes(domain)) continue
      result[domain] = perms.map((p) => parsePermission(p.key, p.label))
    }
    return result
  }, [catalog, excludeDomains])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  function toggleDomain(domain: string) {
    setExpandedDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  function toggleDomainAll(domain: string, perms: ParsedPermission[]) {
    const domainKeys = perms.map((p) => p.key)
    const allSelected = domainKeys.every((k) => selectedSet.has(k))

    if (allSelected) {
      onChange(selected.filter((s) => !domainKeys.includes(s)))
    } else {
      const toAdd: string[] = []
      const scopePrefixesSeen = new Set<string>()

      for (const p of perms) {
        if (p.type === 'scope' && p.scopePrefix) {
          if (!scopePrefixesSeen.has(p.scopePrefix)) {
            scopePrefixesSeen.add(p.scopePrefix)
            toAdd.push(`${p.scopePrefix}-all`)
          }
        } else {
          toAdd.push(p.key)
        }
      }

      const withoutDomain = selected.filter((s) => !domainKeys.includes(s))
      onChange([...withoutDomain, ...toAdd])
    }
  }

  function setScopeLevel(scopePrefix: string, domain: string, level: string | null) {
    const domainPerms = domains[domain] ?? []
    const scopeKeys = domainPerms
      .filter((p) => p.scopePrefix === scopePrefix)
      .map((p) => p.key)
    const withoutScope = selected.filter((s) => !scopeKeys.includes(s))
    if (level) {
      onChange([...withoutScope, `${scopePrefix}-${level}`])
    } else {
      onChange(withoutScope)
    }
  }

  function togglePermission(key: string) {
    if (selectedSet.has(key)) {
      onChange(selected.filter((s) => s !== key))
    } else {
      onChange([...selected, key])
    }
  }

  function getDomainState(perms: ParsedPermission[]): 'all' | 'some' | 'none' {
    const count = perms.filter((p) => selectedSet.has(p.key)).length
    if (count === 0) return 'none'
    if (count === perms.length) return 'all'
    return 'some'
  }

  const sortedDomains = Object.keys(domains).sort()

  return (
    <div className="space-y-1">
      {sortedDomains.map((domain) => {
        const perms = domains[domain]
        const state = getDomainState(perms)
        const selectedCount = perms.filter((p) => selectedSet.has(p.key)).length
        const isExpanded = expandedDomains.has(domain)

        const scopeGroups = new Map<string, ParsedPermission[]>()
        const tierPerms: ParsedPermission[] = []
        const actionPerms: ParsedPermission[] = []

        for (const p of perms) {
          if (p.type === 'scope' && p.scopePrefix) {
            const existing = scopeGroups.get(p.scopePrefix) ?? []
            existing.push(p)
            scopeGroups.set(p.scopePrefix, existing)
          } else if (p.type === 'tier') {
            tierPerms.push(p)
          } else {
            actionPerms.push(p)
          }
        }

        return (
          <div key={domain} className="border rounded-md">
            <div className="flex items-center gap-2 p-2 hover:bg-muted/50">
              <Checkbox
                checked={state === 'all' ? true : state === 'some' ? 'indeterminate' : false}
                onCheckedChange={() => toggleDomainAll(domain, perms)}
                aria-label={t('permissions.toggleAll', { domain: t(`permissions.groups.${domain}`, { defaultValue: domain }) })}
              />
              <button
                type="button"
                className="flex items-center gap-1 flex-1 text-left text-sm font-medium"
                onClick={() => toggleDomain(domain)}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {t(`permissions.groups.${domain}`, { defaultValue: domain })}
                <span className="text-muted-foreground text-xs ml-auto">
                  {selectedCount}/{perms.length}
                </span>
              </button>
            </div>

            {isExpanded && (
              <div className="px-4 pb-3 space-y-3">
                {[...scopeGroups.entries()].map(([prefix, scopePerms]) => {
                  const actionName = prefix.split(':')[1]
                  const currentLevel = scopePerms.find((p) => selectedSet.has(p.key))?.scopeLevel ?? null

                  return (
                    <div key={prefix} className="space-y-1">
                      <Label className="text-xs text-muted-foreground capitalize">{actionName} {t('permissions.scope', { defaultValue: 'scope' })}</Label>
                      <RadioGroup
                        value={currentLevel ?? 'none'}
                        onValueChange={(val) => setScopeLevel(prefix, domain, val === 'none' ? null : val)}
                        className="flex gap-3"
                      >
                        <div className="flex items-center gap-1">
                          <RadioGroupItem value="none" id={`${prefix}-none`} />
                          <Label htmlFor={`${prefix}-none`} className="text-xs">{t('permissions.none', { defaultValue: 'None' })}</Label>
                        </div>
                        {SCOPE_LEVELS.map((level) => {
                          const perm = scopePerms.find((p) => p.scopeLevel === level)
                          if (!perm) return null
                          return (
                            <div key={level} className="flex items-center gap-1">
                              <RadioGroupItem value={level} id={`${prefix}-${level}`} />
                              <Label htmlFor={`${prefix}-${level}`} className="text-xs capitalize">{level}</Label>
                            </div>
                          )
                        })}
                      </RadioGroup>
                    </div>
                  )
                })}

                {tierPerms.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('permissions.tiers', { defaultValue: 'Data access tiers' })}</Label>
                    {tierPerms.map((p) => (
                      <div key={p.key} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedSet.has(p.key)}
                          onCheckedChange={() => togglePermission(p.key)}
                          id={p.key}
                        />
                        <Label htmlFor={p.key} className="text-xs">{p.label}</Label>
                      </div>
                    ))}
                  </div>
                )}

                {actionPerms.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('permissions.actions', { defaultValue: 'Actions' })}</Label>
                    {actionPerms.map((p) => (
                      <div key={p.key} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedSet.has(p.key)}
                          onCheckedChange={() => togglePermission(p.key)}
                          id={p.key}
                        />
                        <Label htmlFor={p.key} className="text-xs">{p.label}</Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
