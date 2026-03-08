import { Component, type ReactNode, type ErrorInfo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RotateCcw, Send } from 'lucide-react'
import { captureError, isCrashReportingEnabled, getPendingReportCount } from '@/lib/crash-reporting'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional fallback UI. If not provided, uses default error card. */
  fallback?: ReactNode
  /** Scope label for logging (e.g. "notes", "calls") */
  scope?: string
}

interface ErrorBoundaryState {
  error: Error | null
  reported: boolean
}

/**
 * React error boundary that catches render errors and displays a recovery UI.
 * Without this, any component crash takes down the entire app with a blank screen.
 *
 * When crash reporting is enabled, errors are automatically captured and queued
 * for upload to the configured GlitchTip/Sentry endpoint.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, reported: false }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const scope = this.props.scope || 'unknown'
    console.error(`[ErrorBoundary:${scope}]`, error, info.componentStack)

    // Capture the error for crash reporting (respects consent)
    captureError(error, {
      componentStack: info.componentStack ?? undefined,
      scope,
    })
    this.setState({ reported: true })
  }

  handleReset = () => {
    this.setState({ error: null, reported: false })
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
          reported={this.state.reported}
        />
      )
    }
    return this.props.children
  }
}

function ErrorFallback({
  error,
  onReset,
  reported,
}: {
  error: Error
  onReset: () => void
  reported: boolean
}) {
  const { t } = useTranslation()
  const crashReportingEnabled = isCrashReportingEnabled()
  const pendingCount = getPendingReportCount()

  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-8">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div className="text-center">
        <h3 className="text-lg font-semibold">
          {t('error.boundary.title', { defaultValue: 'Something went wrong' })}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('error.boundary.description', {
            defaultValue:
              'An unexpected error occurred. You can try again or navigate to another page.',
          })}
        </p>
        <pre className="mt-3 max-w-md overflow-auto rounded bg-muted p-2 text-left text-xs">
          {error.message}
        </pre>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onReset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('error.boundary.retry', { defaultValue: 'Try again' })}
        </Button>
      </div>
      {reported && crashReportingEnabled && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Send className="h-3 w-3" />
          {t('crashReporting.reportSent', { defaultValue: 'Crash report sent' })}
          {pendingCount > 0 &&
            ` (${pendingCount} ${t('crashReporting.pendingReports', { defaultValue: 'pending' })})`}
        </p>
      )}
    </div>
  )
}
