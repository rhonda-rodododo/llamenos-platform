import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { AuthProvider } from '@/lib/auth'
import { ConfigProvider } from '@/lib/config'
import { ThemeProvider } from '@/lib/theme'
import { ToastProvider } from '@/lib/toast'
import { NoteSheetProvider } from '@/lib/note-sheet-context'
import { installGlobalErrorHandlers, uploadPendingReports, isCrashReportingEnabled } from '@/lib/crash-reporting'
import '@/lib/i18n'
import '@/app.css'

// Install global error handlers for crash reporting (respects consent)
installGlobalErrorHandlers()

// Upload any pending crash reports from previous sessions
if (isCrashReportingEnabled()) {
  uploadPendingReports().catch(() => {
    // Silently fail — will retry on next page load
  })
}

const router = createRouter({ routeTree })

// Expose router and key-manager for E2E test navigation
declare global {
  interface Window {
    __TEST_ROUTER: typeof router
    __TEST_KEY_MANAGER: typeof import('./lib/key-manager')
    __TEST_PLATFORM: typeof import('./lib/platform')
  }
}
if (typeof window !== 'undefined') {
  window.__TEST_ROUTER = router
  import('./lib/key-manager').then(km => {
    window.__TEST_KEY_MANAGER = km
  })
  import('./lib/platform').then(p => {
    window.__TEST_PLATFORM = p
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ConfigProvider>
        <ToastProvider>
          <AuthProvider>
            <NoteSheetProvider>
              <RouterProvider router={router} />
            </NoteSheetProvider>
          </AuthProvider>
        </ToastProvider>
      </ConfigProvider>
    </ThemeProvider>
  </StrictMode>,
)
