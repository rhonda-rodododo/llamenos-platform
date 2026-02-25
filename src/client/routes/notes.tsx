import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { listNotes, createNote, updateNote, getCallHistory, listVolunteers, getCustomFields, type EncryptedNote, type CallRecord, type CustomFieldDefinition, type Volunteer } from '@/lib/api'
import { encryptNoteV2, decryptNoteV2, decryptNote, decryptTranscription, encryptExport } from '@/lib/crypto'
import * as keyManager from '@/lib/key-manager'
import { useToast } from '@/lib/toast'
import type { NotePayload } from '@shared/types'
import { StickyNote, Plus, Pencil, Lock, Mic, Save, X, Search, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { NewNoteForm } from '@/components/notes/new-note-form'
import { NoteEditForm } from '@/components/notes/note-edit-form'
import { RecordingPlayer } from '@/components/recording-player'

type NotesSearch = { page: number; callId: string; search: string }

export const Route = createFileRoute('/notes')({
  validateSearch: (search: Record<string, unknown>): NotesSearch => ({
    page: Number(search?.page ?? 1),
    callId: (search?.callId as string) || '',
    search: (search?.search as string) || '',
  }),
  component: NotesPage,
})

interface DecryptedNote extends EncryptedNote {
  decrypted: string
  payload: NotePayload
  isTranscription: boolean
}

function NotesPage() {
  const { t } = useTranslation()
  const { hasNsec, publicKey, isAdmin, adminDecryptionPubkey } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate({ from: '/notes' })
  const { page, callId, search } = Route.useSearch()
  const [notes, setNotes] = useState<DecryptedNote[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNewNote, setShowNewNote] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([])
  const [searchInput, setSearchInput] = useState(search)
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([])
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const limit = 50

  useEffect(() => {
    getCustomFields().then(r => setCustomFields(r.fields)).catch(() => {})
    if (isAdmin) {
      getCallHistory({ limit: 100 }).then(r => setRecentCalls(r.calls)).catch(() => {})
      listVolunteers().then(r => setVolunteers(r.volunteers)).catch(() => {})
    }
  }, [isAdmin])

  const nameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const v of volunteers) map.set(v.pubkey, v.name)
    return map
  }, [volunteers])

  const callInfoMap = useMemo(() => {
    const map = new Map<string, CallRecord>()
    for (const c of recentCalls) map.set(c.id, c)
    return map
  }, [recentCalls])

  const loadNotes = useCallback(() => {
    setLoading(true)
    listNotes({ callId: callId || undefined, page, limit })
      .then(res => {
        const decryptedNotes: DecryptedNote[] = res.notes
          .filter(note => {
            if (note.authorPubkey === 'system:transcription:admin') return isAdmin
            if (note.authorPubkey === 'system:transcription') return !isAdmin
            return true
          })
          .map(note => {
            const isTranscription = note.authorPubkey.startsWith('system:transcription')
            let payload: NotePayload
            if (isTranscription && note.ephemeralPubkey && hasNsec) {
              const sk = keyManager.getSecretKey()
              const text = decryptTranscription(note.encryptedContent, note.ephemeralPubkey, sk) || '[Decryption failed]'
              payload = { text }
            } else if (isTranscription && !note.ephemeralPubkey) {
              payload = { text: note.encryptedContent }
            } else if (hasNsec) {
              // Try V2 (per-note ECIES envelope) first, fall back to V1 (legacy HKDF)
              const sk = keyManager.getSecretKey()
              const myPubkey = publicKey!
              const envelope = isAdmin
                ? note.adminEnvelopes?.find(e => e.pubkey === myPubkey) ?? note.adminEnvelopes?.[0]
                : note.authorEnvelope
              if (envelope) {
                payload = decryptNoteV2(note.encryptedContent, envelope, sk) || { text: '[Decryption failed]' }
              } else {
                payload = decryptNote(note.encryptedContent, sk) || { text: '[Decryption failed]' }
              }
            } else {
              payload = { text: '[No key]' }
            }
            return { ...note, decrypted: payload.text, payload, isTranscription }
          })
        setNotes(decryptedNotes)
        setTotal(res.total)
      })
      .catch(() => toast(t('common.error'), 'error'))
      .finally(() => setLoading(false))
  }, [page, callId, hasNsec, isAdmin])

  useEffect(() => { loadNotes() }, [loadNotes])

  async function handleSaveEdit(noteId: string, text: string, fields: Record<string, string | number | boolean>) {
    if (!hasNsec || !publicKey || !text.trim()) return
    setSaving(true)
    try {
      const payload: NotePayload = { text }
      if (Object.keys(fields).length > 0) payload.fields = fields
      const authorPub = publicKey
      const adminPub = adminDecryptionPubkey || authorPub
      const { encryptedContent, authorEnvelope, adminEnvelopes } = encryptNoteV2(payload, authorPub, [adminPub])
      const res = await updateNote(noteId, { encryptedContent, authorEnvelope, adminEnvelopes })
      setNotes(prev => prev.map(n =>
        n.id === noteId ? { ...res.note, decrypted: text, payload, isTranscription: n.isTranscription } : n
      ))
      setEditingId(null)
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateNote(callId: string, text: string, fields: Record<string, string | number | boolean>) {
    if (!hasNsec || !publicKey || !text.trim() || !callId.trim()) return
    setSaving(true)
    try {
      const payload: NotePayload = { text }
      if (Object.keys(fields).length > 0) payload.fields = fields
      const authorPub = publicKey
      const adminPub = adminDecryptionPubkey || authorPub
      const { encryptedContent, authorEnvelope, adminEnvelopes } = encryptNoteV2(payload, authorPub, [adminPub])
      const res = await createNote({ callId, encryptedContent, authorEnvelope, adminEnvelopes })
      setNotes(prev => [{ ...res.note, decrypted: text, payload, isTranscription: false }, ...prev])
      setTotal(prev => prev + 1)
      setShowNewNote(false)
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    navigate({ search: { page: 1, callId, search: searchInput } })
  }

  function setPage(newPage: number) {
    navigate({ search: (prev) => ({ ...prev, page: newPage }) })
  }

  const filteredNotes = search
    ? notes.filter(n => n.decrypted.toLowerCase().includes(search.toLowerCase()))
    : notes

  const notesByCall = filteredNotes.reduce<Record<string, DecryptedNote[]>>((acc, note) => {
    const key = note.callId
    if (!acc[key]) acc[key] = []
    acc[key].push(note)
    return acc
  }, {})

  const totalPages = Math.ceil(total / limit)
  const visibleFields = customFields.filter(f => isAdmin || f.visibleToVolunteers)

  async function handleExport() {
    if (!hasNsec) return
    const sk = keyManager.getSecretKey()
    const rows = filteredNotes.map(n => ({
      id: n.id, callId: n.callId, content: n.decrypted, fields: n.payload.fields,
      isTranscription: n.isTranscription, createdAt: n.createdAt, updatedAt: n.updatedAt,
    }))
    const jsonString = JSON.stringify(rows, null, 2)
    const encrypted = encryptExport(jsonString, sk)
    const blob = new Blob([encrypted.buffer as ArrayBuffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `notes-export-${new Date().toISOString().slice(0, 10)}.enc`
    a.click()
    URL.revokeObjectURL(url)
    toast(t('notes.exportEncrypted'), 'success')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <StickyNote className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold sm:text-2xl">{t('notes.title')}</h1>
          </div>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <Lock className="h-3 w-3" />
            {t('notes.encryptionNote')}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4" />
              {t('notes.export')}
            </Button>
          )}
          <Button data-testid="note-new-btn" onClick={() => setShowNewNote(!showNewNote)}>
            <Plus className="h-4 w-4" />
            {t('notes.newNote')}
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <Card>
        <CardContent className="py-3">
          <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">{t('notes.searchNotes')}</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder={t('notes.searchPlaceholder')}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" aria-label={t('a11y.searchButton')}>
                <Search className="h-4 w-4" />
              </Button>
              {(search || callId) && (
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => { setSearchInput(''); navigate({ search: { page: 1, callId: '', search: '' } }) }}
                  aria-label={t('a11y.clearFilters')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* New note form */}
      {showNewNote && (
        <NewNoteForm
          recentCalls={recentCalls}
          customFieldDefs={visibleFields}
          saving={saving}
          onSave={handleCreateNote}
          onCancel={() => setShowNewNote(false)}
        />
      )}

      {loading ? (
        <Card>
          <CardContent className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : Object.keys(notesByCall).length === 0 ? (
        <Card>
          <CardContent>
            <div className="py-8 text-center text-muted-foreground">
              <StickyNote className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {search ? t('notes.noSearchResults') : t('notes.noNotes')}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(notesByCall).map(([cId, callNotes]) => (
            <Card key={cId}>
              <CardHeader className="border-b py-3">
                <CardTitle className="text-sm">
                  {(() => {
                    const callInfo = callInfoMap.get(cId)
                    if (!callInfo) return t('notes.callWith', { number: cId.slice(0, 12) + '...' })
                    const volunteerName = callInfo.answeredBy ? nameMap.get(callInfo.answeredBy) : null
                    const phone = callInfo.callerLast4 ? `***${callInfo.callerLast4}` : ''
                    return (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {callInfo.status === 'unanswered' ? (
                          <span className="text-destructive">{t('callHistory.unanswered')}</span>
                        ) : volunteerName && isAdmin ? (
                          <Link to="/volunteers/$pubkey" params={{ pubkey: callInfo.answeredBy }} className="text-primary hover:underline">
                            {volunteerName}
                          </Link>
                        ) : volunteerName ? (
                          <span>{volunteerName}</span>
                        ) : (
                          <span>{t('callHistory.answeredBy')}</span>
                        )}
                        {phone && (
                          <>
                            <span className="text-muted-foreground">&middot;</span>
                            <code className="text-xs font-mono text-muted-foreground">{phone}</code>
                          </>
                        )}
                        <span className="text-muted-foreground">&middot;</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          {new Date(callInfo.startedAt).toLocaleString()}
                        </span>
                      </span>
                    )
                  })()}
                </CardTitle>
                {callInfoMap.get(cId)?.hasRecording && (
                  <div className="mt-2">
                    <RecordingPlayer callId={cId} />
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0 divide-y divide-border">
                {callNotes.map(note => (
                  <div key={note.id} className="px-6 py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">
                            {new Date(note.createdAt).toLocaleString()}
                          </p>
                          {note.isTranscription && (
                            <Badge variant="secondary">
                              <Mic className="h-3 w-3" />
                              {t('transcription.title')}
                            </Badge>
                          )}
                        </div>
                        {editingId === note.id ? (
                          <NoteEditForm
                            text={note.decrypted}
                            fields={note.payload.fields || {}}
                            customFieldDefs={visibleFields}
                            saving={saving}
                            onSave={(text, fields) => handleSaveEdit(note.id, text, fields)}
                            onCancel={() => setEditingId(null)}
                          />
                        ) : (
                          <>
                            <p className="mt-2 text-sm whitespace-pre-wrap">{note.decrypted}</p>
                            {note.payload.fields && visibleFields.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {visibleFields.map(field => {
                                  const val = note.payload.fields?.[field.id]
                                  if (val === undefined || val === '') return null
                                  const displayVal = field.type === 'checkbox'
                                    ? (val ? '\u2713' : '\u2717')
                                    : String(val)
                                  return (
                                    <Badge key={field.id} variant="outline" className="text-xs">
                                      {field.label}: {displayVal}
                                    </Badge>
                                  )
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {editingId !== note.id && (
                        <Button
                          data-testid="note-edit-btn"
                          variant="ghost" size="icon-xs"
                          onClick={() => setEditingId(note.id)}
                          aria-label={t('a11y.editItem')}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4" />
            {t('common.back')}
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
            {t('common.next')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
