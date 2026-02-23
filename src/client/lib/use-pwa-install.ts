import { useState, useEffect, useCallback, useRef } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePwaInstall() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  )

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setCanInstall(true)
    }

    function onAppInstalled() {
      deferredPrompt.current = null
      setCanInstall(false)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onAppInstalled)

    // Listen for display mode changes
    const mq = window.matchMedia('(display-mode: standalone)')
    const onMqChange = (e: MediaQueryListEvent) => setIsInstalled(e.matches)
    mq.addEventListener('change', onMqChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onAppInstalled)
      mq.removeEventListener('change', onMqChange)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    const prompt = deferredPrompt.current
    if (!prompt) return false

    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      deferredPrompt.current = null
      setCanInstall(false)
    }
    return outcome === 'accepted'
  }, [])

  return { canInstall, isInstalled, promptInstall }
}
