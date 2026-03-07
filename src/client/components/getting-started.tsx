import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useConfig } from '@/lib/config'
import { listVolunteers, listShifts } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2, Circle, Rocket, Users, Clock, Phone, FileText,
  ChevronDown, X,
} from 'lucide-react'

interface ChecklistItem {
  id: string
  label: string
  description: string
  done: boolean
  href: string
}

export function GettingStartedChecklist() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setupCompleted, hotlineNumber, channels } = useConfig()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('getting-started-dismissed') === 'true'
    } catch {
      return false
    }
  })
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    async function check() {
      let hasVolunteers = false
      let hasShifts = false

      try {
        const [volRes, shiftRes] = await Promise.all([listVolunteers(), listShifts()])
        hasVolunteers = volRes.volunteers.length > 1 // > 1 because admin counts as a volunteer
        hasShifts = shiftRes.shifts.length > 0
      } catch {
        // API might fail if not authed yet
      }

      const checklist: ChecklistItem[] = [
        {
          id: 'setup',
          label: t('gettingStarted.setupWizard', { defaultValue: 'Complete setup wizard' }),
          description: t('gettingStarted.setupWizardDesc', { defaultValue: 'Configure your hotline name, channels, and providers.' }),
          done: setupCompleted,
          href: '/setup',
        },
        {
          id: 'volunteers',
          label: t('gettingStarted.inviteVolunteers', { defaultValue: 'Invite volunteers' }),
          description: t('gettingStarted.inviteVolunteersDesc', { defaultValue: 'Add team members who will answer calls and respond to reports.' }),
          done: hasVolunteers,
          href: '/volunteers',
        },
        {
          id: 'shifts',
          label: t('gettingStarted.createShifts', { defaultValue: 'Create shift schedule' }),
          description: t('gettingStarted.createShiftsDesc', { defaultValue: 'Set up recurring shifts so calls are routed to available volunteers.' }),
          done: hasShifts,
          href: '/shifts',
        },
        {
          id: 'provider',
          label: t('gettingStarted.configureProvider', { defaultValue: 'Configure telephony' }),
          description: t('gettingStarted.configureProviderDesc', { defaultValue: 'Set up your telephony provider to enable voice calls and SMS.' }),
          done: !!hotlineNumber,
          href: '/admin/settings',
        },
      ]

      // Only show reports task if reports channel is enabled
      if (channels?.reports) {
        checklist.push({
          id: 'reports',
          label: t('gettingStarted.enableReports', { defaultValue: 'Reports channel ready' }),
          description: t('gettingStarted.enableReportsDesc', { defaultValue: 'The reports channel is enabled. Reporters can submit encrypted reports.' }),
          done: true,
          href: '/reports',
        })
      }

      setItems(checklist)
      setLoading(false)
    }

    check()
  }, [setupCompleted, hotlineNumber, channels, t])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem('getting-started-dismissed', 'true')
    } catch { /* ignore */ }
  }, [])

  if (dismissed || loading) return null

  const completedCount = items.filter(i => i.done).length
  const allDone = completedCount === items.length

  // Don't show if everything is done
  if (allDone) return null

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4 text-primary" />
            {t('gettingStarted.title', { defaultValue: 'Getting Started' })}
            <span className="text-xs font-normal text-muted-foreground">
              {completedCount}/{items.length}
            </span>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" onClick={() => setCollapsed(prev => !prev)} aria-label={collapsed ? t('settings.expand', { defaultValue: 'Expand' }) : t('settings.collapse', { defaultValue: 'Collapse' })}>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={handleDismiss} aria-label={t('common.close')}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 rounded-full bg-primary/10">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(completedCount / items.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate({ to: item.href })}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate({ to: item.href }) } }}
                className={`flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition-colors ${
                  item.done
                    ? 'opacity-60'
                    : 'hover:bg-primary/10'
                }`}
              >
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <p className={`text-sm font-medium ${item.done ? 'line-through' : ''}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
