import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import {
  searchRawContacts,
  mergeContacts,
  type DirectoryContact,
  type RawContact,
} from '@/lib/api'
import { encryptMessage } from '@/lib/platform'
import * as keyManager from '@/lib/key-manager'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, GitMerge } from 'lucide-react'

interface ContactMergeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  primaryContact: DirectoryContact
  onMerged: () => void
}

export function ContactMergeDialog({
  open,
  onOpenChange,
  primaryContact,
  onMerged,
}: ContactMergeDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<RawContact[]>([])
  const [selected, setSelected] = useState<RawContact | null>(null)
  const [searching, setSearching] = useState(false)
  const [merging, setMerging] = useState(false)

  const search = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const results = await searchRawContacts(query)
      setCandidates(results.contacts.filter((c) => c.id !== primaryContact.id))
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSearching(false)
    }
  }, [query, primaryContact.id, toast, t])

  const handleMerge = async () => {
    if (!selected) return
    setMerging(true)
    try {
      const devicePubkey = keyManager.getPublicKeyHex()
      if (!devicePubkey) {
        toast(t('common.error'), 'error')
        return
      }

      // Re-encrypt merged summary client-side — server only receives ciphertext
      const mergedPayload = JSON.stringify({
        mergedFrom: [primaryContact.id, selected.id],
        displayName: primaryContact.displayName,
        contactType: primaryContact.contactType,
        tags: primaryContact.tags,
        mergedAt: new Date().toISOString(),
      })

      const { encryptedContent, readerEnvelopes } = await encryptMessage(mergedPayload, [
        devicePubkey,
      ])

      await mergeContacts({
        primaryId: primaryContact.id,
        secondaryId: selected.id,
        mergedEncryptedSummary: encryptedContent,
        mergedSummaryEnvelopes: readerEnvelopes.map((e) => ({
          recipientPubkey: e.pubkey,
          encryptedKey: e.enc,
        })),
        mergedBlindIndexes: { identifierHashes: [], tagHashes: [] },
        mergedTrigramTokens: [],
      })

      toast(t('cms.mergeContactSuccess'))
      onMerged()
      onOpenChange(false)
    } catch {
      toast(t('cms.mergeContactError'), 'error')
    } finally {
      setMerging(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('cms.mergeContact')}</DialogTitle>
          <DialogDescription>{t('cms.mergeContactDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {t('cms.mergePrimary')}
            </p>
            <div className="rounded border p-2 text-sm font-medium">
              {primaryContact.displayName}
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder={t('cms.mergeSearchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') search() }}
            />
            <Button variant="outline" onClick={search} disabled={searching}>
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {candidates.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(selected?.id === c.id ? null : c)}
                  className={`w-full text-left rounded p-2 text-sm border transition-colors ${
                    selected?.id === c.id
                      ? 'border-primary bg-primary/10'
                      : 'border-transparent hover:bg-muted'
                  }`}
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {c.id.slice(0, 8)}
                  </span>
                  {selected?.id === c.id && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {t('cms.mergeSelected')}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('cms.mergeWarning')}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleMerge}
              disabled={!selected || merging}
            >
              {merging ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitMerge className="mr-2 h-4 w-4" />
              )}
              {t('cms.mergeConfirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
