import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  listTags,
  createTag,
  deleteTag,
  type TagResponse,
} from '@/lib/api'
import { SectionBody } from '@/components/admin-shell/section-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, Plus, Tag } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'

export function TagsSection() {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [tags, setTags] = useState<TagResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('#6b7280')
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TagResponse | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await listTags()
      setTags(res.tags)
    } catch {
      toast(t('common.error', { defaultValue: 'Error loading tags' }), 'error')
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!newName.trim() || !newLabel.trim()) return
    setSaving(true)
    try {
      // Label is stored encrypted — for now store plaintext as the encrypted blob
      // (full HPKE encryption is wired at the call-site when crypto is integrated)
      const tag = await createTag({
        id: crypto.randomUUID(),
        name: newName.trim().toLowerCase().replace(/\s+/g, '-'),
        encryptedLabel: newLabel.trim(),
        color: newColor,
      })
      setTags((prev) => [...prev, tag])
      setNewName('')
      setNewLabel('')
      setNewColor('#6b7280')
      setCreating(false)
      toast(t('common.saved', { defaultValue: 'Tag created' }), 'success')
    } catch {
      toast(t('common.error', { defaultValue: 'Failed to create tag' }), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteTag(deleteTarget.id)
      setTags((prev) => prev.filter((t) => t.id !== deleteTarget.id))
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
        <div className="border rounded-md p-3 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tag-name">{t('tags.tagName')}</Label>
              <Input
                id="tag-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="my-tag"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tag-label">{t('tags.tagLabel')}</Label>
              <Input
                id="tag-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={t('tags.tagLabel')}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tag-color">{t('tags.tagColor')}</Label>
            <div className="flex gap-2 items-center">
              <input
                id="tag-color"
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-8 w-12 rounded border cursor-pointer"
              />
              <span className="text-xs text-muted-foreground">{newColor}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={saving || !newName.trim() || !newLabel.trim()}>
              {saving ? t('common.saving', { defaultValue: 'Saving...' }) : t('common.save', { defaultValue: 'Save' })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(''); setNewLabel('') }}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('tags.loading')}</p>
      ) : tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('tags.noTags')}</p>
      ) : (
        <ul className="space-y-2">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center justify-between border rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <Tag className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{tag.encryptedLabel}</span>
                <span className="text-xs text-muted-foreground font-mono">{tag.name}</span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(tag)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
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
