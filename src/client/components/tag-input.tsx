import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { TagBadge } from '@/components/tag-badge'
import { useTags, useCreateTag } from '@/lib/queries/tags'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

interface TagInputProps {
  /** Selected tag IDs */
  value: string[]
  onChange: (tagIds: string[]) => void
  placeholder?: string
  className?: string
}

export function TagInput({ value, onChange, placeholder, className }: TagInputProps) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: tags = [] } = useTags()
  const createTag = useCreateTag()

  const allowCreate = hasPermission('tags:create')

  const selectedTags = tags.filter((tag) => value.includes(tag.id))

  // Group tags by category
  const grouped = tags.reduce<Record<string, typeof tags>>((acc, tag) => {
    const cat = tag.category ?? t('tags.uncategorized', { defaultValue: 'General' })
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(tag)
    return acc
  }, {})

  const searchLower = search.toLowerCase()
  const filteredGrouped = Object.entries(grouped).reduce<Record<string, typeof tags>>(
    (acc, [cat, catTags]) => {
      const matches = catTags.filter(
        (tag) =>
          tag.label.toLowerCase().includes(searchLower) ||
          tag.name.includes(searchLower),
      )
      if (matches.length > 0) acc[cat] = matches
      return acc
    },
    {},
  )

  const exactMatch = tags.some(
    (t) => t.label.toLowerCase() === searchLower || t.name === searchLower,
  )
  const showCreate = allowCreate && search.trim().length > 0 && !exactMatch

  function toggle(tagId: string) {
    if (value.includes(tagId)) {
      onChange(value.filter((id) => id !== tagId))
    } else {
      onChange([...value, tagId])
    }
  }

  async function handleCreate() {
    const label = search.trim()
    if (!label) return
    try {
      const newTag = await createTag.mutateAsync({ name: label, label })
      onChange([...value, newTag.id])
      setSearch('')
    } catch { /* handled by mutation */ }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <TagBadge
              key={tag.id}
              color={tag.color}
              label={tag.label}
              onRemove={() => toggle(tag.id)}
            />
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 w-full justify-between text-xs font-normal"
          >
            <span className="text-muted-foreground">
              {placeholder ?? t('tags.addTag', { defaultValue: 'Add tag...' })}
            </span>
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              ref={inputRef}
              placeholder={t('tags.searchTags', { defaultValue: 'Search tags...' })}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {showCreate && (
                <CommandGroup>
                  <CommandItem
                    onSelect={handleCreate}
                    className="gap-2"
                    disabled={createTag.isPending}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('tags.createTagNamed', {
                      defaultValue: 'Create "{{name}}"',
                      name: search.trim(),
                    })}
                  </CommandItem>
                </CommandGroup>
              )}

              {Object.keys(filteredGrouped).length === 0 && !showCreate && (
                <CommandEmpty>
                  {t('tags.noTagsFound', { defaultValue: 'No tags found.' })}
                </CommandEmpty>
              )}

              {Object.entries(filteredGrouped).map(([category, catTags]) => (
                <CommandGroup key={category} heading={category}>
                  {catTags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.id}
                      onSelect={() => toggle(tag.id)}
                      className="gap-2"
                    >
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{tag.label}</span>
                      {value.includes(tag.id) && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
