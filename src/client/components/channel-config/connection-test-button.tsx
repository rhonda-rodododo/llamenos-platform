import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { testMessagingChannel } from '@/lib/api'

interface ConnectionTestButtonProps {
  channel: string
  disabled?: boolean
}

export function ConnectionTestButton({ channel, disabled }: ConnectionTestButtonProps) {
  const { t } = useTranslation()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testMessagingChannel(channel)
      setTestResult(res.connected)
    } catch {
      setTestResult(false)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={handleTest} disabled={disabled || testing} data-testid={`test-${channel}-btn`}>
        {testing ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> {t('channels.shared.testing')}</>
        ) : (
          t('channels.shared.testConnection')
        )}
      </Button>
      {testResult !== null && (
        <Badge variant="outline" className={testResult ? 'text-green-600' : 'text-red-600'}>
          {testResult ? (
            <><CheckCircle2 className="h-3 w-3" /> {t('channels.shared.testSuccess')}</>
          ) : (
            <><XCircle className="h-3 w-3" /> {t('channels.shared.testFailed')}</>
          )}
        </Badge>
      )}
    </div>
  )
}
