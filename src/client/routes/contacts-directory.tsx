import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/lib/toast'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  listRawContacts,
  searchRawContacts,
  getRawContact,
  type RawContact,
  type DirectoryContact,
  type DirectoryContactType,
  type DirectoryContactSummary,
  type ContactPII,
  type ContactIdentifier,
} from '@/lib/api'
import { decryptMessage } from '@/lib/platform'
import { ContactCard } from '@/components/contacts/contact-card'
import { ContactProfile } from '@/components/contacts/contact-profile'
import { CreateContactDialog } from '@/components/contacts/create-contact-dialog'
import { EditContactDialog } from '@/components/contacts/edit-contact-dialog'
import { AffinityGroupsSidebar } from '@/components/contacts/affinity-groups-sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Users, Plus, Search, Loader2, Lock, Pencil,
} from 'lucide-react'

export const Route = createFileRoute('/contacts-directory')({
  component: ContactDirectoryPage,
})

/** Decrypt a RawContact into a DirectoryContact for UI rendering */
async function decryptContact(raw: RawContact): Promise<DirectoryContact> {
  let displayName = raw.id.slice(0, 8) + '...'
  let contactType: DirectoryContactType = 'individual'
  let tags: string[] = []
  let canDecrypt = false
  let demographics: string | undefined
  let emergencyContacts: string | undefined
  let communicationPrefs: string | undefined
  let notes: string | undefined
  let identifiers: ContactIdentifier[] | undefined

  // Decrypt summary tier
  if (raw.encryptedSummary && raw.summaryEnvelopes?.length) {
    const plaintext = await decryptMessage(raw.encryptedSummary, raw.summaryEnvelopes)
    if (plaintext) {
      canDecrypt = true
      try {
        const summary = JSON.parse(plaintext) as DirectoryContactSummary
        displayName = summary.displayName || displayName
        if (summary.contactType) {
          contactType = summary.contactType as DirectoryContactType
        }
        tags = summary.tags ?? []
      } catch { /* malformed JSON */ }
    }
  }

  // Use contactTypeHash as fallback
  if (!canDecrypt && raw.contactTypeHash) {
    contactType = raw.contactTypeHash as DirectoryContactType
  }

  // Decrypt PII tier
  if (raw.encryptedPII && raw.piiEnvelopes?.length) {
    const piiPlaintext = await decryptMessage(raw.encryptedPII, raw.piiEnvelopes)
    if (piiPlaintext) {
      try {
        const pii = JSON.parse(piiPlaintext) as ContactPII
        if (pii.demographics) {
          demographics = typeof pii.demographics === 'string'
            ? pii.demographics
            : JSON.stringify(pii.demographics)
        }
        if (pii.emergencyContacts) {
          emergencyContacts = JSON.stringify(pii.emergencyContacts)
        }
        if (pii.communicationPreferences) {
          communicationPrefs = JSON.stringify(pii.communicationPreferences)
        }
        notes = pii.notes
        if (pii.identifiers?.length) {
          identifiers = pii.identifiers.map((ident, i) => ({
            id: `${raw.id}-ident-${i}`,
            type: ident.type as 'phone' | 'email' | 'signal',
            value: ident.value,
            isPrimary: ident.isPrimary,
          }))
        }
      } catch { /* malformed JSON */ }
    }
  }

  return {
    id: raw.id,
    displayName,
    contactType,
    tags,
    caseCount: raw.caseCount,
    lastInteractionAt: raw.lastInteractionAt || null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    canDecrypt,
    demographics,
    emergencyContacts,
    communicationPrefs,
    notes,
    identifiers,
    _raw: raw,
  }
}

function ContactDirectoryPage() {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [contacts, setContacts] = useState<DirectoryContact[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedContact, setSelectedContact] = useState<DirectoryContact | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Filter state
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Load + decrypt contacts
  const loadContacts = useCallback(async () => {
    setLoading(true)
    try {
      const params: {
        limit?: number
        contactTypeHash?: string
      } = { limit: 50 }
      if (typeFilter !== 'all') {
        params.contactTypeHash = typeFilter
      }
      const res = await listRawContacts(params)
      // Client-side decryption of each contact
      const decrypted = await Promise.all(res.contacts.map(decryptContact))
      setContacts(decrypted)
      setTotal(res.total)
    } catch {
      toast(t('contactDirectory.loadError', { defaultValue: 'Failed to load contacts' }), 'error')
    } finally {
      setLoading(false)
    }
  }, [typeFilter, t, toast])

  useEffect(() => { loadContacts() }, [loadContacts])

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }

    if (!value.trim()) {
      setIsSearching(false)
      loadContacts()
      return
    }

    setIsSearching(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await searchRawContacts(value.trim())
        const decrypted = await Promise.all(res.contacts.map(decryptContact))
        setContacts(decrypted)
        setTotal(decrypted.length)
      } catch {
        // Clear contacts on search failure so the no-results message is shown
        setContacts([])
        setTotal(0)
        toast(t('contactDirectory.searchError', { defaultValue: 'Search failed' }), 'error')
      } finally {
        setIsSearching(false)
      }
    }, 300)
  }, [loadContacts, t, toast])

  // Load full contact detail when selected
  useEffect(() => {
    if (!selectedId) {
      setSelectedContact(null)
      return
    }

    // Use the list version first for instant display
    const listContact = contacts.find(c => c.id === selectedId)
    if (listContact) {
      setSelectedContact(listContact)
    }

    setDetailLoading(true)
    getRawContact(selectedId)
      .then(async (raw) => {
        const decrypted = await decryptContact(raw as unknown as RawContact)
        setSelectedContact(decrypted)
      })
      .catch(() => {
        toast(t('contactDirectory.detailError', { defaultValue: 'Failed to load contact details' }), 'error')
      })
      .finally(() => setDetailLoading(false))
  }, [selectedId, contacts, t, toast])

  const handleContactCreated = useCallback((contact: DirectoryContact) => {
    setContacts(prev => [contact, ...prev])
    setTotal(prev => prev + 1)
    setSelectedId(contact.id)
  }, [])

  const showEmptyState = !loading && contacts.length === 0 && !searchQuery

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">
            {t('contactDirectory.title', { defaultValue: 'Contact Directory' })}
          </h1>
          {total > 0 && (
            <Badge variant="secondary" className="text-xs">
              {total}
            </Badge>
          )}
        </div>
        <Button size="sm" data-testid="new-contact-btn" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t('contactDirectory.new', { defaultValue: 'New Contact' })}
        </Button>
      </div>

      {showEmptyState ? (
        <Card data-testid="empty-state">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {t('contactDirectory.noContacts', { defaultValue: 'No contacts in the directory' })}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('contactDirectory.noContactsHint', { defaultValue: 'Contacts are created automatically from incoming calls, or you can add them manually.' })}
            </p>
            <Button
              size="sm"
              className="mt-4"
              data-testid="empty-state-create-btn"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('contactDirectory.new', { defaultValue: 'New Contact' })}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex h-[calc(100vh-12rem)] gap-4">
          {/* Groups sidebar */}
          <div className="w-40 shrink-0 overflow-hidden rounded-lg border border-border bg-card hidden lg:flex flex-col">
            <AffinityGroupsSidebar
              selectedGroupId={selectedGroupId}
              onGroupSelect={setSelectedGroupId}
            />
          </div>

          {/* Left pane: contact list */}
          <div
            data-testid="contact-list"
            className="w-80 shrink-0 overflow-y-auto rounded-lg border border-border bg-card md:block"
          >
            {/* Search + filters */}
            <div className="sticky top-0 z-10 border-b border-border bg-card p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  data-testid="contact-search-input"
                  placeholder={t('contactDirectory.searchPlaceholder', { defaultValue: 'Search contacts...' })}
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Search indicator */}
              {isSearching && (
                <div data-testid="search-indicator" className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  {t('contactDirectory.searchingSecurely', { defaultValue: 'Searching securely...' })}
                </div>
              )}

              {/* Type filter */}
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setSearchQuery('') }}>
                <SelectTrigger data-testid="contact-type-filter" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('contactDirectory.allTypes', { defaultValue: 'All types' })}
                  </SelectItem>
                  <SelectItem value="individual">
                    {t('contactDirectory.typeIndividual', { defaultValue: 'Individual' })}
                  </SelectItem>
                  <SelectItem value="organization">
                    {t('contactDirectory.typeOrganization', { defaultValue: 'Organization' })}
                  </SelectItem>
                  <SelectItem value="legal_resource">
                    {t('contactDirectory.typeLegalResource', { defaultValue: 'Legal Resource' })}
                  </SelectItem>
                  <SelectItem value="service_provider">
                    {t('contactDirectory.typeServiceProvider', { defaultValue: 'Service Provider' })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Contact list */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Search className="h-6 w-6 mb-2 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery
                    ? t('contactDirectory.noSearchResults', { defaultValue: 'No contacts match your search.' })
                    : t('contactDirectory.noFilterResults', { defaultValue: 'No contacts match the selected filter.' })}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {contacts.map(contact => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedId === contact.id}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right pane: contact detail */}
          <div
            data-testid="contact-detail"
            className="flex flex-1 flex-col rounded-lg border border-border bg-card overflow-hidden"
          >
            {selectedContact ? (
              detailLoading ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  {selectedContact.canDecrypt && (
                    <div className="flex justify-end px-3 pt-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setShowEditDialog(true)}
                        data-testid="edit-contact-button"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t('common.edit', { defaultValue: 'Edit' })}
                      </Button>
                    </div>
                  )}
                  <ContactProfile contact={selectedContact} />
                </div>
              )
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
                <Users className="h-10 w-10 mb-3" />
                <p>{t('contactDirectory.selectContact', { defaultValue: 'Select a contact to view details' })}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <CreateContactDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleContactCreated}
      />

      {selectedContact && (
        <EditContactDialog
          contact={selectedContact}
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          onUpdated={(raw) => {
            setContacts(prev => prev.map(c => c.id === raw.id ? { ...c, _raw: raw } : c))
          }}
        />
      )}
    </div>
  )
}
