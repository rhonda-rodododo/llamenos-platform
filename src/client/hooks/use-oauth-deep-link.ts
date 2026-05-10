import { useEffect, useCallback } from 'react'

/**
 * Hook to handle OAuth deep link callbacks.
 * Supports both Tauri deep links (llamenos://oauth/callback) and
 * web-based OAuth redirects (window.location.search params).
 */
export function useOAuthDeepLinkHandler() {

  const handleOAuthCallback = useCallback(
    (url: string) => {
      try {
        const parsed = new URL(url)

        // Validate the callback origin — only accept expected schemes
        const allowedProtocols = ['llamenos:', 'http:', 'https:']
        if (!allowedProtocols.includes(parsed.protocol)) {
          return // Reject unexpected origins
        }

        const status = parsed.searchParams.get('status')
        const message = parsed.searchParams.get('message')

        if (status === 'success') {
          // Dispatch custom event so OAuthConnectButton can update state
          window.dispatchEvent(new CustomEvent('oauth-callback-success', { detail: { url } }))
        } else if (status === 'error') {
          window.dispatchEvent(
            new CustomEvent('oauth-callback-error', {
              detail: { error: message || 'OAuth authorization failed' },
            }),
          )
        }
      } catch {
        // Invalid URL — ignore
      }
    },
    [],
  )

  useEffect(() => {
    // Handle web-based OAuth redirects (current window URL)
    const params = new URLSearchParams(window.location.search)
    if (params.has('status')) {
      handleOAuthCallback(window.location.href)
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    // Listen for Tauri deep link events if available
    const handleDeepLink = (event: Event) => {
      const customEvent = event as CustomEvent<{ url: string }>
      if (customEvent.detail?.url) {
        handleOAuthCallback(customEvent.detail.url)
      }
    }

    window.addEventListener('tauri://deeplink', handleDeepLink)
    window.addEventListener('oauth-callback', handleDeepLink as EventListener)

    return () => {
      window.removeEventListener('tauri://deeplink', handleDeepLink)
      window.removeEventListener('oauth-callback', handleDeepLink as EventListener)
    }
  }, [handleOAuthCallback])

  return { handleOAuthCallback }
}
