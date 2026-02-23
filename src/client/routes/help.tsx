import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  HelpCircle, Shield, Phone, FileText, Users, Clock,
  ShieldBan, Search, ChevronDown, ExternalLink, Lock,
  Keyboard, LayoutDashboard, StickyNote, Settings,
} from 'lucide-react'

export const Route = createFileRoute('/help')({
  component: HelpPage,
})

function HelpPage() {
  const { t } = useTranslation()
  const { isAdmin, hasPermission } = useAuth()

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold sm:text-2xl">{t('help.title', { defaultValue: 'Help & Reference' })}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('help.subtitle', { defaultValue: 'Quick guides, frequently asked questions, and keyboard shortcuts.' })}
        </p>
      </div>

      {/* Quick reference cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <QuickRefCard
          icon={<Keyboard className="h-5 w-5" />}
          title={t('help.shortcutsCard', { defaultValue: 'Keyboard Shortcuts' })}
          items={[
            { label: t('help.shortcutPalette', { defaultValue: 'Command palette' }), value: 'Ctrl+K' },
            { label: t('help.shortcutNewNote', { defaultValue: 'New note' }), value: 'Alt+N' },
            { label: t('help.shortcutSaveNote', { defaultValue: 'Save note' }), value: 'Ctrl+Enter' },
            { label: t('help.shortcutBreak', { defaultValue: 'Toggle break' }), value: 'Ctrl+Shift+B' },
            { label: t('help.shortcutHelp', { defaultValue: 'Show shortcuts' }), value: '?' },
          ]}
        />
        <QuickRefCard
          icon={<Shield className="h-5 w-5" />}
          title={t('help.securityCard', { defaultValue: 'Security' })}
          items={[
            { label: t('help.secNotes', { defaultValue: 'Notes' }), value: t('help.secForwardSecret', { defaultValue: 'E2E + forward secrecy' }) },
            { label: t('help.secReports', { defaultValue: 'Reports' }), value: t('help.secE2ee', { defaultValue: 'E2E encrypted' }) },
            { label: t('help.secAuth', { defaultValue: 'Auth' }), value: t('help.secPinLocked', { defaultValue: 'PIN-locked key store' }) },
            { label: t('help.secSessions', { defaultValue: 'Sessions' }), value: t('help.secWebauthn', { defaultValue: 'WebAuthn/passkeys' }) },
          ]}
        />
      </div>

      {/* Role-specific guides */}
      {hasPermission('reports:create') && !isAdmin && !hasPermission('calls:answer') && <ReporterGuide />}
      {isAdmin && <AdminGuide />}
      {(hasPermission('calls:answer') || isAdmin) && <VolunteerGuide />}

      {/* FAQ sections */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('help.faqTitle', { defaultValue: 'Frequently Asked Questions' })}</h2>
        <FaqSection
          title={t('help.faqGettingStarted', { defaultValue: 'Getting Started' })}
          items={[
            {
              q: t('help.faqLoginQ', { defaultValue: 'How do I log in?' }),
              a: t('help.faqLoginA', { defaultValue: 'Enter your 6-digit PIN on the login page to unlock your key store. If you have a passkey set up, you can use that instead. To set up a new device, use the "Link this device" option to scan a QR code from your primary device.' }),
            },
            {
              q: t('help.faqKeyQ', { defaultValue: 'What is my secret key and where do I find it?' }),
              a: t('help.faqKeyA', { defaultValue: 'Your key is stored encrypted on this device, protected by your PIN. During onboarding you received a recovery key — use it to restore access on a new device. You can also link devices via QR code from Settings. Contact your admin if you\'ve lost both your PIN and recovery key.' }),
            },
            {
              q: t('help.faqPwaQ', { defaultValue: 'Can I install this as an app?' }),
              a: t('help.faqPwaA', { defaultValue: 'Yes. In your browser, look for "Install" or "Add to Home Screen" in the menu. The app will install as "Hotline" for security — it doesn\'t reveal the organization name.' }),
            },
          ]}
        />
        <FaqSection
          title={t('help.faqCalls', { defaultValue: 'Calls & Shifts' })}
          items={[
            {
              q: t('help.faqRingQ', { defaultValue: 'Why am I not receiving calls?' }),
              a: t('help.faqRingA', { defaultValue: 'Check that: (1) you\'re on-shift (see your shift schedule), (2) you\'re not on break, (3) you\'re not already on a call, and (4) your browser/phone notifications are enabled.' }),
            },
            {
              q: t('help.faqBreakQ', { defaultValue: 'What does "On Break" do?' }),
              a: t('help.faqBreakA', { defaultValue: 'When on break, incoming calls are not routed to you. Other on-shift volunteers will still receive them. Use the break toggle on your dashboard or press Ctrl+Shift+B.' }),
            },
            {
              q: t('help.faqVoicemailQ', { defaultValue: 'What happens if no one answers?' }),
              a: t('help.faqVoicemailA', { defaultValue: 'If no volunteer answers within the queue timeout, the caller is sent to voicemail (if enabled). Admins can configure the timeout and voicemail settings.' }),
            },
          ]}
        />
        <FaqSection
          title={t('help.faqNotes', { defaultValue: 'Notes & Encryption' })}
          items={[
            {
              q: t('help.faqEncryptQ', { defaultValue: 'Are my notes private?' }),
              a: t('help.faqEncryptA', { defaultValue: 'Yes. Notes are encrypted end-to-end using your keypair before leaving your device. Only you and authorized admins can decrypt them. The server never sees plaintext.' }),
            },
            {
              q: t('help.faqExportQ', { defaultValue: 'Can I export my notes?' }),
              a: t('help.faqExportA', { defaultValue: 'Yes. Go to Notes and use the Export button. Notes are exported encrypted — you\'ll need your secret key to decrypt them.' }),
            },
          ]}
        />
        {isAdmin && (
          <FaqSection
            title={t('help.faqAdmin', { defaultValue: 'Administration' })}
            items={[
              {
                q: t('help.faqInviteQ', { defaultValue: 'How do I add volunteers?' }),
                a: t('help.faqInviteA', { defaultValue: 'Go to Volunteers and click "Invite Volunteer". Choose the role (Volunteer, Admin, or Reporter), fill in their name and phone, and share the invite link. Each invite code is single-use and expires in 7 days.' }),
              },
              {
                q: t('help.faqShiftsQ', { defaultValue: 'How do shifts work?' }),
                a: t('help.faqShiftsA', { defaultValue: 'Create shifts in the Shifts page with a name, time range, and days of the week. Assign volunteers to each shift. When a shift is active, assigned volunteers receive incoming calls via parallel ringing.' }),
              },
              {
                q: t('help.faqSpamQ', { defaultValue: 'How do I deal with spam calls?' }),
                a: t('help.faqSpamA', { defaultValue: 'Three options: (1) Ban specific numbers in the Ban List, (2) Enable Voice CAPTCHA in Admin Settings to require callers to enter digits, (3) Enable Rate Limiting to block repeated calls from the same number.' }),
              },
              {
                q: t('help.faqProviderQ', { defaultValue: 'How do I change the telephony provider?' }),
                a: t('help.faqProviderA', { defaultValue: 'Go to Admin Settings > Telephony Provider. Select your provider, enter credentials, and test the connection before saving. Supported providers: Twilio, SignalWire, Vonage, Plivo, Asterisk.' }),
              },
            ]}
          />
        )}
      </div>

      {/* Navigation quick links */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-muted-foreground" />
            {t('help.quickNav', { defaultValue: 'Quick Navigation' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            {t('help.quickNavDesc', { defaultValue: 'Press Ctrl+K to open the command palette for quick navigation and search.' })}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <NavQuickLink to="/" icon={<LayoutDashboard className="h-3.5 w-3.5" />} label={t('nav.dashboard')} />
            <NavQuickLink to="/notes" icon={<StickyNote className="h-3.5 w-3.5" />} label={t('nav.notes')} />
            <NavQuickLink to="/settings" icon={<Settings className="h-3.5 w-3.5" />} label={t('nav.settings')} />
            {isAdmin && (
              <>
                <NavQuickLink to="/volunteers" icon={<Users className="h-3.5 w-3.5" />} label={t('nav.volunteers')} />
                <NavQuickLink to="/shifts" icon={<Clock className="h-3.5 w-3.5" />} label={t('nav.shifts')} />
                <NavQuickLink to="/bans" icon={<ShieldBan className="h-3.5 w-3.5" />} label={t('nav.banList')} />
                <NavQuickLink to="/admin/settings" icon={<Settings className="h-3.5 w-3.5" />} label={t('nav.hubSettings', { defaultValue: 'Hub Settings' })} />
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function QuickRefCard({ icon, title, items }: {
  icon: React.ReactNode
  title: string
  items: { label: string; value: string }[]
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1.5">
          {items.map(item => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.value}</code>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ReporterGuide() {
  const { t } = useTranslation()
  return (
    <Card className="border-blue-400/30 dark:border-blue-600/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5 text-blue-500" />
          {t('help.reporterGuide', { defaultValue: 'Reporter Guide' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{t('help.reporterIntro', { defaultValue: 'As a reporter, you can submit encrypted reports and communicate with administrators through a secure message thread.' })}</p>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>{t('help.reporterTip1', { defaultValue: 'Click "New" to create a report with a title, category, and details' })}</li>
          <li>{t('help.reporterTip2', { defaultValue: 'Your report details are encrypted end-to-end — only you and admins can read them' })}</li>
          <li>{t('help.reporterTip3', { defaultValue: 'Reply to your own reports to provide updates or additional information' })}</li>
          <li>{t('help.reporterTip4', { defaultValue: 'Attach files to messages — they are encrypted before upload' })}</li>
        </ul>
      </CardContent>
    </Card>
  )
}

function VolunteerGuide() {
  const { t } = useTranslation()
  return (
    <Card className="border-green-400/30 dark:border-green-600/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone className="h-5 w-5 text-green-500" />
          {t('help.volunteerGuide', { defaultValue: 'Volunteer Guide' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{t('help.volunteerIntro', { defaultValue: 'As a volunteer, you answer incoming calls during your assigned shifts and take encrypted notes.' })}</p>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>{t('help.volunteerTip1', { defaultValue: 'Your dashboard shows shift status, active calls, and incoming calls' })}</li>
          <li>{t('help.volunteerTip2', { defaultValue: 'When a call rings, click "Answer" — all on-shift volunteers ring simultaneously, first to answer gets the call' })}</li>
          <li>{t('help.volunteerTip3', { defaultValue: 'Take notes during calls — they\'re encrypted before leaving your device' })}</li>
          <li>{t('help.volunteerTip4', { defaultValue: 'Use "Take a Break" when you need to step away — you won\'t receive calls' })}</li>
          <li>{t('help.volunteerTip5', { defaultValue: 'Report spam calls or ban numbers directly from the active call panel' })}</li>
        </ul>
      </CardContent>
    </Card>
  )
}

function AdminGuide() {
  const { t } = useTranslation()
  return (
    <Card className="border-purple-400/30 dark:border-purple-600/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-5 w-5 text-purple-500" />
          {t('help.adminGuide', { defaultValue: 'Admin Guide' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{t('help.adminIntro', { defaultValue: 'As an admin, you manage volunteers, shifts, call settings, and security features.' })}</p>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>{t('help.adminTip1', { defaultValue: 'Invite volunteers or reporters from the Volunteers page — choose their role when creating the invite' })}</li>
          <li>{t('help.adminTip2', { defaultValue: 'Set up shifts with time ranges and assigned volunteers for automatic call routing' })}</li>
          <li>{t('help.adminTip3', { defaultValue: 'Configure telephony, transcription, CAPTCHA, and rate limiting in Admin Settings' })}</li>
          <li>{t('help.adminTip4', { defaultValue: 'Monitor volunteer status and active calls from your dashboard' })}</li>
          <li>{t('help.adminTip5', { defaultValue: 'Review the Audit Log for a history of all system events' })}</li>
        </ul>
      </CardContent>
    </Card>
  )
}

function FaqSection({ title, items }: { title: string; items: { q: string; a: string }[] }) {
  return (
    <div className="rounded-lg border border-border">
      <h3 className="border-b border-border px-4 py-2.5 text-sm font-medium">{title}</h3>
      <div className="divide-y divide-border">
        {items.map(item => (
          <FaqItem key={item.q} question={item.q} answer={item.a} />
        ))}
      </div>
    </div>
  )
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-accent/50"
      >
        <span className="font-medium">{question}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 text-sm text-muted-foreground">
          {answer}
        </div>
      )}
    </div>
  )
}

function NavQuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
    >
      {icon}
      {label}
    </Link>
  )
}
