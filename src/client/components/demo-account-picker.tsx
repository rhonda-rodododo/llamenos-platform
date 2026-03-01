import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import * as keyManager from '@/lib/key-manager'
import { Shield, Users, UserCog, FileText, LogIn, Info } from 'lucide-react'

const DEMO_PIN = '000000'

const roleIcons: Record<string, typeof Shield> = {
  'role-super-admin': UserCog,
  'role-hub-admin': UserCog,
  'role-volunteer': Users,
  'role-reporter': FileText,
}

const roleColors: Record<string, string> = {
  'role-super-admin': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'role-hub-admin': 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  'role-volunteer': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  'role-reporter': 'bg-green-500/10 text-green-600 dark:text-green-400',
}

interface DemoAccount {
  pubkey: string
  name: string
  description: string
  roleIds: string[]
  nsec: string
}

export function DemoAccountPicker() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [loadingPubkey, setLoadingPubkey] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<DemoAccount[]>([])

  // Dynamic import: nsec values are only fetched when this component mounts (demo mode active)
  useEffect(() => {
    import('@/lib/demo-accounts').then(({ getDemoAccountsWithNsec }) => {
      setAccounts(getDemoAccountsWithNsec())
    })
  }, [])

  async function handleDemoLogin(nsec: string, pubkey: string) {
    setLoadingPubkey(pubkey)
    try {
      // Import key with demo PIN so it persists in local storage
      await keyManager.importKey(nsec, DEMO_PIN)
      // Disable auto-lock in demo mode — frequent tab switches shouldn't force re-login
      keyManager.disableAutoLock()
      await signIn(nsec)
      navigate({ to: '/' })
    } catch {
      setLoadingPubkey(null)
    }
  }

  if (accounts.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-2 text-muted-foreground">
            {t('demo.tryDemo', { defaultValue: 'Try the demo' })}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 space-y-2">
        <p className="text-sm font-medium text-center">
          {t('demo.pickAccount', { defaultValue: 'Pick a demo account to explore' })}
        </p>

        <div className="space-y-1.5">
          {accounts.map((account) => {
            const primaryRoleId = account.roleIds[0] || ''
            const Icon = roleIcons[primaryRoleId] || Shield
            const colorClass = roleColors[primaryRoleId] || ''
            const isLoading = loadingPubkey === account.pubkey

            return (
              <button
                key={account.pubkey}
                onClick={() => handleDemoLogin(account.nsec, account.pubkey)}
                disabled={loadingPubkey !== null}
                className="flex w-full items-center gap-3 rounded-md border bg-card p-2.5 text-left transition-colors hover:bg-accent disabled:opacity-50"
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{account.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{account.description}</p>
                </div>
                <div className="shrink-0">
                  {isLoading ? (
                    <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
                  ) : (
                    <LogIn className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3 w-3" />
          {t('demo.resetNotice', { defaultValue: 'Demo data resets daily' })}
        </p>
      </div>
    </div>
  )
}
