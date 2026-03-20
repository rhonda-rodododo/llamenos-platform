import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { User } from '@/lib/api'

interface UserMultiSelectProps {
  users: User[]
  selected: string[]
  onSelectionChange: (pubkeys: string[]) => void
  placeholder?: string
  className?: string
}

export function UserMultiSelect({
  users,
  selected,
  onSelectionChange,
  placeholder,
  className,
}: UserMultiSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const selectedUsers = users.filter(u => selected.includes(u.pubkey))

  function toggle(pubkey: string) {
    onSelectionChange(
      selected.includes(pubkey)
        ? selected.filter(p => p !== pubkey)
        : [...selected, pubkey]
    )
  }

  function remove(pubkey: string, e: React.SyntheticEvent) {
    e.stopPropagation()
    onSelectionChange(selected.filter(p => p !== pubkey))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs transition-colors',
            'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            className
          )}
        >
          {selectedUsers.length > 0 ? (
            selectedUsers.map(u => (
              <Badge
                key={u.pubkey}
                variant="secondary"
                className="max-w-[150px] gap-0.5 pr-0.5"
              >
                <span className="truncate" title={u.name}>{u.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={t('shifts.removeUser', { name: u.name })}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  onClick={(e) => remove(u.pubkey, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      remove(u.pubkey, e)
                    }
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">
              {placeholder || t('shifts.searchUsers')}
            </span>
          )}
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command filter={(value, search) => {
          const u = users.find(u => u.pubkey === value)
          if (!u) return 0
          const haystack = `${u.name} ${u.phone} ${u.pubkey}`.toLowerCase()
          return haystack.includes(search.toLowerCase()) ? 1 : 0
        }}>
          <CommandInput placeholder={t('shifts.searchUsers')} />
          <CommandList className="max-h-[200px]">
            <CommandEmpty>{t('shifts.noUsersFound')}</CommandEmpty>
            <CommandGroup>
              {users.map(u => (
                <CommandItem
                  key={u.pubkey}
                  value={u.pubkey}
                  onSelect={() => toggle(u.pubkey)}
                >
                  <Check
                    className={cn(
                      'h-4 w-4',
                      selected.includes(u.pubkey) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="truncate">{u.name}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {u.pubkey.slice(0, 8)}…
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
