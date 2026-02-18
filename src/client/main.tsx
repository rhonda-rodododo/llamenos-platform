import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { AuthProvider } from '@/lib/auth'
import { ConfigProvider } from '@/lib/config'
import { ThemeProvider } from '@/lib/theme'
import { ToastProvider } from '@/lib/toast'
import { NoteSheetProvider } from '@/lib/note-sheet-context'
import '@/lib/i18n'
import '@/app.css'

const router = createRouter({ routeTree })

// Expose router for E2E test navigation (avoids full page reloads)
if (typeof window !== 'undefined') {
  ;(window as any).__TEST_ROUTER = router
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
