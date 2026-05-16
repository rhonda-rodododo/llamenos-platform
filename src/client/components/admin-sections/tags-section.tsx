import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { useTags, useCreateTag, useUpdateTag, useDeleteTag, type DecryptedTag } from '@/lib/queries/tags'
import { TagBadge } from '@/components/tag-badge'
import { SectionBody } from '@/components/admin-shell/section-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, Plus, Pencil } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'

// ---------------------------------------------------------------------------
// Tag form (shared by create and edit modes)
// ---------------------------------------------------------------------------

interface TagFormProps {
  initial?: { name: string; label: string; color: string; category: string }
  nameEditable?: boolean
  onSubmit: (values: { name: string; label: string; color: string; category: string }) => Promise<void>
  onCancel: () => void
  submitLabel: string
  saving: boolean
}

function TagForm({ initial, nameEditable = true, onSubmit, onCancel, submitLabel, saving }: TagFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(initial?.name ?? '')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [color, setColor] = useState(initial?.color ?? '#6b7280')
  const [category, setCategory] = useState(initial?.category ?? '')

  const autoSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="tag-label">{t('tags.tagLabel')}</Label>
          <Input
            id="tag-label"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={t('tags.tagLabel')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tag-category">{t('tags.tagCategory')}</Label>
          <Input
            id="tag-category"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder={t('tags.tagCategory')}
          />
        </div>
      </div>

      {nameEditable && (
        <div className="space-y-1">
          <Label htmlFor="tag-name">{t('tags.tagName')}</Label>
          <Input
            id="tag-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="my-tag"
          />
          {name && autoSlug !== name && (
            <p className="text-[10px] text-muted-foreground">
              {t('tags.slugPreview', { defaultValue: 'Slug: {{slug}}', slug: autoSlug })}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="space-y-1">
          <Label htmlFor="tag-color">{t('tags.tagColor')}</Label>
          <div className="flex gap-2 items-center">
            <input
              id="tag-color"
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="h-8 w-12 rounded border cursor-pointer"
            />
            <span className="text-xs text-muted-foreground font-mono">{color}</span>
          </div>
        </div>

        {/* Live preview */}
        {label && (
          <div className="flex items-center gap-2 mt-4">
            <span className="text-xs text-muted-foreground">{t('tags.preview', { defaultValue: 'Preview:' })}</span>
            <TagBadge color={color} label={label} />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onSubmit({ name: autoSlug || label.toLowerCase().replace(/\s+/g, '-'), label, color, category })}
          disabled={saving || !label.trim()}
        >
          {saving ? t('common.saving', { defaultValue: 'Saving...' }) : submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tags section main component
// ---------------------------------------------------------------------------

export function TagsSection() {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DecryptedTag | null>(null)

  const { data: tags = [], isLoading } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()

  async function handleCreate(values: { name: string; label: string; color: string; category: string }) {
    try {
      await createTag.mutateAsync({
        name: values.name,
        label: values.label,
        color: values.color,
        category: values.category || undefined,
      })
      setCreating(false)
      toast(t('common.saved', { defaultValue: 'Tag created' }), 'success')
    } catch {
      toast(t('common.error', { defaultValue: 'Failed to create tag' }), 'error')
    }
  }

  async function handleEdit(id: string, values: { label: string; color: string; category: string }) {
    try {
      await updateTag.mutateAsync({
        id,
        label: values.label,
        color: values.color,
        category: values.category || null,
      })
      setEditingId(null)
      toast(t('common.saved', { defaultValue: 'Tag updated' }), 'success')
    } catch {
      toast(t('common.error', { defaultValue: 'Failed to update tag' }), 'error')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteTag.mutateAsync(deleteTarget.id)
      toast(t('common.deleted', { defaultValue: 'Tag deleted' }), 'success')
    } catch {
      toast(t('common.error', { defaultValue: 'Failed to delete tag' }), 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <SectionBody>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">{t('tags.title')}</h3>
        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {t('tags.createTag')}
          </Button>
        )}
      </div>

      {creating && (
        <div className="mb-4">
          <TagForm
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
            submitLabel={t('common.save', { defaultValue: 'Save' })}
            saving={createTag.isPending}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('tags.loading')}</p>
      ) : tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('tags.noTags')}</p>
      ) : (
        <ul className="space-y-2">
          {tags.map((tag) => {
            if (editingId === tag.id) {
              return (
                <li key={tag.id}>
                  <TagForm
                    initial={{ name: tag.name, label: tag.label, color: tag.color, category: tag.category ?? '' }}
                    nameEditable={false}
                    onSubmit={({ label, color, category }) => handleEdit(tag.id, { label, color, category })}
                    onCancel={() => setEditingId(null)}
                    submitLabel={t('common.save', { defaultValue: 'Save' })}
                    saving={updateTag.isPending}
                  />
                </li>
              )
            }
            return (
              <li key={tag.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <TagBadge color={tag.color} label={tag.label} />
                  <span className="text-xs text-muted-foreground font-mono">{tag.name}</span>
                  {tag.category && (
                    <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                      {tag.category}
                    </span>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setEditingId(tag.id)}
                    title={t('tags.editTag')}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(tag)}
                    title={t('tags.deleteTag')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title={t('tags.deleteTag')}
          description={t('tags.confirmDelete')}
          confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
          onConfirm={handleDelete}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        />
      )}
    </SectionBody>
  )
}
