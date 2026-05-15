import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { notifyContacts } from '@/lib/api'
import { useToast } from '@/lib/toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Bell } from 'lucide-react'

export interface NotifiableContact {
  id: string
  displayName: string
  recipientHash: string
  availableChannels: Array<'sms' | 'signal' | 'whatsapp' | 'telegram'>
}

interface ContactNotificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recordId: string
  contacts: NotifiableContact[]
  statusLabel: string
  caseNumber?: string
  hubName: string
}

export function ContactNotificationDialog({
  open,
  onOpenChange,
  recordId,
  contacts,
  statusLabel,
  caseNumber,
  hubName,
}: ContactNotificationDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [channels, setChannels] = useState<Record<string, 'sms' | 'signal' | 'whatsapp' | 'telegram'>>({})
  const [sending, setSending] = useState(false)

  // Render message template client-side (E2EE: server never sees rendered message + identity together)
  const renderMessage = useCallback(() => {
    return t('notifications.statusChangeTemplate', {
      defaultValue: 'Your case {{caseNumber}} at {{hubName}} has been updated. New status: {{status}}.',
      caseNumber: caseNumber ?? 'N/A',
      hubName,
      status: statusLabel,
    })
  }, [t, caseNumber, hubName, statusLabel])

  const toggleContact = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSend = useCallback(async () => {
    if (selected.size === 0) return
    setSending(true)
    const message = renderMessage()
    const notifications = Array.from(selected).flatMap(contactId => {
      const contact = contacts.find(c => c.id === contactId)
      if (!contact) return []
      return [{
        recipientHash: contact.recipientHash,
        channel: channels[contactId] ?? contact.availableChannels[0] ?? 'sms',
        message,
      }]
    })
    try {
      await notifyContacts({ recordId, notifications })
      toast(t('notifications.sent', { defaultValue: 'Notifications sent' }), 'success')
      onOpenChange(false)
    } catch {
      toast(t('notifications.sendError', { defaultValue: 'Failed to send notifications' }), 'error')
    } finally {
      setSending(false)
    }
  }, [selected, contacts, channels, recordId, renderMessage, toast, t, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="contact-notification-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('notifications.title', { defaultValue: 'Notify Contacts?' })}</DialogTitle>
          <DialogDescription>
            {t('notifications.description', {
              defaultValue: 'Send a status update to linked contacts. Messages are rendered on your device.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-64 overflow-y-auto">
          <p className="text-xs text-muted-foreground px-1 italic">
            {renderMessage()}
          </p>
          {contacts.map(contact => (
            <div key={contact.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
              <Checkbox
                id={contact.id}
                data-testid="contact-checkbox"
                checked={selected.has(contact.id)}
                onCheckedChange={() => toggleContact(contact.id)}
              />
              <label htmlFor={contact.id} className="flex-1 text-sm cursor-pointer">
                {contact.displayName}
              </label>
              {selected.has(contact.id) && contact.availableChannels.length > 1 && (
                <Select
                  value={channels[contact.id] ?? contact.availableChannels[0]}
                  onValueChange={(v) => setChannels(prev => ({ ...prev, [contact.id]: v as 'sms' | 'signal' | 'whatsapp' | 'telegram' }))}
                >
                  <SelectTrigger className="w-28 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {contact.availableChannels.map(ch => (
                      <SelectItem key={ch} value={ch} className="text-xs">{ch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
          {contacts.length === 0 && (
            <p data-testid="no-contacts" className="text-sm text-muted-foreground text-center py-4">
              {t('notifications.noContacts', { defaultValue: 'No linked contacts found.' })}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('notifications.skip', { defaultValue: 'Skip' })}
          </Button>
          <Button
            data-testid="send-notifications-btn"
            disabled={selected.size === 0 || sending}
            onClick={handleSend}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4 mr-1.5" />}
            {t('notifications.send', { defaultValue: 'Send' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
